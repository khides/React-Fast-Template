import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

interface DatabaseStackProps extends cdk.StackProps {
  appName: string;
  stage: string;
  vpc: ec2.IVpc;
}

export class DatabaseStack extends cdk.Stack {
  public readonly databaseSecret: secretsmanager.ISecret;
  public readonly databaseEndpoint: string;
  public readonly securityGroup: ec2.ISecurityGroup;
  // RDS Proxy is not available in free tier
  // public readonly rdsProxy: rds.DatabaseProxy;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Security group for RDS
    // Note: インバウンドルールはBackendStackでLambda SGからのみ許可するよう設定
    this.securityGroup = new ec2.SecurityGroup(this, 'DatabaseSG', {
      vpc: props.vpc,
      description: 'Security group for RDS PostgreSQL',
      allowAllOutbound: true,
    });

    // Create database credentials secret
    this.databaseSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `${props.appName}/${props.stage}/database`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });

    // Create RDS PostgreSQL instance
    const database = new rds.DatabaseInstance(this, 'Database', {
      instanceIdentifier: `${props.appName}-${props.stage}-db`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [this.securityGroup],
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      databaseName: 'app',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      multiAz: false,
      autoMinorVersionUpgrade: true,
      // バックアップ保持期間 (無料枠制限: 最大1日)
      // Note: 無料枠では1日を超えるバックアップ保持期間は設定不可
      backupRetention: cdk.Duration.days(1),
      deletionProtection: props.stage === 'prod',
      removalPolicy:
        props.stage === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    this.databaseEndpoint = database.dbInstanceEndpointAddress;

    // ============================================
    // Phase 2: RDS CloudWatch Alarms (無料枠: 10アラームまで)
    // ============================================

    // RDS CPU使用率アラーム
    new cloudwatch.Alarm(this, 'RdsCpuAlarm', {
      alarmName: `${props.appName}-${props.stage}-rds-cpu`,
      metric: database.metricCPUUtilization({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      alarmDescription: 'RDS CPU utilization exceeded 80% for 15 minutes',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // RDS 接続数アラーム (T3.MICROは約80接続が上限)
    new cloudwatch.Alarm(this, 'RdsConnectionsAlarm', {
      alarmName: `${props.appName}-${props.stage}-rds-connections`,
      metric: database.metricDatabaseConnections({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 50, // 上限の約60%で警告
      evaluationPeriods: 2,
      alarmDescription: 'RDS connections approaching limit (50/~80)',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // RDS ストレージ空き容量アラーム
    new cloudwatch.Alarm(this, 'RdsStorageAlarm', {
      alarmName: `${props.appName}-${props.stage}-rds-storage`,
      metric: database.metricFreeStorageSpace({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5 * 1024 * 1024 * 1024, // 5GB (バイト単位)
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      alarmDescription: 'RDS free storage space below 5GB',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // RDS Proxy - Not available in free tier, uncomment when upgrading account
    // this.rdsProxy = new rds.DatabaseProxy(this, 'DatabaseProxy', {
    //   dbProxyName: `${props.appName}-${props.stage}-proxy`,
    //   proxyTarget: rds.ProxyTarget.fromInstance(database),
    //   secrets: [this.databaseSecret],
    //   vpc: props.vpc,
    //   vpcSubnets: {
    //     subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    //   },
    //   securityGroups: [this.securityGroup],
    //   requireTLS: true,
    //   idleClientTimeout: cdk.Duration.minutes(30),
    //   maxConnectionsPercent: 100,
    //   maxIdleConnectionsPercent: 50,
    // });

    // Outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.databaseEndpoint,
      description: 'RDS Database Endpoint',
      exportName: `${props.appName}-${props.stage}-db-endpoint`,
    });

    // RDS Proxy endpoint - uncomment when using RDS Proxy
    // new cdk.CfnOutput(this, 'RdsProxyEndpoint', {
    //   value: this.rdsProxy.endpoint,
    //   description: 'RDS Proxy Endpoint',
    //   exportName: `${props.appName}-${props.stage}-proxy-endpoint`,
    // });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.databaseSecret.secretArn,
      description: 'Database Secret ARN',
      exportName: `${props.appName}-${props.stage}-db-secret-arn`,
    });
  }
}
