import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

interface NetworkStackProps extends cdk.StackProps {
  appName: string;
  stage: string;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const subnetConfiguration = [
      {
        cidrMask: 24,
        name: 'Public',
        subnetType: ec2.SubnetType.PUBLIC,
      },
      {
        cidrMask: 24,
        name: 'Private',
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      {
        cidrMask: 24,
        name: 'Isolated',
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    ];

    if (props.stage === 'prod') {
      // 本番環境: NAT Gateway（高可用性）
      this.vpc = new ec2.Vpc(this, 'VPC', {
        vpcName: `${props.appName}-${props.stage}-vpc`,
        maxAzs: 2,
        natGateways: 1,
        subnetConfiguration,
      });
    } else {
      // 開発環境: NAT Instance（コスト削減: $45/月 → ~$8/月）
      // NatInstanceProviderV2を使用してCDKネイティブでNAT Instanceを管理
      const natInstanceProvider = ec2.NatProvider.instanceV2({
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
        machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      });

      this.vpc = new ec2.Vpc(this, 'VPC', {
        vpcName: `${props.appName}-${props.stage}-vpc`,
        maxAzs: 2,
        natGatewayProvider: natInstanceProvider,
        natGateways: 1, // NAT Instance 1台
        subnetConfiguration,
      });

      // NAT Instance Security Groupの設定
      natInstanceProvider.securityGroup.addIngressRule(
        ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
        ec2.Port.allTraffic(),
        'Allow all traffic from VPC'
      );
    }

    // Output VPC ID
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${props.appName}-${props.stage}-vpc-id`,
    });
  }
}
