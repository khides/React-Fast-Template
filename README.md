# React + FastAPI + AWS Serverless Template

React (Vite) + FastAPI + PostgreSQL のモノレポテンプレート。AWS CloudFront, S3, API Gateway, Lambda, RDS Proxy, RDS を使用したサーバーレスアーキテクチャでデプロイ可能。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                          CloudFront                              │
│                    (CDN + SSL終端 + キャッシュ)                    │
└─────────────────────┬───────────────────────┬───────────────────┘
                      │                       │
                      ▼                       ▼
              ┌───────────────┐      ┌─────────────────┐
              │      S3       │      │  API Gateway    │
              │  (静的ファイル) │      │   (HTTP API)    │
              └───────────────┘      └────────┬────────┘
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │     Lambda      │
                                     │   (FastAPI +    │
                                     │    Mangum)      │
                                     └────────┬────────┘
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │   RDS Proxy     │
                                     │ (コネクション管理) │
                                     └────────┬────────┘
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │      RDS        │
                                     │  (PostgreSQL)   │
                                     └─────────────────┘
```

## プロジェクト構成

```
.
├── frontend/           # React (Vite + TypeScript)
├── backend/            # FastAPI (Python)
├── infra/              # AWS CDK (TypeScript)
├── scripts/            # ユーティリティスクリプト
├── docker-compose.yml  # ローカル開発環境
└── Makefile           # タスクランナー
```

## 前提条件

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- AWS CLI v2
- AWS CDK CLI (`npm install -g aws-cdk`)

## ローカル開発環境のセットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd React-Fast-Template
```

### 2. 依存関係のインストール

```bash
# 全ての依存関係をインストール
make install

# または個別にインストール
cd frontend && npm install
cd ../backend && pip install -e ".[dev]"
cd ../infra && npm install
```

### 3. 環境変数の設定

```bash
# Backend
cp backend/.env.example backend/.env

# Infrastructure
cp infra/.env.example infra/.env
```

### 4. Docker で開発環境を起動

```bash
# 全サービスを起動
make docker-up

# または
docker-compose up -d
```

アクセス:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### 5. Docker を使わずに起動（オプション）

```bash
# PostgreSQL のみ Docker で起動
docker-compose up -d db

# Backend を起動
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# 別ターミナルで Frontend を起動
cd frontend
npm install
npm run dev
```

## AWS へのデプロイ

### ステップ 1: AWS CLI の設定

```bash
aws configure
```

以下の情報を入力:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (例: ap-northeast-1)
- Default output format: json

### ステップ 2: CDK Bootstrap（初回のみ）

```bash
cd infra
npm install
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/ap-northeast-1
```

### ステップ 3: 環境変数の設定

```bash
# infra/.env を編集
AWS_ACCOUNT_ID=123456789012
AWS_REGION=ap-northeast-1
```

### ステップ 4: フロントエンドのビルド

```bash
cd frontend
npm run build
```

### ステップ 5: デプロイ

```bash
# 全スタックをデプロイ
make deploy

# または
cd infra
npx cdk deploy --all
```

デプロイ順序:
1. Network Stack (VPC)
2. Database Stack (RDS + RDS Proxy)
3. Backend Stack (Lambda + API Gateway)
4. Frontend Stack (S3 + CloudFront)

### デプロイ完了後の確認

デプロイ完了後、以下の出力が表示されます:

```
Outputs:
react-fast-app-dev-frontend.CloudFrontUrl = https://xxxxx.cloudfront.net
react-fast-app-dev-backend.ApiUrl = https://xxxxx.execute-api.ap-northeast-1.amazonaws.com
```

## GUI での操作が必要な設定

### 1. カスタムドメインの設定（オプション）

**Route 53 + ACM を使用する場合:**

1. **ACM で SSL 証明書を作成** (us-east-1 リージョン必須)
   - AWS Console → Certificate Manager → us-east-1 リージョンを選択
   - 「証明書をリクエスト」→ パブリック証明書
   - ドメイン名を入力 → DNS 検証を選択
   - Route 53 で自動的に検証レコードを作成

