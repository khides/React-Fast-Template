import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
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
    this.securityGroup = new ec2.SecurityGroup(this, 'DatabaseSG', {
      vpc: props.vpc,
      description: 'Security group for RDS PostgreSQL',
      allowAllOutbound: true,
    });

    // Allow inbound PostgreSQL from VPC
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from VPC'
    );

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
      backupRetention: cdk.Duration.days(1),
      deletionProtection: props.stage === 'prod',
      removalPolicy:
        props.stage === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    this.databaseEndpoint = database.dbInstanceEndpointAddress;

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
