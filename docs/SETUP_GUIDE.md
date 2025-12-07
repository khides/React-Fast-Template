# 詳細セットアップガイド

このドキュメントでは、プロジェクトのセットアップからAWSへのデプロイまでの詳細な手順を説明します。

## 目次

1. [前提条件の確認](#1-前提条件の確認)
2. [ローカル開発環境のセットアップ](#2-ローカル開発環境のセットアップ)
3. [AWS アカウントの準備](#3-aws-アカウントの準備)
4. [AWS CLI の設定](#4-aws-cli-の設定)
5. [AWS CDK のセットアップ](#5-aws-cdk-のセットアップ)
6. [インフラストラクチャのデプロイ](#6-インフラストラクチャのデプロイ)
7. [GUI での必須設定](#7-gui-での必須設定)
8. [デプロイ後の確認](#8-デプロイ後の確認)

---

## 1. 前提条件の確認

### 必要なツール

```bash
# Node.js のバージョン確認 (20以上)
node --version

# npm のバージョン確認
npm --version

# Python のバージョン確認 (3.11以上)
python3 --version

# Docker のバージョン確認
docker --version
docker-compose --version

# AWS CLI のバージョン確認 (v2推奨)
aws --version
```

### ツールのインストール（未インストールの場合）

**Node.js (nvm を使用)**
```bash
# nvm のインストール
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Node.js 20 のインストール
nvm install 20
nvm use 20
```

**Python (pyenv を使用)**
```bash
# pyenv のインストール
curl https://pyenv.run | bash

# Python 3.11 のインストール
pyenv install 3.11
pyenv global 3.11
```

**Docker**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) をインストール

**AWS CLI v2**
```bash
# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# macOS
brew install awscli
```

**AWS CDK CLI**
```bash
npm install -g aws-cdk
```

---

## 2. ローカル開発環境のセットアップ

### 2.1 リポジトリのクローン

```bash
git clone <repository-url>
cd React-Fast-Template
```

### 2.2 依存関係のインストール

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Infrastructure
cd ../infra
npm install
```

### 2.3 環境変数の設定

```bash
# Backend の環境変数
cp backend/.env.example backend/.env

# Infrastructure の環境変数
cp infra/.env.example infra/.env
```

### 2.4 Docker Compose で起動

```bash
# プロジェクトルートで実行
docker-compose up -d

# 起動確認
docker-compose ps
```

### 2.5 動作確認

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API ドキュメント: http://localhost:8000/docs

---

## 3. AWS アカウントの準備

### 3.1 AWS アカウントの作成（未作成の場合）

1. https://aws.amazon.com/ にアクセス
2. 「アカウントを作成」をクリック
3. 必要情報を入力してアカウント作成

### 3.2 IAM ユーザーの作成（GUI 操作が必要）

**AWS Console での操作:**

1. AWS Console にログイン → IAM サービスへ移動
2. 左メニュー「ユーザー」→「ユーザーを追加」
3. ユーザー名: `cdk-deploy-user`
4. AWS 認証情報タイプ: 「アクセスキー - プログラムによるアクセス」をチェック
5. アクセス許可: 「既存のポリシーを直接アタッチ」
   - `AdministratorAccess` を選択（開発用。本番では最小権限原則を適用）
6. タグは任意
7. ユーザー作成完了後、**アクセスキー ID** と **シークレットアクセスキー** を控える

> ⚠️ **重要**: シークレットアクセスキーは作成時のみ表示されます。必ず安全な場所に保存してください。

### 3.3 請求アラートの設定（推奨・GUI 操作）

1. AWS Console → 「請求ダッシュボード」
2. 左メニュー「請求設定」
3. 「無料利用枠の使用状況アラートを受信する」にチェック
4. 「請求アラートを受け取る」にチェック

---

## 4. AWS CLI の設定

### 4.1 認証情報の設定

```bash
aws configure
```

入力項目:
```
AWS Access Key ID: [IAMで作成したアクセスキー]
AWS Secret Access Key: [IAMで作成したシークレットキー]
Default region name: ap-northeast-1
Default output format: json
```

### 4.2 設定の確認

```bash
# 認証情報の確認
aws sts get-caller-identity
```

成功すると以下のような出力:
```json
{
    "UserId": "AIDAXXXXXXXXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/cdk-deploy-user"
}
```

---

## 5. AWS CDK のセットアップ

### 5.1 CDK Bootstrap（初回のみ）

CDK Bootstrap は、CDK がデプロイに使用する S3 バケットや IAM ロールを作成します。

```bash
cd infra

# 環境変数の設定
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=ap-northeast-1

# Bootstrap の実行
npx cdk bootstrap aws://${AWS_ACCOUNT_ID}/${AWS_REGION}
```

### 5.2 環境変数ファイルの更新

```bash
# infra/.env を編集
echo "AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID}" > infra/.env
echo "AWS_REGION=${AWS_REGION}" >> infra/.env
```

### 5.3 合成テスト

```bash
cd infra
npx cdk synth
```

エラーなく CloudFormation テンプレートが出力されれば成功です。

---

## 6. インフラストラクチャのデプロイ

### 6.1 フロントエンドのビルド

```bash
cd frontend
npm run build
```

`dist/` ディレクトリにビルド成果物が生成されます。

### 6.2 差分の確認

```bash
cd infra
npx cdk diff
```

### 6.3 デプロイの実行

```bash
# 全スタックをデプロイ
npx cdk deploy --all

# または個別にデプロイ
npx cdk deploy react-fast-app-dev-network
npx cdk deploy react-fast-app-dev-database
npx cdk deploy react-fast-app-dev-backend
npx cdk deploy react-fast-app-dev-frontend
```

デプロイには 15-30 分程度かかります。

### 6.4 デプロイ出力の確認

デプロイ完了後、以下のような出力が表示されます:

```
Outputs:
react-fast-app-dev-frontend.CloudFrontUrl = https://d1234567890.cloudfront.net
react-fast-app-dev-backend.ApiUrl = https://abcdef1234.execute-api.ap-northeast-1.amazonaws.com

Stack ARN:
arn:aws:cloudformation:ap-northeast-1:123456789012:stack/react-fast-app-dev-frontend/...
```

---

## 7. GUI での必須設定

### 7.1 RDS の初期マイグレーション（GUI + CLI）

RDS は Private Subnet にあるため、直接アクセスできません。以下のいずれかの方法を使用します。

**方法 A: Session Manager を使用（推奨）**

1. **EC2 インスタンスの起動（GUI）**
   - AWS Console → EC2 → 「インスタンスを起動」
   - AMI: Amazon Linux 2023
   - インスタンスタイプ: t3.micro
   - VPC: `react-fast-app-dev-vpc` を選択
   - サブネット: Private Subnet を選択
   - セキュリティグループ: 新規作成（アウトバウンドのみ許可）
   - IAM ロール: `AmazonSSMManagedInstanceCore` ポリシーを持つロール

2. **Session Manager で接続（GUI）**
   - EC2 → インスタンス → 対象を選択 → 「接続」
   - 「Session Manager」タブ → 「接続」

3. **psql でマイグレーション実行**
   ```bash
   # PostgreSQL クライアントのインストール
   sudo dnf install postgresql15 -y

   # Secrets Manager から認証情報を取得
   SECRET=$(aws secretsmanager get-secret-value \
     --secret-id react-fast-app/dev/database \
     --query SecretString --output text)

   # 認証情報の取得
   DB_USER=$(echo $SECRET | jq -r '.username')
   DB_PASS=$(echo $SECRET | jq -r '.password')

   # RDS Proxy エンドポイントを取得
   PROXY_ENDPOINT=$(aws rds describe-db-proxies \
     --query "DBProxies[?DBProxyName=='react-fast-app-dev-proxy'].Endpoint" \
     --output text)

   # 接続テスト
   PGPASSWORD=$DB_PASS psql -h $PROXY_ENDPOINT -U $DB_USER -d app -c "SELECT 1;"
   ```

**方法 B: Lambda でマイグレーション実行**

Lambda 関数内で Alembic マイグレーションを実行する方法もあります。

### 7.2 カスタムドメインの設定（オプション・GUI）

**Step 1: ACM で SSL 証明書を作成（us-east-1 必須）**

1. AWS Console → リージョンを **us-east-1 (バージニア北部)** に変更
2. Certificate Manager → 「証明書をリクエスト」
3. 「パブリック証明書をリクエスト」→ 次へ
4. ドメイン名: `example.com` と `*.example.com`
5. 検証方法: DNS 検証
6. 「リクエスト」をクリック

**Step 2: DNS 検証（Route 53 使用の場合）**

1. 証明書の詳細画面 → 「Route 53 でレコードを作成」
2. 数分で検証完了

**Step 3: CloudFront にドメインを設定**

1. CloudFront → ディストリビューション → 対象を選択
2. 「編集」→ 「代替ドメイン名 (CNAME)」を追加
3. 「カスタム SSL 証明書」で作成した証明書を選択
4. 変更を保存

**Step 4: Route 53 で A レコード作成**

1. Route 53 → ホストゾーン → 対象ドメイン
2. 「レコードを作成」
3. レコードタイプ: A
4. エイリアス: はい
5. ルーティング先: CloudFront ディストリビューション

### 7.3 CloudWatch アラームの設定（推奨・GUI）

1. CloudWatch → アラーム → 「アラームの作成」

**推奨アラーム:**

| メトリクス | 閾値 | 期間 |
|-----------|------|------|
| Lambda Errors | > 0 | 5分 |
| Lambda Duration | > 10000ms | 5分 |
| RDS CPUUtilization | > 80% | 15分 |
| RDS FreeStorageSpace | < 1GB | 15分 |

---

## 8. デプロイ後の確認

### 8.1 アプリケーションの動作確認

```bash
# CloudFront URL にアクセス
curl https://d1234567890.cloudfront.net

# API ヘルスチェック
curl https://d1234567890.cloudfront.net/api/health

# API エンドポイント
curl https://d1234567890.cloudfront.net/api/v1/items
```

### 8.2 ログの確認

```bash
# Lambda ログ
aws logs tail /aws/lambda/react-fast-app-dev-api --follow

# API Gateway ログ（有効化されている場合）
aws logs tail /aws/api-gateway/react-fast-app-dev-api --follow
```

### 8.3 リソースの削除（必要な場合）

```bash
cd infra
npx cdk destroy --all
```

> ⚠️ **注意**: 本番環境では `deletionProtection: true` が設定されているため、手動で無効化が必要です。

---

## 付録: よくある質問

### Q: デプロイに失敗した場合は？

1. CloudFormation コンソールでエラーを確認
2. `cdk diff` で差分を確認
3. スタックをロールバックまたは削除して再デプロイ

### Q: コストを抑えるには？

1. 開発時は NAT Gateway を削除（Lambda を Public Subnet に配置）
2. RDS インスタンスを停止（最大7日間）
3. CloudFront の PriceClass を `PRICE_CLASS_100` に設定

### Q: 本番環境用の設定は？

1. `stage` パラメータを `prod` に変更
2. RDS を Multi-AZ 構成に
3. WAF を追加
4. バックアップ保持期間を延長
