# インフラ改善実装プラン

## 概要

AWS CloudFront + API Gateway + Lambda + RDS 構成のベストプラクティスに基づく改善計画。

## 現在のアーキテクチャ

```
CloudFront
├── /* → S3 (静的コンテンツ)
└── /api/* → Lambda Function URL (認証なし) → RDS (直接接続)
```

## 改善後のアーキテクチャ

```
CloudFront
├── /* → S3 (静的コンテンツ)
└── /api/* → HTTP API Gateway → Lambda → RDS
                    │
                    └── スロットリング、ログ、CORS一元管理
```

---

## 改善項目一覧

### Phase 1: セキュリティ改善 (Critical)

| # | 項目 | 現状 | 改善内容 | ファイル |
|---|------|------|----------|----------|
| 1-1 | シークレット平文抽出 | `unsafeUnwrap()` でCDK synth時に露出 | Secret ARNのみ渡し、Lambda内で取得 | backend-stack.ts, config.py, session.py |
| 1-2 | RDS SG過度に緩い | VPC CIDR全体から許可 | Lambda SGからのみ許可 | database-stack.ts, backend-stack.ts |
| 1-3 | Lambda Function URL認証なし | `authType: NONE` | HTTP API Gateway導入 | backend-stack.ts |
| 1-4 | CORS過度に緩い | `allowedOrigins: ['*']` | API GatewayでCloudFrontドメインのみ許可 | backend-stack.ts |

### Phase 2: 信頼性改善 (High)

| # | 項目 | 現状 | 改善内容 | ファイル |
|---|------|------|----------|----------|
| 2-1 | Lambdaタイムアウト | 30秒 | 60秒に増加 | backend-stack.ts |
| 2-2 | Lambdaメモリ | 512MB | 1024MBに増加 | backend-stack.ts |
| 2-3 | ログ保持期間 | 1週間 | 本番1ヶ月、開発1週間 | backend-stack.ts |
| 2-4 | バックアップ保持 | 1日 | 本番7日、開発1日 | database-stack.ts |

### Phase 3: 運用性改善 (Medium)

| # | 項目 | 現状 | 改善内容 | ファイル |
|---|------|------|----------|----------|
| 3-1 | S3バージョニング | 無効 | 本番のみ有効 | frontend-stack.ts |
| 3-2 | Lambda URL抽出 | 文字列分割(脆弱) | API Gateway導入で解消 | frontend-stack.ts |

---

## 実装詳細

### 1-1. シークレット管理の改善

**問題**: CDK synth時にシークレットがCloudFormationテンプレートに平文で出力される

**現在のコード** (`backend-stack.ts`):
```typescript
environment: {
  DATABASE_URL: `postgresql://${props.databaseSecret
    .secretValueFromJson('username').unsafeUnwrap()}:${props.databaseSecret
    .secretValueFromJson('password').unsafeUnwrap()}@${props.databaseEndpoint}:5432/app`,
}
```

**改善後**:
```typescript
environment: {
  DATABASE_SECRET_ARN: props.databaseSecret.secretArn,
  DATABASE_HOST: props.databaseEndpoint,
  DATABASE_NAME: 'app',
}
```

**Python側の変更** (`config.py`):
```python
import boto3
import json
from functools import lru_cache

class Settings(BaseSettings):
    # ... 既存の設定 ...
    DATABASE_SECRET_ARN: str | None = None
    DATABASE_HOST: str | None = None
    DATABASE_NAME: str = "app"

    @property
    def database_url(self) -> str:
        """動的にDATABASE_URLを構築"""
        if self.DATABASE_SECRET_ARN and self.DATABASE_HOST:
            return self._get_database_url_from_secrets()
        return self.DATABASE_URL  # ローカル開発用フォールバック

    @lru_cache
    def _get_database_url_from_secrets(self) -> str:
        client = boto3.client('secretsmanager', region_name=self.AWS_REGION)
        response = client.get_secret_value(SecretId=self.DATABASE_SECRET_ARN)
        secret = json.loads(response['SecretString'])
        return f"postgresql://{secret['username']}:{secret['password']}@{self.DATABASE_HOST}:5432/{self.DATABASE_NAME}"
```

---

### 1-2. RDSセキュリティグループの改善

**問題**: VPC全体からRDSにアクセス可能

**現在のコード** (`database-stack.ts`):
```typescript
this.securityGroup.addIngressRule(
  ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
  ec2.Port.tcp(5432),
  'Allow PostgreSQL from VPC'
);
```

**改善後**: VPC CIDRルールを削除し、BackendStackでLambda SGからのルールを追加

```typescript
// database-stack.ts - インバウンドルールを削除
// セキュリティグループのみ作成し、ルールはBackendStackで追加

// backend-stack.ts - Lambda SGからRDS SGへのルールを追加
props.databaseSecurityGroup.addIngressRule(
  lambdaSg,
  ec2.Port.tcp(5432),
  'Allow PostgreSQL from Lambda only'
);
```

---

### 1-3 & 1-4. HTTP API Gateway導入

**問題**: Lambda Function URLは認証・スロットリング機能がない

