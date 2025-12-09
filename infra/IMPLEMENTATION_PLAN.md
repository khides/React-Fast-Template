# Infrastructure Implementation Plan

コストを考慮したインフラ修正実装プラン

## 概要

本プランは**追加コストを最小限に抑えつつ**、セキュリティと運用品質を向上させることを目的とします。

### コスト方針

- **Phase 1-2**: 無料で実施可能な改善
- **Phase 3**: 低コストまたは無料枠内の改善
- **Phase 4**: 本番トラフィック増加時に検討（有料）

---

## Phase 1: セキュリティ強化（無料）

**目標**: 不正アクセス防止、基本的なセキュリティ確保
**コスト**: $0/月
**工数**: 1-2時間

### 1.1 CloudFront → API Gateway セキュリティ

API Gatewayへの直接アクセスを防止し、CloudFront経由のみ許可。

#### 実装内容

**infra/lib/frontend-stack.ts** - CloudFrontにカスタムヘッダー追加:

```typescript
// API Gateway オリジンの設定を変更
const apiOrigin = new origins.HttpOrigin(apiDomain, {
  protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
  customHeaders: {
    'X-CloudFront-Secret': process.env.CLOUDFRONT_SECRET || 'your-secret-value-here',
  },
});
```

**infra/lib/backend-stack.ts** - Lambda環境変数に追加:

```typescript
environment: {
  // 既存の環境変数...
  CLOUDFRONT_SECRET: process.env.CLOUDFRONT_SECRET || 'your-secret-value-here',
},
```

**backend/app/main.py** - ミドルウェアでヘッダー検証:

```python
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

class CloudFrontValidationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # ヘルスチェックはスキップ
        if request.url.path.startswith("/api/health"):
            return await call_next(request)

        # 本番環境でのみ検証
        if settings.ENVIRONMENT in ("prod", "production"):
            expected_secret = os.getenv("CLOUDFRONT_SECRET")
            actual_secret = request.headers.get("X-CloudFront-Secret")
            if expected_secret and actual_secret != expected_secret:
                raise HTTPException(status_code=403, detail="Direct access not allowed")

        return await call_next(request)

app.add_middleware(CloudFrontValidationMiddleware)
```

### 1.2 セキュリティグループルール整理

**infra/lib/database-stack.ts** - コメントアウトされた危険なルールを削除:

```typescript
// 以下のコメントアウトされたコードを完全に削除
// dbSecurityGroup.addIngressRule(
//   ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
//   ec2.Port.tcp(5432),
//   'Allow PostgreSQL from VPC'
// );
```

---

## Phase 2: 運用監視強化（無料）

**目標**: 障害の早期検知、運用可視化
**コスト**: $0/月（10アラームまで無料）
**工数**: 1-2時間

### 2.1 CloudWatch Alarms 追加

**infra/lib/backend-stack.ts** に追加:

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';

// SNSトピック作成（アラート通知用）
const alertTopic = new sns.Topic(this, 'AlertTopic', {
  topicName: `${props.appName}-${props.stage}-alerts`,
});

// Lambda エラーアラーム
new cloudwatch.Alarm(this, 'LambdaErrorsAlarm', {
  alarmName: `${props.appName}-${props.stage}-lambda-errors`,
  metric: backendFunction.metricErrors({
    period: Duration.minutes(5),
  }),
  threshold: 5,
  evaluationPeriods: 1,
  alarmDescription: 'Lambda function errors exceeded threshold',
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});

// Lambda 実行時間アラーム
new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
  alarmName: `${props.appName}-${props.stage}-lambda-duration`,
  metric: backendFunction.metricDuration({
    period: Duration.minutes(5),
    statistic: 'p95',
  }),
  threshold: 10000, // 10秒
  evaluationPeriods: 2,
  alarmDescription: 'Lambda p95 duration exceeded 10 seconds',
});

// Lambda スロットリングアラーム
new cloudwatch.Alarm(this, 'LambdaThrottlesAlarm', {
  alarmName: `${props.appName}-${props.stage}-lambda-throttles`,
  metric: backendFunction.metricThrottles({
    period: Duration.minutes(5),
  }),
  threshold: 1,
  evaluationPeriods: 1,
  alarmDescription: 'Lambda function throttled',
});

