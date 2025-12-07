# AWS GUI 操作ガイド

このドキュメントでは、CLI では難しい、または GUI での操作が推奨される AWS 設定を詳しく説明します。

## 目次

1. [IAM ユーザーの作成](#1-iam-ユーザーの作成)
2. [VPC エンドポイントの確認](#2-vpc-エンドポイントの確認)
3. [Secrets Manager の確認](#3-secrets-manager-の確認)
4. [RDS への接続（Bastion Host 経由）](#4-rds-への接続bastion-host-経由)
5. [CloudFront のカスタムドメイン設定](#5-cloudfront-のカスタムドメイン設定)
6. [ACM 証明書の発行](#6-acm-証明書の発行)
7. [CloudWatch ダッシュボード・アラームの作成](#7-cloudwatch-ダッシュボードアラームの作成)
8. [WAF の設定（本番環境推奨）](#8-waf-の設定本番環境推奨)

---

## 1. IAM ユーザーの作成

### 目的
AWS リソースをデプロイするための認証情報を作成します。

### 手順

1. **AWS Console にログイン**
   - https://console.aws.amazon.com/

2. **IAM サービスに移動**
   - 検索バーで「IAM」を検索してクリック

3. **ユーザーを作成**
   - 左メニュー「ユーザー」→「ユーザーを作成」
   - ユーザー名: `cdk-deploy-user`

4. **アクセス権限の設定**
   - 「ポリシーを直接アタッチする」を選択
   - 以下のポリシーをアタッチ:
     - `AdministratorAccess`（開発環境用）

   > **本番環境では最小権限原則に従い、必要なポリシーのみアタッチしてください**

5. **アクセスキーの作成**
   - 作成したユーザーを選択
   - 「セキュリティ認証情報」タブ
   - 「アクセスキーを作成」
   - ユースケース: 「コマンドラインインターフェイス (CLI)」
   - **アクセスキー ID** と **シークレットアクセスキー** を安全に保存

### スクリーンショット位置の目安

```
AWS Console
└── IAM
    └── ユーザー
        └── ユーザーを作成
            ├── ステップ1: ユーザー名入力
            ├── ステップ2: ポリシーアタッチ
            └── ステップ3: 確認と作成
```

---

## 2. VPC エンドポイントの確認

### 目的
Private Subnet 内の Lambda が AWS サービスにアクセスできることを確認します。

### 確認手順

1. **VPC サービスに移動**
   - 検索バーで「VPC」を検索

2. **エンドポイントを確認**
   - 左メニュー「エンドポイント」
   - 以下のエンドポイントが作成されていることを確認:
     - `com.amazonaws.ap-northeast-1.secretsmanager`
     - `com.amazonaws.ap-northeast-1.rds`

### トラブルシューティング

エンドポイントが存在しない場合、Lambda は NAT Gateway 経由でインターネットを通じて AWS サービスにアクセスします。コスト削減のためには VPC エンドポイントの追加を検討してください。

---

## 3. Secrets Manager の確認

### 目的
データベース認証情報が正しく保存されていることを確認します。

### 手順

1. **Secrets Manager に移動**
   - 検索バーで「Secrets Manager」を検索

2. **シークレットを確認**
   - シークレット名: `react-fast-app/dev/database`
   - 「シークレットの値を取得」をクリック
   - `username` と `password` が存在することを確認

### 認証情報の手動更新が必要な場合

1. シークレットを選択
2. 「シークレットの値を編集」
3. JSON を編集して保存

```json
{
  "username": "postgres",
  "password": "your-secure-password"
}
```

---

## 4. RDS への接続（Bastion Host 経由）

### 目的
Private Subnet 内の RDS にアクセスしてマイグレーションやデバッグを行います。

### 方法 A: EC2 Bastion Host を使用

#### Step 1: EC2 インスタンスの作成

1. **EC2 サービスに移動**
2. **「インスタンスを起動」をクリック**
3. **設定項目:**

| 項目 | 値 |
|------|-----|
| 名前 | bastion-host |
| AMI | Amazon Linux 2023 |
| インスタンスタイプ | t3.micro |
| キーペア | 新規作成または既存を選択 |
| VPC | react-fast-app-dev-vpc |
| サブネット | Private Subnet (with NAT) |
| パブリック IP | 無効 |
| セキュリティグループ | 新規作成（アウトバウンドのみ） |

4. **IAM ロールの設定（重要）**
   - 「高度な詳細」を展開
   - IAM インスタンスプロファイル: 以下のポリシーを持つロールを選択
     - `AmazonSSMManagedInstanceCore`
     - `SecretsManagerReadWrite`

#### Step 2: Session Manager で接続

1. **EC2 → インスタンス** で対象インスタンスを選択
2. **「接続」ボタン**をクリック
3. **「Session Manager」タブ** → 「接続」

#### Step 3: RDS に接続

```bash
# PostgreSQL クライアントのインストール
sudo dnf install postgresql15 -y

# Secrets Manager から認証情報を取得
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id react-fast-app/dev/database \
  --query SecretString --output text \
  --region ap-northeast-1)

DB_USER=$(echo $SECRET | python3 -c "import sys, json; print(json.load(sys.stdin)['username'])")
DB_PASS=$(echo $SECRET | python3 -c "import sys, json; print(json.load(sys.stdin)['password'])")

# RDS Proxy エンドポイントを取得
PROXY_ENDPOINT=$(aws rds describe-db-proxies \
  --region ap-northeast-1 \
  --query "DBProxies[?DBProxyName=='react-fast-app-dev-proxy'].Endpoint" \
  --output text)

# 接続
PGPASSWORD=$DB_PASS psql -h $PROXY_ENDPOINT -U $DB_USER -d app
```

### 方法 B: AWS Cloud9 を使用（GUI ベース）

1. **Cloud9 サービスに移動**
2. **「環境を作成」**
3. **VPC 設定で同じ VPC を選択**
4. **ターミナルで上記のコマンドを実行**

---

## 5. CloudFront のカスタムドメイン設定

### 前提条件
- ドメインを所有していること
- Route 53 でホストゾーンが作成済み（または他の DNS プロバイダを使用）

### Step 1: CloudFront ディストリビューションの編集

1. **CloudFront サービスに移動**
2. **対象のディストリビューションを選択**
3. **「編集」をクリック**

### Step 2: 代替ドメイン名の追加

1. **「代替ドメイン名 (CNAMEs)」セクション**
2. **ドメインを入力:**
   ```
   example.com
   www.example.com
   ```

### Step 3: SSL 証明書の選択

1. **「カスタム SSL 証明書」を選択**
2. **ACM で発行した証明書をドロップダウンから選択**

   > ⚠️ 証明書は **us-east-1** リージョンで発行する必要があります

### Step 4: 変更を保存

---

## 6. ACM 証明書の発行

### 重要
CloudFront で使用する証明書は **us-east-1 (バージニア北部)** リージョンで発行する必要があります。

### 手順

1. **リージョンを us-east-1 に切り替え**
   - 右上のリージョン選択で「米国東部 (バージニア北部)」を選択

2. **Certificate Manager に移動**

3. **「証明書をリクエスト」**

4. **証明書タイプ**
   - 「パブリック証明書をリクエスト」

5. **ドメイン名**
   ```
   example.com
   *.example.com  (ワイルドカード)
   ```

6. **検証方法**
   - DNS 検証（推奨）

7. **Route 53 で DNS 検証**
   - 「Route 53 でレコードを作成」ボタンをクリック
   - 自動的に CNAME レコードが作成される
   - 数分で「発行済み」ステータスに変更

### 検証が完了しない場合

- DNS レコードが正しく設定されているか確認
- ドメインの所有権を確認
- 最大 72 時間かかる場合がある

---

## 7. CloudWatch ダッシュボード・アラームの作成

### ダッシュボードの作成

1. **CloudWatch サービスに移動**
2. **左メニュー「ダッシュボード」→「ダッシュボードの作成」**
3. **ダッシュボード名を入力**

### 推奨ウィジェット

| メトリクス | タイプ | 説明 |
|-----------|--------|------|
| Lambda Invocations | 数値 | API 呼び出し数 |
| Lambda Duration | グラフ | レスポンス時間 |
| Lambda Errors | グラフ | エラー数 |
| API Gateway 5XXError | 数値 | サーバーエラー |
| RDS CPUUtilization | グラフ | DB CPU 使用率 |
| RDS DatabaseConnections | 数値 | 接続数 |

### アラームの作成

1. **CloudWatch → アラーム → 「アラームの作成」**

2. **推奨アラーム設定:**

**Lambda エラーアラーム**
| 項目 | 値 |
|------|-----|
| メトリクス | Lambda > By Function Name > Errors |
| 統計 | 合計 |
| 期間 | 5分 |
| 閾値 | > 0 |
| アクション | SNS トピックに通知 |

**RDS CPU アラーム**
| 項目 | 値 |
|------|-----|
| メトリクス | RDS > Per-Database Metrics > CPUUtilization |
| 統計 | 平均 |
| 期間 | 15分 |
| 閾値 | > 80% |

3. **SNS トピックの作成（通知用）**
   - SNS サービスに移動
   - 「トピックを作成」
   - タイプ: スタンダード
   - サブスクリプション: Email でアドレスを登録

---

## 8. WAF の設定（本番環境推奨）

### 目的
CloudFront を通じた悪意あるリクエストをブロックします。

### Step 1: WAF に移動

1. **検索バーで「WAF」を検索**
2. **「Web ACL を作成」**

### Step 2: Web ACL の設定

| 項目 | 値 |
|------|-----|
| 名前 | react-fast-app-waf |
| リソースタイプ | CloudFront distributions |
| リージョン | Global (CloudFront) |

### Step 3: マネージドルールの追加

推奨ルール:
- **AWS-AWSManagedRulesCommonRuleSet** - 一般的な攻撃をブロック
- **AWS-AWSManagedRulesKnownBadInputsRuleSet** - 既知の悪意ある入力をブロック
- **AWS-AWSManagedRulesSQLiRuleSet** - SQL インジェクション対策

### Step 4: CloudFront への関連付け

1. Web ACL の詳細画面
2. 「関連付けられた AWS リソース」タブ
3. 「AWS リソースを追加」
4. CloudFront ディストリビューションを選択

---

## 補足: 操作ログの確認

### CloudTrail（監査ログ）

1. **CloudTrail サービスに移動**
2. **「イベント履歴」で API 呼び出しを確認**

### VPC フローログ

1. **VPC → 対象の VPC を選択**
2. **「フローログ」タブ**
3. **「フローログを作成」で詳細なネットワークログを取得**

---

## チェックリスト

デプロイ完了後の確認項目:

- [ ] CloudFront URL でアプリにアクセスできる
- [ ] API ヘルスチェック (`/api/health`) が 200 を返す
- [ ] CloudWatch でメトリクスが取得できている
- [ ] Secrets Manager にシークレットが保存されている
- [ ] RDS に Bastion 経由で接続できる
- [ ] （オプション）カスタムドメインが設定されている
- [ ] （オプション）CloudWatch アラームが設定されている
- [ ] （本番）WAF が有効になっている
