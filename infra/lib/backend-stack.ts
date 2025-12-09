import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as path from 'path';

interface BackendStackProps extends cdk.StackProps {
  appName: string;
  stage: string;
  vpc: ec2.IVpc;
  databaseSecret: secretsmanager.ISecret;
  databaseEndpoint: string;
  databaseSecurityGroup: ec2.ISecurityGroup;
  cloudFrontSecret: string;  // CloudFront → API Gateway セキュリティ用シークレット
}

export class BackendStack extends cdk.Stack {
  public readonly apiEndpoint: string;
  public readonly lambdaFunction: lambda.DockerImageFunction;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // Security group for Lambda
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc: props.vpc,
      description: 'Security group for Lambda function',
      allowAllOutbound: true,
    });

    // RDS SGにLambda SGからのアクセスのみ許可
    // 循環参照を避けるため、CfnSecurityGroupIngressを使用
    new ec2.CfnSecurityGroupIngress(this, 'RdsIngressFromLambda', {
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      groupId: props.databaseSecurityGroup.securityGroupId,
      sourceSecurityGroupId: lambdaSg.securityGroupId,
      description: 'Allow PostgreSQL from Lambda only',
    });

    // Lambda function
    this.lambdaFunction = new lambda.DockerImageFunction(this, 'BackendFunction', {
      functionName: `${props.appName}-${props.stage}-api`,
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../backend'),
        {
          file: 'Dockerfile.lambda',
        }
      ),
      memorySize: 1024,  // 512 → 1024 に増加
      timeout: cdk.Duration.seconds(60),  // 30 → 60 に増加
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSg],
      environment: {
        ENVIRONMENT: props.stage,
        // Secret ARNのみ渡し、Lambda内でSecrets Managerから取得
        DATABASE_SECRET_ARN: props.databaseSecret.secretArn,
        DATABASE_HOST: props.databaseEndpoint,
        DATABASE_NAME: 'app',
        // CloudFront → API Gateway セキュリティ用シークレット
        CLOUDFRONT_SECRET: props.cloudFrontSecret,
      },
      logRetention: props.stage === 'prod'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // Grant Lambda access to secrets
    props.databaseSecret.grantRead(this.lambdaFunction);

    // HTTP API Gateway (v2) - ルーティングはLambda(FastAPI)に委譲
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${props.appName}-${props.stage}-api`,
      description: `${props.appName} HTTP API - ${props.stage}`,
      corsPreflight: {
        // 本番ではCloudFrontドメインのみ許可（FrontendStackデプロイ後に更新が必要）
        // 開発では全許可
        allowOrigins: props.stage === 'prod'
          ? ['https://*.cloudfront.net']  // 本番: CloudFrontのみ
          : ['*'],  // 開発: 全許可
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Lambda統合 (プロキシ統合 - 全パスをLambdaに転送)
    const lambdaIntegration = new apigwv2_integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      this.lambdaFunction
    );

    // ワイルドカードルーティング - 全パスをLambda(FastAPI)に転送
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // ルートパス (ヘルスチェック等)
    httpApi.addRoutes({
      path: '/',
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    this.apiEndpoint = httpApi.apiEndpoint;

    // ============================================
    // Phase 2: CloudWatch Alarms (無料枠: 10アラームまで)
    // ============================================

    // Lambda エラーアラーム
    new cloudwatch.Alarm(this, 'LambdaErrorsAlarm', {
      alarmName: `${props.appName}-${props.stage}-lambda-errors`,
      metric: this.lambdaFunction.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Lambda function errors exceeded threshold (5 errors in 5 minutes)',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Lambda 実行時間アラーム (P95が10秒を超えた場合)
    new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
      alarmName: `${props.appName}-${props.stage}-lambda-duration`,
      metric: this.lambdaFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'p95',
      }),
      threshold: 10000, // 10秒 (ミリ秒)
      evaluationPeriods: 2,
      alarmDescription: 'Lambda P95 duration exceeded 10 seconds',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Lambda スロットリングアラーム
    new cloudwatch.Alarm(this, 'LambdaThrottlesAlarm', {
      alarmName: `${props.appName}-${props.stage}-lambda-throttles`,
      metric: this.lambdaFunction.metricThrottles({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Lambda function throttled',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Lambda 同時実行数アラーム
    new cloudwatch.Alarm(this, 'LambdaConcurrencyAlarm', {
      alarmName: `${props.appName}-${props.stage}-lambda-concurrency`,
      metric: this.lambdaFunction.metric('ConcurrentExecutions', {
        period: cdk.Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: 15, // 同時実行数制限(20)の75%で警告
      evaluationPeriods: 2,
      alarmDescription: 'Lambda concurrent executions approaching limit',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ============================================
    // Phase 3: Lambda ウォームアップ (本番環境のみ)
    // ============================================
    if (props.stage === 'prod') {
      new events.Rule(this, 'WarmupRule', {
        ruleName: `${props.appName}-${props.stage}-lambda-warmup`,
        description: 'Keep Lambda warm to reduce cold start latency',
        schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
        targets: [
          new targets.LambdaFunction(this.lambdaFunction, {
            event: events.RuleTargetInput.fromObject({
              httpMethod: 'GET',
              path: '/api/health',
              headers: {
                'X-Warmup': 'true',
              },
            }),
          }),
        ],
      });
    }

    // Note: Lambda 同時実行数制限 (ReservedConcurrentExecutions) は
    // 無料枠アカウントでは設定できないため、コメントアウト
    // アカウントアップグレード後に有効化可能
    // const cfnFunction = this.lambdaFunction.node.defaultChild as lambda.CfnFunction;
    // cfnFunction.reservedConcurrentExecutions = 20;

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiEndpoint,
      description: 'HTTP API Gateway Endpoint',
      exportName: `${props.appName}-${props.stage}-api-endpoint`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: this.lambdaFunction.functionArn,
      description: 'Lambda Function ARN',
      exportName: `${props.appName}-${props.stage}-lambda-arn`,
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      value: httpApi.httpApiId,
      description: 'HTTP API ID',
      exportName: `${props.appName}-${props.stage}-http-api-id`,
    });
  }
}
