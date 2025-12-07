import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

interface BackendStackProps extends cdk.StackProps {
  appName: string;
  stage: string;
  vpc: ec2.IVpc;
  databaseSecret: secretsmanager.ISecret;
  rdsProxy: rds.DatabaseProxy;
}

export class BackendStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // Security group for Lambda
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc: props.vpc,
      description: 'Security group for Lambda function',
      allowAllOutbound: true,
    });

    // Lambda function
    const backendFunction = new lambda.DockerImageFunction(this, 'BackendFunction', {
      functionName: `${props.appName}-${props.stage}-api`,
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../backend'),
        {
          file: 'Dockerfile.lambda',
        }
      ),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSg],
      environment: {
        ENVIRONMENT: props.stage,
        DATABASE_URL: `postgresql://${props.databaseSecret.secretValueFromJson('username').unsafeUnwrap()}:${props.databaseSecret.secretValueFromJson('password').unsafeUnwrap()}@${props.rdsProxy.endpoint}:5432/app`,
        AWS_REGION: this.region,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant Lambda access to secrets
    props.databaseSecret.grantRead(backendFunction);

    // Grant Lambda access to RDS Proxy
    props.rdsProxy.grantConnect(backendFunction, props.databaseSecret.secretValueFromJson('username').unsafeUnwrap());

    // HTTP API Gateway
    const httpApi = new apigateway.HttpApi(this, 'HttpApi', {
      apiName: `${props.appName}-${props.stage}-api`,
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.PUT,
          apigateway.CorsHttpMethod.DELETE,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Lambda integration
    const lambdaIntegration = new apigatewayIntegrations.HttpLambdaIntegration(
      'LambdaIntegration',
      backendFunction
    );

    // Add routes
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/',
      methods: [apigateway.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    this.apiUrl = httpApi.apiEndpoint;

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      description: 'API Gateway URL',
      exportName: `${props.appName}-${props.stage}-api-url`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: backendFunction.functionArn,
      description: 'Lambda Function ARN',
      exportName: `${props.appName}-${props.stage}-lambda-arn`,
    });
  }
}