2. **Route 53 でホストゾーンを作成**
   - AWS Console → Route 53 → ホストゾーン → 作成
   - ドメイン名を入力

3. **CloudFront にカスタムドメインを設定**
   - AWS Console → CloudFront → ディストリビューションを選択
   - 「編集」→ 代替ドメイン名 (CNAME) を追加
   - SSL 証明書を選択

### 2. RDS への初期データ投入（必要な場合）

**Bastion Host または Session Manager を使用:**

1. **Session Manager でアクセス**
   - AWS Console → EC2 → インスタンスを起動（Bastion用）
   - VPC 内の Private Subnet に配置
   - Session Manager で接続

2. **psql で RDS に接続**
   ```bash
   # Secrets Manager から認証情報を取得
   aws secretsmanager get-secret-value \
     --secret-id react-fast-app/dev/database \
     --query SecretString --output text

   # psql で接続
   psql -h <RDS_PROXY_ENDPOINT> -U postgres -d app
   ```

### 3. CloudWatch ダッシュボードの作成（オプション）

1. AWS Console → CloudWatch → ダッシュボード
2. 「ダッシュボードの作成」
3. 以下のメトリクスを追加:
   - Lambda: Invocations, Duration, Errors
   - API Gateway: Count, Latency, 4XXError, 5XXError
   - RDS: CPUUtilization, DatabaseConnections

### 4. アラームの設定（オプション）

1. AWS Console → CloudWatch → アラーム
2. 推奨アラーム:
   - Lambda エラー率 > 1%
   - API Gateway 5XX エラー > 0
   - RDS CPU 使用率 > 80%
   - RDS 接続数 > 制限の 80%

## コマンドリファレンス

```bash
# 開発
make dev              # ローカル開発環境を起動
make docker-up        # Docker コンテナを起動
make docker-down      # Docker コンテナを停止
make docker-logs      # ログを表示

# ビルド
make build            # フロントエンド・バックエンドをビルド
make build-frontend   # フロントエンドのみビルド

# テスト・Lint
make test             # テストを実行
make lint             # Linter を実行

# デプロイ
make deploy           # 全スタックをデプロイ
make deploy-frontend  # フロントエンドのみデプロイ
make deploy-backend   # バックエンドのみデプロイ

# CDK
make cdk-synth        # CloudFormation テンプレートを生成
make cdk-diff         # 差分を確認
make cdk-bootstrap    # CDK Bootstrap を実行

# クリーンアップ
make clean            # ビルド成果物を削除
```

## トラブルシューティング

### Lambda が RDS に接続できない

1. Lambda と RDS Proxy が同じ VPC にあることを確認
2. セキュリティグループで PostgreSQL ポート (5432) が許可されていることを確認
3. Lambda の実行ロールに必要な権限があることを確認

### CloudFront で 403 エラー

1. S3 バケットポリシーが正しく設定されていることを確認
2. Origin Access Identity が設定されていることを確認

### ローカルで DB に接続できない

```bash
# PostgreSQL コンテナの状態を確認
docker-compose ps

# ログを確認
docker-compose logs db

# コンテナを再起動
docker-compose restart db
```

## セキュリティのベストプラクティス

- RDS は Private Subnet に配置
- RDS Proxy を使用してコネクション管理
- Secrets Manager でデータベース認証情報を管理
- CloudFront で HTTPS を強制
- S3 バケットへの直接アクセスをブロック
- Lambda は VPC 内で実行

## コスト見積もり（開発環境）

| サービス | 見積もり (USD/月) |
|---------|-----------------|
| Lambda | ~$0 (Free Tier) |
| API Gateway | ~$0 (Free Tier) |
| RDS (db.t3.micro) | ~$15 |
| RDS Proxy | ~$20 |
| NAT Gateway | ~$32 |
| CloudFront | ~$0 (Free Tier) |
| S3 | ~$0 |
| **合計** | **~$67** |

※ 本番環境では RDS のスペックアップ、Multi-AZ 構成などで追加コストが発生します。

## ライセンス

MIT License