// Lambda 同時実行数アラーム
new cloudwatch.Alarm(this, 'LambdaConcurrencyAlarm', {
  alarmName: `${props.appName}-${props.stage}-lambda-concurrency`,
  metric: backendFunction.metric('ConcurrentExecutions', {
    period: Duration.minutes(1),
    statistic: 'Maximum',
  }),
  threshold: 50,
  evaluationPeriods: 2,
  alarmDescription: 'Lambda concurrent executions high',
});
```

**infra/lib/database-stack.ts** に追加:

```typescript
// RDS CPU使用率アラーム
new cloudwatch.Alarm(this, 'RdsCpuAlarm', {
  alarmName: `${props.appName}-${props.stage}-rds-cpu`,
  metric: dbInstance.metricCPUUtilization({
    period: Duration.minutes(5),
  }),
  threshold: 80,
  evaluationPeriods: 3,
  alarmDescription: 'RDS CPU utilization exceeded 80%',
});

// RDS 接続数アラーム
new cloudwatch.Alarm(this, 'RdsConnectionsAlarm', {
  alarmName: `${props.appName}-${props.stage}-rds-connections`,
  metric: dbInstance.metricDatabaseConnections({
    period: Duration.minutes(5),
  }),
  threshold: 50, // T3.MICROは約80接続が上限
  evaluationPeriods: 2,
  alarmDescription: 'RDS connections approaching limit',
});

// RDS ストレージ空き容量アラーム
new cloudwatch.Alarm(this, 'RdsStorageAlarm', {
  alarmName: `${props.appName}-${props.stage}-rds-storage`,
  metric: dbInstance.metricFreeStorageSpace({
    period: Duration.minutes(5),
  }),
  threshold: 5 * 1024 * 1024 * 1024, // 5GB
  comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
  evaluationPeriods: 1,
  alarmDescription: 'RDS free storage below 5GB',
});
```

---

## Phase 3: パフォーマンス最適化（無料〜低コスト）

**目標**: コールドスタート対策、接続管理の改善
**コスト**: $0〜5/月
**工数**: 2-3時間

### 3.1 Lambda 接続プール最適化

**backend/app/db/session.py** を修正:

```python
from functools import lru_cache
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """
    Lambda環境に最適化されたエンジン設定
    - pool_size=1: Lambda インスタンスごとに1接続
    - max_overflow=4: 急なリクエスト増に対応
    - pool_recycle=300: 5分で接続リサイクル（RDSのタイムアウト対策）
    - pool_pre_ping=True: 使用前に接続確認
    """
    database_url = settings.get_database_url()

    # Lambda環境かどうかで設定を変更
    is_lambda = settings.ENVIRONMENT in ("prod", "production", "staging")

    engine = create_engine(
        database_url,
        poolclass=QueuePool,
        pool_size=1 if is_lambda else 5,
        max_overflow=4 if is_lambda else 10,
        pool_recycle=300,
        pool_pre_ping=True,
        pool_timeout=10,
        echo=False,
    )

    # 接続イベントのログ（デバッグ用）
    @event.listens_for(engine, "connect")
    def connect(dbapi_connection, connection_record):
        logger.info("Database connection established")

    @event.listens_for(engine, "checkout")
    def checkout(dbapi_connection, connection_record, connection_proxy):
        logger.debug("Connection checked out from pool")

    return engine


SessionLocal = sessionmaker(autocommit=False, autoflush=False)