**改善後** (`backend-stack.ts`):
```typescript
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

// HTTP API Gateway
const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
  apiName: `${props.appName}-${props.stage}-api`,
  corsPreflight: {
    allowOrigins: props.stage === 'prod'
      ? [`https://${props.cloudFrontDomain}`]  // 本番: CloudFrontのみ
      : ['*'],  // 開発: 全許可
    allowMethods: [
      apigwv2.CorsHttpMethod.GET,
      apigwv2.CorsHttpMethod.POST,
      apigwv2.CorsHttpMethod.PUT,
      apigwv2.CorsHttpMethod.DELETE,
      apigwv2.CorsHttpMethod.OPTIONS,
    ],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: cdk.Duration.days(1),
  },
});

// Lambda統合 (プロキシ - 全パスをLambdaに転送)
const lambdaIntegration = new apigwv2_integrations.HttpLambdaIntegration(
  'LambdaIntegration',
  this.lambdaFunction
);

// ワイルドカードルーティング
httpApi.addRoutes({
  path: '/{proxy+}',
  methods: [apigwv2.HttpMethod.ANY],
  integration: lambdaIntegration,
});

// ルートパス (ヘルスチェック用)
httpApi.addRoutes({
  path: '/',
  methods: [apigwv2.HttpMethod.GET],
  integration: lambdaIntegration,
});
```

**CloudFront側の変更** (`frontend-stack.ts`):
```typescript
// Lambda Function URL → API Gateway エンドポイントに変更
interface FrontendStackProps extends cdk.StackProps {
  appName: string;
  stage: string;
  apiEndpoint: string;  // API Gateway endpoint
}

// API Gatewayドメイン抽出
const apiUrl = cdk.Fn.parseDomainName(props.apiEndpoint);

const apiOrigin = new cloudfrontOrigins.HttpOrigin(apiUrl, {
  protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
});
```

---

### 2-1 & 2-2. Lambda設定改善

```typescript
this.lambdaFunction = new lambda.DockerImageFunction(this, 'BackendFunction', {
  // ...
  memorySize: 1024,  // 512 → 1024
  timeout: cdk.Duration.seconds(60),  // 30 → 60
  // ...
});
```

---

### 2-3. ログ保持期間改善

```typescript
logRetention: props.stage === 'prod'
  ? logs.RetentionDays.ONE_MONTH
  : logs.RetentionDays.ONE_WEEK,
```

---

### 2-4. バックアップ保持期間改善

```typescript
backupRetention: props.stage === 'prod'
  ? cdk.Duration.days(7)
  : cdk.Duration.days(1),
```

---

### 3-1. S3バージョニング有効化

```typescript
const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
  // ...
  versioned: props.stage === 'prod',  // 本番のみ有効
  // ...
});
```

---

## スタック依存関係の変更

**変更前**:
```
NetworkStack → DatabaseStack → BackendStack → FrontendStack
```

**変更後** (循環参照を避けるため):
```
NetworkStack → DatabaseStack → BackendStack → FrontendStack
                     ↓              ↑
              (SGエクスポート) → (SGインポート & ルール追加)
```

---

## 修正対象ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `infra/lib/database-stack.ts` | SG VPC CIDRルール削除、バックアップ保持期間改善 |
| `infra/lib/backend-stack.ts` | API Gateway導入、シークレット管理改善、Lambda設定改善、RDS SGルール追加 |
| `infra/lib/frontend-stack.ts` | API Gateway連携、S3バージョニング追加 |
| `infra/bin/infra.ts` | Props変更に伴う修正 |
| `backend/app/core/config.py` | Secrets Manager連携追加 |
| `backend/app/db/session.py` | 動的DATABASE_URL取得対応 |

---

## 実装手順

### Step 1: バックエンドPython修正
1. `config.py` にSecrets Manager連携を追加
2. `session.py` で動的DATABASE_URL取得に対応

### Step 2: DatabaseStack修正
1. VPC CIDRインバウンドルールを削除
2. バックアップ保持期間を環境別に設定

### Step 3: BackendStack修正
1. HTTP API Gateway追加
2. Lambda Function URL削除
3. シークレット管理をARN方式に変更
4. Lambda設定改善 (メモリ、タイムアウト、ログ保持)
5. RDS SGへのインバウンドルール追加

### Step 4: FrontendStack修正
1. API Gatewayエンドポイント連携
2. S3バージョニング追加

### Step 5: infra.ts修正
1. Props変更に対応

### Step 6: デプロイ & 検証
1. `cdk diff` で変更確認
2. `cdk deploy --all` でデプロイ
3. 動作確認

---

## リスク & 注意事項

1. **API Gatewayエンドポイント変更**: CloudFront経由のAPIパスは変わらないが、内部的にLambda Function URL → API Gatewayに変更
2. **RDS SGルール変更**: 既存のVPC CIDR許可を削除するため、Lambda以外からのDB接続が遮断される
3. **シークレット取得方式変更**: Lambda起動時にSecrets Manager API呼び出しが発生（コールドスタート時に数十ms追加）

---

## 今後の改善 (Phase 4以降)

- [ ] RDS Proxy有効化 (アカウントアップグレード後)
- [ ] Multi-AZ RDS (本番環境)
- [ ] CloudWatchアラーム追加
- [ ] WAF追加 (API保護)
- [ ] カスタムドメイン + ACM証明書
