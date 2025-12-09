import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import * as path from 'path';

interface FrontendStackProps extends cdk.StackProps {
  appName: string;
  stage: string;
  apiEndpoint: string;  // API Gateway endpoint (Lambda Function URLから変更)
  cloudFrontSecret: string;  // CloudFront → API Gateway セキュリティ用シークレット
}

export class FrontendStack extends cdk.Stack {
  public readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 bucket for static website hosting
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${props.appName}-${props.stage}-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy:
        props.stage === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.stage !== 'prod',
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: props.stage === 'prod',  // 本番のみバージョニング有効
    });

    // CloudFront Origin Access Control (OAC) - OAIからの移行
    // OACはOAIより新しく推奨される方式で、バケットポリシーは自動設定される
    const s3Origin = cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(
      websiteBucket,
      {
        originAccessLevels: [cloudfront.AccessLevel.READ],
      }
    );

    // API Gateway ドメイン抽出
    // API Gateway endpoint format: https://xxxxx.execute-api.region.amazonaws.com
    const apiDomain = cdk.Fn.select(
      2,
      cdk.Fn.split('/', props.apiEndpoint)
    );

    // ============================================
    // Phase 3: 静的アセット用カスタムキャッシュポリシー
    // ============================================
    const staticAssetsCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
      cachePolicyName: `${props.appName}-${props.stage}-static-assets`,
      comment: 'Optimized cache policy for static assets (JS, CSS, images)',
      defaultTtl: cdk.Duration.days(7),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.hours(1),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      // 静的アセットはヘッダー・クエリ・Cookieを無視してキャッシュ効率を最大化
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // Phase 3: カスタムキャッシュポリシーを適用
        cachePolicy: staticAssetsCachePolicy,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new cloudfrontOrigins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            customHeaders: {
              'X-CloudFront-Secret': props.cloudFrontSecret,
            },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enabled: true,
      comment: `${props.appName}-${props.stage} distribution`,
    });

    this.distributionDomainName = distribution.distributionDomainName;

    // Deploy website content
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist')),
      ],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `${props.appName}-${props.stage}-distribution-domain`,
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${this.distributionDomainName}`,
      description: 'CloudFront URL',
      exportName: `${props.appName}-${props.stage}-cloudfront-url`,
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 Bucket Name',
      exportName: `${props.appName}-${props.stage}-bucket-name`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayOrigin', {
      value: apiDomain,
      description: 'API Gateway Domain (CloudFront Origin)',
      exportName: `${props.appName}-${props.stage}-api-origin`,
    });
  }
}
