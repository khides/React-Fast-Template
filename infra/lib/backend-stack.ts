import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
// import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

interface BackendStackProps extends cdk.StackProps {
  appName: string;
  stage: string;
  vpc: ec2.IVpc;
  databaseSecret: secretsmanager.ISecret;
  databaseEndpoint: string;
  // RDS Proxy - uncomment when upgrading account
  // rdsProxy: rds.DatabaseProxy;
}

export class BackendStack extends cdk.Stack {
  public readonly lambdaFunctionUrl: string;
  public readonly lambdaFunction: lambda.DockerImageFunction;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // Security group for Lambda
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc: props.vpc,
      description: 'Security group for Lambda function',
      allowAllOutbound: true,
    });

    // Note: Lambda can connect to RDS because DatabaseStack allows
    // inbound PostgreSQL from the entire VPC CIDR block

    // Lambda function
    this.lambdaFunction = new lambda.DockerImageFunction(this, 'BackendFunction', {
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
        // Direct RDS connection (without RDS Proxy)
        DATABASE_URL: `postgresql://${props.databaseSecret.secretValueFromJson('username').unsafeUnwrap()}:${props.databaseSecret.secretValueFromJson('password').unsafeUnwrap()}@${props.databaseEndpoint}:5432/app`,
        // RDS Proxy connection - uncomment when upgrading account
        // DATABASE_URL: `postgresql://${props.databaseSecret.secretValueFromJson('username').unsafeUnwrap()}:${props.databaseSecret.secretValueFromJson('password').unsafeUnwrap()}@${props.rdsProxy.endpoint}:5432/app`,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant Lambda access to secrets
    props.databaseSecret.grantRead(this.lambdaFunction);

    // Grant Lambda access to RDS Proxy - uncomment when upgrading account
    // props.rdsProxy.grantConnect(this.lambdaFunction, props.databaseSecret.secretValueFromJson('username').unsafeUnwrap());

    // Lambda Function URL (API Gateway を使わずに直接呼び出し)
    const functionUrl = this.lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE, // 公開 (CloudFront経由でアクセス)
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        maxAge: cdk.Duration.days(1),
      },
    });

    this.lambdaFunctionUrl = functionUrl.url;

    // Outputs
    new cdk.CfnOutput(this, 'LambdaFunctionUrl', {
      value: this.lambdaFunctionUrl,
      description: 'Lambda Function URL',
      exportName: `${props.appName}-${props.stage}-lambda-url`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: this.lambdaFunction.functionArn,
      description: 'Lambda Function ARN',
      exportName: `${props.appName}-${props.stage}-lambda-arn`,
    });
  }
}
