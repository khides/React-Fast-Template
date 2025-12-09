# Infrastructure Analysis Report

React-Fast-Template インフラストラクチャ分析レポート

## 現在の構成概要

| 要素 | 現状 |
|------|------|
| IaC | AWS CDK v2 (TypeScript) |
| アーキテクチャ | CloudFront → S3/API Gateway → Lambda → RDS |
| VPC | 2 AZ, 3 Subnet Tier (Public/Private Egress/Private Isolated) |
| Lambda | Docker Image (FastAPI + Mangum), 1024MB, 60s timeout |
| RDS | PostgreSQL 15, T3.MICRO, 20GB |
| API Gateway | HTTP API v2 (Lambda Proxy) |

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                         CloudFront (CDN)                        │
├─────────────────────────────────────────────────────────────────┤
│  /* → S3 (Static Assets) | /api/* → API Gateway (Lambda)        │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
    ┌───────▼────────┐            ┌────────────▼──────┐
    │   S3 Bucket    │            │ HTTP API Gateway  │
    │ (Frontend)     │            │  (API Gateway v2) │
    └────────────────┘            └────────────┬──────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Lambda Function    │
                                    │  (Python FastAPI)   │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │ RDS PostgreSQL 15   │
                                    │  (Private Subnet)   │
                                    └─────────────────────┘
```

---

## 修正すべき問題点

### 1. RDS Proxy未使用 - Lambda接続管理の問題

**優先度**: 🔴 Critical

**問題**: Lambda関数は同時実行でデータベース接続を大量に消費する可能性があります。T3.MICROのPostgreSQLは接続数に制限があり(約80接続)、Lambdaの同時実行数がこれを超えると接続エラーが発生します。

**現状**: コードにコメントで「RDS Proxyはアカウントアップグレードが必要」と記載されています。

**推奨対応**:

```typescript
// RDS Proxyを追加 (database-stack.ts)
const proxy = new rds.DatabaseProxy(this, 'RdsProxy', {
  proxyTarget: rds.ProxyTarget.fromInstance(dbInstance),
  secrets: [dbCredentials],
  vpc,
  securityGroups: [dbSecurityGroup],
  requireTLS: true,
  idleClientTimeout: Duration.minutes(30),
});
```

---

### 2. CloudFront → API Gateway間のセキュリティ不足

**優先度**: 🟠 High

**問題**: API Gatewayに直接アクセスが可能です。CloudFrontを経由しないリクエストがLambdaに到達できます。

**推奨対応**:

```typescript
// API GatewayにカスタムヘッダーでCloudFront経由を検証
// backend-stack.ts - Lambda環境変数に追加
CLOUDFRONT_SECRET: 'your-random-secret-header-value'

// frontend-stack.ts - CloudFrontオリジンにカスタムヘッダー追加
customHeaders: [{
  header: 'X-CloudFront-Secret',
  value: 'your-random-secret-header-value',
}]
```

または、AWS WAF + API Gateway Resource Policyを使用してCloudFrontのIPレンジのみを許可する方法もあります。

---

### 3. Lambda Cold Start対策が不十分

**優先度**: 🟠 Medium-High

**問題**: VPC内のLambda + PostgreSQL接続は、コールドスタート時に10-15秒かかることがあります。

**推奨対応**:

```typescript
// Provisioned Concurrencyの追加 (backend-stack.ts)
const alias = new lambda.Alias(this, 'LambdaAlias', {
  aliasName: 'live',
  version: backendFunction.currentVersion,
  provisionedConcurrentExecutions: 2,  // 最低2つのウォームインスタンス
});
```

---

### 4. NAT Gateway コスト最適化

**優先度**: 🟡 Medium

**問題**: NAT Gatewayは約45ドル/月の固定コストが発生します。開発環境では過剰です。

**現状**: 1つのNAT Gatewayを使用中

**推奨対応**:

```typescript
// 開発環境ではNAT Instanceに変更、または
// VPC Endpointを活用してNAT不要にする

// VPC Endpoints追加 (network-stack.ts)
vpc.addGatewayEndpoint('S3Endpoint', {
  service: ec2.GatewayVpcEndpointAwsService.S3,
});
vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
  service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
});
```

---

### 5. Secrets Manager呼び出しの最適化

**優先度**: 🟡 Medium

**問題**: `backend/app/db/session.py`で毎回Secrets Managerを呼び出しています。`@lru_cache`があるものの、Lambda再利用時の効率化が不十分です。

**現状**:

```python
@lru_cache(maxsize=1)
def get_engine() -> Engine:
    database_url = settings.get_database_url()  # ここでSecretsManager呼び出し
```

**推奨対応**:

```python
# settings自体をキャッシュするか、環境変数レベルで解決
# Lambda Extension for Secrets Managerの使用も検討
```

---

### 6. CloudFrontのキャッシュ設定改善

**優先度**: 🟡 Medium

**問題**: APIルート(`/api/*`)はキャッシュ無効化されていますが、S3静的アセットのキャッシュ戦略が最適化されていません。

**推奨対応**:

```typescript
// frontend-stack.ts - 静的アセット用のキャッシュポリシーをカスタマイズ
const staticAssetsCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
  defaultTtl: Duration.days(30),
  maxTtl: Duration.days(365),
  minTtl: Duration.days(1),
  enableAcceptEncodingGzip: true,
  enableAcceptEncodingBrotli: true,
});
```

---

### 7. API Gateway認証・認可の欠如

**優先度**: 🟠 Medium-High

**問題**: API Gatewayに認証機構がありません。本番環境では必須です。

**推奨対応**:

```typescript
// Cognito User Pool + API Gateway Authorizerの追加
const authorizer = new HttpUserPoolAuthorizer('Authorizer', userPool);

httpApi.addRoutes({
  path: '/api/v1/{proxy+}',
  methods: [HttpMethod.ANY],
  integration: new HttpLambdaIntegration('LambdaIntegration', backendFunction),
  authorizer,
});
```

---

### 8. モニタリング・アラームの欠如

**優先度**: 🟡 Medium

**問題**: CloudWatch Alarmsが設定されていません。

**推奨対応**:

```typescript
// backend-stack.ts
new cloudwatch.Alarm(this, 'LambdaErrors', {
  metric: backendFunction.metricErrors(),
  threshold: 1,
  evaluationPeriods: 1,
  alarmDescription: 'Lambda function errors',
});

new cloudwatch.Alarm(this, 'ApiGateway5xx', {
  metric: httpApi.metricServerError(),
  threshold: 5,
  evaluationPeriods: 1,
});
```

---

### 9. RDSバックアップ・復旧設定の強化

**優先度**: 🟢 Low-Medium

**問題**: Point-in-Time Recovery (PITR)が有効ですが、自動スナップショットの保持期間が短い(dev: 1日)。

**推奨対応**:

```typescript
// database-stack.ts - 開発環境でも最低3日は保持
backupRetention: props.stage === 'prod' ? Duration.days(14) : Duration.days(3),

// パフォーマンスインサイトの有効化
enablePerformanceInsights: true,
performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,  // 7日間
```

---

### 10. セキュリティグループのルール整理

**優先度**: 🟢 Low

**問題**: `database-stack.ts`でVPC CIDR全体からの接続を許可するルールがコメントアウトされていますが、将来的に誤って有効化されるリスクがあります。

**推奨対応**: コメントアウトされたセキュリティルールを完全に削除するか、明確なドキュメントを追加。

---

## 優先度別修正リスト

| 優先度 | 項目 | 影響 | 工数 |
|--------|------|------|------|
| 🔴 Critical | RDS Proxy導入 | 接続枯渇防止 | 中 |
| 🟠 High | CloudFront→API Gatewayセキュリティ | 不正アクセス防止 | 低 |
| 🟠 High | API Gateway認証 | セキュリティ強化 | 中 |
| 🟡 Medium | Lambda Provisioned Concurrency | コールドスタート対策 | 低 |
| 🟡 Medium | CloudWatchアラーム | 運用監視 | 低 |
| 🟡 Medium | VPC Endpoint追加 | コスト最適化 | 低 |
| 🟢 Low | キャッシュ最適化 | パフォーマンス | 低 |
| 🟢 Low | バックアップ強化 | 災害復旧 | 低 |

---

## 既に良好に実装されている点

1. **マルチスタック分離**: Network/Database/Backend/Frontendの適切な分離
2. **セキュリティグループ**: Lambda → RDSのみ許可（最小権限）
3. **Secrets Manager統合**: 認証情報のハードコード回避
4. **環境別設定**: prod/devで削除保護、バックアップ期間が異なる
5. **S3 OAI**: パブリックアクセスをブロックしCloudFront経由のみ許可
6. **SPAルーティング対応**: 403/404エラーをindex.htmlにフォールバック

---

## スタック構成

### デプロイ順序

```
NetworkStack
    ↓
DatabaseStack (depends on NetworkStack)
    ↓
BackendStack (depends on DatabaseStack)
    ↓
FrontendStack (depends on BackendStack)
```

### 各スタックの責務

| スタック | リソース | 主な設定 |
|----------|----------|----------|
| NetworkStack | VPC, Subnets, NAT Gateway | 2 AZ, 3 Subnet Tier, 1 NAT |
| DatabaseStack | RDS, Secrets Manager, Security Group | PostgreSQL 15, T3.MICRO, 20GB |
| BackendStack | Lambda, API Gateway, Security Group | Docker Image, 1024MB, HTTP API v2 |
| FrontendStack | S3, CloudFront, BucketDeployment | OAI, Price Class 100, SPA対応 |

---

## 参考: AWS ベストプラクティス

### CloudFront + API Gateway + Lambda + RDS 構成

- **CloudFront**: CDNレイヤーとしてAPI Gateway前段に配置し、レイテンシ削減とキャッシュ
- **API Gateway**: HTTP API v2でコスト効率の良いプロキシ統合
- **Lambda**: RDS Proxyを使用して接続プーリングを効率化
- **RDS**: Private Isolated Subnetに配置し、Lambdaからのみアクセス可能に

### セキュリティ

- VPC内のLambdaからRDSへのアクセスはセキュリティグループで制御
- Secrets Managerで認証情報を管理
- CloudFront OAIでS3への直接アクセスを防止

### パフォーマンス

- Lambda Provisioned Concurrencyでコールドスタート対策
- VPC Endpointでプライベート通信を維持しつつNATコストを削減
- CloudFrontキャッシュで静的アセット配信を最適化

---

*Report generated: 2025-12-09*
