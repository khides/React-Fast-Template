# React + FastAPI + AWS Serverless Template

React (Vite) + FastAPI + PostgreSQL のモノレポテンプレート。AWS CloudFront, S3, Lambda Function URL, RDS を使用したサーバーレスアーキテクチャでデプロイ可能。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                          CloudFront                              │
│                    (CDN + SSL終端 + キャッシュ)                    │
└─────────────────────┬───────────────────────┬───────────────────┘
                      │                       │
                      │ /                     │ /api/*
                      ▼                       ▼
              ┌───────────────┐      ┌─────────────────┐
              │      S3       │      │     Lambda      │
              │  (静的ファイル) │      │   Function URL  │
              └───────────────┘      │   (FastAPI +    │
                                     │    Mangum)      │
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
├── scripts/            # デプロイスクリプト (Bash/Fish)
├── docker-compose.yml  # ローカル開発環境
└── Makefile           # タスクランナー
```

## 前提条件

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- AWS CLI v2
- AWS CDK CLI (`npm install -g aws-cdk`)

## クイックスタート

### ローカル開発環境

```bash
# 1. 依存関係のインストール
make install

# 2. 開発環境を起動（DB + Backend + Frontend）
make dev
```

アクセス:
- Frontend: http://localhost:3001
- Backend API: http://localhost:8001
- API Docs: http://localhost:8001/docs

### AWS へのデプロイ

```bash
# AWS プロファイルを設定
aws configure --profile react-fast-deploy

# デプロイ
make deploy
```

---

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
cd ../backend && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
cd ../infra && npm install
```

### 3. 開発環境の起動

#### 方法 1: Make コマンド（推奨）

```bash
# 全サービスを起動（DB + Backend + Frontend）
make dev

# または個別に起動
make db-up         # PostgreSQL のみ
make backend-dev   # Backend のみ（DB も自動起動）
make frontend-dev  # Frontend のみ
```

#### 方法 2: Docker Compose

```bash
# 全サービスを Docker で起動
make docker-up

# ログを確認
make docker-logs

# 停止
make docker-down
```

### ローカル環境のポート

| サービス | ポート | URL |
|---------|-------|-----|
| Frontend | 3001 | http://localhost:3001 |
| Backend | 8001 | http://localhost:8001 |
| API Docs | 8001 | http://localhost:8001/docs |
| PostgreSQL | 5433 | localhost:5433 |

---

## AWS へのデプロイ

### ステップ 1: AWS CLI の設定

```bash
# 専用プロファイルを作成
aws configure --profile react-fast-deploy
```

以下の情報を入力:
- AWS Access Key ID
- AWS Secret Access Key
- Default region: `ap-northeast-1`
- Default output format: `json`

### ステップ 2: CDK Bootstrap（初回のみ）

```bash
make cdk-bootstrap
```

### ステップ 3: デプロイ

```bash
# dev 環境にデプロイ
make deploy

# または
make deploy-dev

# prod 環境にデプロイ
make deploy-prod

# カスタム設定でデプロイ
make deploy AWS_PROFILE=myprofile STAGE=prod
```

#### デプロイスクリプトを使用

```bash
# Bash
./scripts/deploy.sh dev

# Fish
./scripts/deploy.fish dev
```

### デプロイ完了後の確認

デプロイ完了後、以下の出力が `cdk-outputs-dev.json` に保存されます:

```json
{
  "react-fast-app-dev-frontend": {
    "CloudFrontUrl": "https://xxxxx.cloudfront.net"
  },
  "react-fast-app-dev-backend": {
    "LambdaFunctionUrl": "https://xxxxx.lambda-url.ap-northeast-1.on.aws"
  }
}
```

### リソースの削除

```bash
# 確認プロンプトあり
make destroy

# 特定の環境を削除
make destroy STAGE=dev
```

---

## コマンドリファレンス

### ローカル開発

| コマンド | 説明 |
|---------|------|
| `make install` | 全ての依存関係をインストール |
| `make venv` | Python 仮想環境を作成 |
| `make dev` | DB + Backend + Frontend を起動 |
| `make backend-dev` | Backend のみ起動 |
| `make frontend-dev` | Frontend のみ起動 |
| `make db-up` | PostgreSQL のみ起動 |
| `make docker-up` | Docker で全サービス起動 |
| `make docker-down` | Docker 停止 |
| `make docker-logs` | Docker ログを表示 |

### ビルド & テスト

| コマンド | 説明 |
|---------|------|
| `make build` | Frontend + Backend をビルド |
| `make build-frontend` | Frontend のみビルド |
| `make test` | テストを実行 |
| `make lint` | Linter を実行 |

### AWS デプロイ

| コマンド | 説明 |
|---------|------|
| `make check-aws` | AWS 認証情報を確認 |
| `make deploy` | dev 環境にデプロイ |
| `make deploy-dev` | dev 環境にデプロイ |
| `make deploy-prod` | prod 環境にデプロイ |
| `make deploy-frontend` | Frontend のみデプロイ |
| `make deploy-backend` | Backend のみデプロイ |
| `make destroy` | リソースを削除 |

### CDK 操作

| コマンド | 説明 |
|---------|------|
| `make cdk-synth` | CloudFormation テンプレート生成 |
| `make cdk-diff` | 差分を確認 |
| `make cdk-bootstrap` | CDK Bootstrap を実行 |

### クリーンアップ

| コマンド | 説明 |
|---------|------|
| `make clean` | ビルド成果物を削除 |
| `make clean-docker` | Docker ボリュームを削除 |

### 設定変数

```bash
# AWS プロファイルを指定
make deploy AWS_PROFILE=myprofile

# ステージを指定
make deploy STAGE=prod

# 組み合わせ
make deploy AWS_PROFILE=myprofile STAGE=prod
```

---

## GUI での操作が必要な設定

### 1. カスタムドメインの設定（オプション）

**Route 53 + ACM を使用する場合:**

1. **ACM で SSL 証明書を作成** (us-east-1 リージョン必須)
   - AWS Console → Certificate Manager → us-east-1 リージョンを選択
   - 「証明書をリクエスト」→ パブリック証明書
   - ドメイン名を入力 → DNS 検証を選択

2. **CloudFront にカスタムドメインを設定**
   - AWS Console → CloudFront → ディストリビューションを選択
   - 「編集」→ 代替ドメイン名 (CNAME) を追加
   - SSL 証明書を選択

### 2. CloudWatch ダッシュボードの作成（オプション）

1. AWS Console → CloudWatch → ダッシュボード
2. 「ダッシュボードの作成」
3. 以下のメトリクスを追加:
   - Lambda: Invocations, Duration, Errors
   - RDS: CPUUtilization, DatabaseConnections

---

## トラブルシューティング

### Lambda が RDS に接続できない

1. Lambda と RDS が同じ VPC にあることを確認
2. セキュリティグループで PostgreSQL ポート (5432) が許可されていることを確認
3. CloudWatch Logs でエラーメッセージを確認

### CloudFront で 403 エラー

1. S3 バケットポリシーが正しく設定されていることを確認
2. Origin Access Control が設定されていることを確認

### API で 307 リダイレクトが発生

FastAPI のデフォルトでは、`/api/items` へのリクエストが `/api/items/` にリダイレクトされます。
このテンプレートでは `redirect_slashes=False` で無効化済みです。

### ローカルで DB に接続できない

```bash
# PostgreSQL コンテナの状態を確認
docker-compose ps

# ログを確認
docker-compose logs db

# コンテナを再起動
docker-compose restart db
```

---

## セキュリティのベストプラクティス

- RDS は Private Subnet に配置
- Secrets Manager でデータベース認証情報を管理
- CloudFront で HTTPS を強制
- S3 バケットへの直接アクセスをブロック
- Lambda は VPC 内で実行

---

## コスト見積もり（開発環境・Free Tier 活用）

| サービス | 見積もり (USD/月) |
|---------|-----------------|
| Lambda | ~$0 (Free Tier) |
| Lambda Function URL | $0 |
| RDS (db.t3.micro) | ~$15 |
| NAT Gateway | ~$32 |
| CloudFront | ~$0 (Free Tier) |
| S3 | ~$0 |
| **合計** | **~$47** |

※ RDS Proxy を使用しないことで約 $20/月 削減
※ 本番環境では RDS のスペックアップ、Multi-AZ 構成などで追加コストが発生

---

## ライセンス

MIT License


## メモ

```bash
taiko@hidewin-Opt ~/React-Fast-Template (main)>  curl https://checkip.amazonaws.com
222.150.143.116
taiko@hidewin-Opt ~/React-Fast-Template (main)> make deploy
taiko@hidewin-Opt ~/React-Fast-Template (main)>  ssh -i ../template-deploy-server-key.pem ec2-user@ec2-18-183-61-20.ap-northeast-1.compute.amazonaws.com      
```