def get_db() -> Session:
    """
    データベースセッションを取得するDependency
    """
    engine = get_engine()
    SessionLocal.configure(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 3.2 Lambda 同時実行数制限

**infra/lib/backend-stack.ts** に追加:

```typescript
// 同時実行数を制限（RDS接続数を保護）
backendFunction.addAlias('live', {
  provisionedConcurrentExecutions: 0, // Provisioned Concurrencyは使わない（コスト対策）
});

// Reserved Concurrency で上限設定
const cfnFunction = backendFunction.node.defaultChild as lambda.CfnFunction;
cfnFunction.addPropertyOverride('ReservedConcurrentExecutions', 20);
```

または、よりシンプルに:

```typescript
// 同時実行数の上限を設定
backendFunction.currentVersion; // バージョン作成
(backendFunction.node.defaultChild as lambda.CfnFunction).reservedConcurrentExecutions = 20;
```

### 3.3 Lambda ウォームアップ（EventBridge）

**infra/lib/backend-stack.ts** に追加:

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

// 5分ごとにウォームアップリクエストを送信
if (props.stage === 'prod') {
  new events.Rule(this, 'WarmupRule', {
    ruleName: `${props.appName}-${props.stage}-warmup`,
    schedule: events.Schedule.rate(Duration.minutes(5)),
    targets: [
      new targets.LambdaFunction(backendFunction, {
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
```

**backend/app/main.py** - ウォームアップリクエストの処理:

```python
@app.get("/api/health")
async def health_check(request: Request):
    # ウォームアップリクエストは軽量に処理
    if request.headers.get("X-Warmup") == "true":
        return {"status": "warm"}

    return {"status": "healthy", "environment": settings.ENVIRONMENT}
```

### 3.4 CloudFront キャッシュ最適化

**infra/lib/frontend-stack.ts** を修正:

```typescript
// 静的アセット用のカスタムキャッシュポリシー
const staticAssetsCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
  cachePolicyName: `${props.appName}-${props.stage}-static-assets`,
  defaultTtl: Duration.days(7),
  maxTtl: Duration.days(365),
  minTtl: Duration.hours(1),
  enableAcceptEncodingGzip: true,
  enableAcceptEncodingBrotli: true,
  headerBehavior: cloudfront.CacheHeaderBehavior.none(),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
  cookieBehavior: cloudfront.CacheCookieBehavior.none(),
});

// Distribution の default behavior を更新
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: s3Origin,
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: staticAssetsCachePolicy, // カスタムポリシーを適用
    compress: true,
  },
  // ... 他の設定
});
```

### 3.5 RDS バックアップ保持期間延長

**infra/lib/database-stack.ts** を修正:

```typescript
backupRetention: props.stage === 'prod'
  ? Duration.days(14)  // 本番: 14日
  : Duration.days(3),  // 開発: 3日（1日から延長）
```

---

## Phase 4: 将来の拡張（有料・トラフィック増加時）

**目標**: 高トラフィック対応、エンタープライズグレードのセキュリティ
**コスト**: $20-100+/月
**実施時期**: 月間アクティブユーザー1,000+、または本番トラフィック増加時

### 4.1 RDS Proxy 導入

**実施条件**:
- Lambda同時実行数が頻繁に20を超える
- RDS接続数アラームが頻繁に発火
- 接続エラーがログに記録される

**コスト**: 約$15-25/月

```typescript
// database-stack.ts
const proxy = new rds.DatabaseProxy(this, 'RdsProxy', {
  proxyTarget: rds.ProxyTarget.fromInstance(dbInstance),
  secrets: [dbCredentials],
  vpc: props.vpc,
  securityGroups: [dbSecurityGroup],
  requireTLS: true,
  idleClientTimeout: Duration.minutes(30),
  maxConnectionsPercent: 90,
  maxIdleConnectionsPercent: 50,
});
```

### 4.2 Provisioned Concurrency

**実施条件**:
- コールドスタートによるユーザー体験悪化が顕著
- P95レイテンシが許容値を超える

**コスト**: 約$10-15/月（2インスタンス）

```typescript
const alias = backendFunction.addAlias('live');
new lambda.Alias(this, 'ProvisionedAlias', {
  aliasName: 'provisioned',
  version: backendFunction.currentVersion,
  provisionedConcurrentExecutions: 2,
});
```

### 4.3 Cognito 認証

**実施条件**:
- ユーザー認証が必要な機能を追加
- APIの保護が必要

**コスト**: 50,000 MAUまで無料

```typescript
// 新規: auth-stack.ts
const userPool = new cognito.UserPool(this, 'UserPool', {
  userPoolName: `${props.appName}-${props.stage}-users`,
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
  },
});
```

### 4.4 WAF 導入

**実施条件**:
- DDoS攻撃の兆候
- 不正アクセスの増加
- コンプライアンス要件

**コスト**: 約$6+/月

```typescript
const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
  scope: 'CLOUDFRONT',
  defaultAction: { allow: {} },
  rules: [
    {
      name: 'RateLimitRule',
      priority: 1,
      statement: {
        rateBasedStatement: {
          limit: 1000,
          aggregateKeyType: 'IP',
        },
      },
      action: { block: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'RateLimitRule',
      },
    },
  ],
});
```

### 4.5 NAT Gateway コスト削減

**実施条件**:
- 開発環境のコスト削減が必要
- 月額$45の固定コストを削減したい

**オプション A**: NAT Instance に変更（約$3.5/月）

```typescript
// 開発環境のみ NAT Instance を使用
if (props.stage !== 'prod') {
  // NAT Instance の設定（要カスタム実装）
}
```

**オプション B**: VPC外Lambda + Public RDS

セキュリティとのトレードオフがあるため、慎重に検討が必要。

---

## 実装スケジュール

### Week 1: Phase 1 (セキュリティ強化)

| Day | タスク | 担当 |
|-----|--------|------|
| 1 | CloudFront カスタムヘッダー実装 | Infra |
| 1 | バックエンドミドルウェア実装 | Backend |
| 2 | セキュリティグループルール整理 | Infra |
| 2 | テスト・検証 | QA |

### Week 2: Phase 2 (運用監視)

| Day | タスク | 担当 |
|-----|--------|------|
| 1 | CloudWatch Alarms 実装 | Infra |
| 2 | SNS トピック・通知設定 | Infra |
| 2 | アラーム動作検証 | QA |

### Week 3: Phase 3 (パフォーマンス)

| Day | タスク | 担当 |
|-----|--------|------|
| 1 | Lambda 接続プール最適化 | Backend |
| 1 | Lambda 同時実行数制限 | Infra |
| 2 | Lambda ウォームアップ設定 | Infra |
| 2 | CloudFront キャッシュ最適化 | Infra |
| 3 | RDS バックアップ設定変更 | Infra |
| 3 | 負荷テスト・検証 | QA |

---

## コストサマリー

| Phase | 内容 | 月額コスト |
|-------|------|-----------|
| Phase 1 | セキュリティ強化 | $0 |
| Phase 2 | 運用監視（10アラームまで） | $0 |
| Phase 3 | パフォーマンス最適化 | $0 |
| **合計（Phase 1-3）** | | **$0/月** |

### Phase 4（将来・必要時のみ）

| 項目 | 月額コスト | 実施条件 |
|------|-----------|----------|
| RDS Proxy | $15-25 | 接続エラー頻発時 |
| Provisioned Concurrency | $10-15 | レイテンシ要件厳格時 |
| WAF | $6+ | セキュリティ要件時 |
| Cognito | $0（50K MAUまで） | 認証機能追加時 |

---

## チェックリスト

### Phase 1 完了条件

- [ ] CloudFront カスタムヘッダーが設定されている
- [ ] バックエンドでヘッダー検証ミドルウェアが動作している
- [ ] API Gateway 直接アクセスがブロックされることを確認
- [ ] セキュリティグループの不要ルールが削除されている

### Phase 2 完了条件

- [ ] Lambda エラーアラームが設定されている
- [ ] Lambda 実行時間アラームが設定されている
- [ ] RDS CPU/接続数/ストレージアラームが設定されている
- [ ] SNS 通知が正しく送信されることを確認

### Phase 3 完了条件

- [ ] Lambda 接続プールが最適化されている
- [ ] Lambda 同時実行数が制限されている
- [ ] Lambda ウォームアップが動作している（prod環境）
- [ ] CloudFront キャッシュが最適化されている
- [ ] RDS バックアップ保持期間が延長されている
- [ ] 負荷テストで接続エラーが発生しないことを確認

---

## 監視メトリクス

実装後、以下のメトリクスを継続監視:

| メトリクス | 閾値 | アクション |
|-----------|------|-----------|
| Lambda エラー率 | > 1% | ログ確認、コード修正 |
| Lambda P95 レイテンシ | > 5秒 | Phase 4 検討 |
| RDS 接続数 | > 50 | Phase 4 (RDS Proxy) 検討 |
| RDS CPU | > 80% | インスタンスサイズアップ検討 |
| Lambda 同時実行数 | > 15 | 上限引き上げ検討 |

---

*Plan created: 2025-12-09*
*Last updated: 2025-12-09*
