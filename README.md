※本リポジトリは [AWS CDK Conference Japan 2025 presented by JAWS-UG](https://jawsug-cdk.connpass.com/event/356357/) 内のイベント「🏝️🎛️CDK Vibe Coding Fes‼️🎛️ 🏝️」にて、Claude Codeが作成したものです。cdk synthはできましたが、デプロイ確認等はしていませんので、使用する際は自己責任でお願いします。

# CDK Conference - Strands Agents Well-Architected レビュープラットフォーム

AWS CDKで構築されたサーバーレスプラットフォームです。AIエージェントを活用してAWS Well-Architected Frameworkの自動レビューを実施します。複数のAWSサービスを組み合わせて包括的なアーキテクチャ評価とインテリジェントな推奨事項を提供します。

## 概要

このプラットフォームは、AIエージェントとAWSサービスの統合によってWell-Architectedレビューを自動化する仕組みを示しています。以下の機能を提供します：

- **自動化されたアーキテクチャレビュー**: AIによるAWSインフラストラクチャの分析
- **リアルタイム処理**: SQSとLambdaによるイベント駆動アーキテクチャ
- **GraphQL API**: AppSyncを使用したリアルタイム更新API
- **Webインターフェース**: CloudFrontで配信されるフロントエンド
- **セキュアな設計**: CDK Nag検証によるWell-Architectedベストプラクティス

## アーキテクチャ

プラットフォームは5つの主要なコンストラクトで構成されています：

1. **フロントエンド**: WebインターフェースのためのCloudFront + S3配信
2. **バックエンドAPI**: RESTエンドポイントのためのAPI Gateway + Lambda
3. **AppSync**: リアルタイムデータ同期のためのGraphQL API
4. **AIエージェント**: Well-Architected分析のためのBedrock搭載エージェント
5. **非同期処理**: バックグラウンド処理のためのSQS + Lambda

## アーキテクチャ図

![AWS Well-Architected Review Platform Architecture](generated-diagrams/image.png)

詳細なアーキテクチャ図は以下のファイルからも確認できます：
- [改良版レイアウト (Draw.io)](strands-agents-architecture-improved.drawio)
- [AWS公式アイコン版 (Draw.io)](strands-agents-aws-icons.drawio)

## 機能

- 📊 **Well-Architectedレビュー**: 全6つの柱にわたる自動評価
- 🤖 **AI搭載分析**: AWS Bedrockを使用したインテリジェントな推奨事項
- ⚡ **リアルタイム更新**: ライブステータス更新のためのGraphQLサブスクリプション
- 🔒 **セキュリティファースト**: KMS暗号化、WAF保護、IAMベストプラクティス
- 📈 **スケーラブル設計**: 自動スケールするサーバーレスアーキテクチャ
- 🔍 **詳細な発見事項**: 実行可能な推奨事項を含む包括的な分析
- 🎨 **モダンなWebUI**: React + Viteで構築されたレスポンシブなフロントエンド
- 🔄 **リアルタイム同期**: Apollo ClientとGraphQL Subscriptionsによる即座のUI更新

## クイックスタート

### 前提条件

- Node.js (18.x以降)
- AWS CLI設定済み
- AWS CDK CLI インストール済み (`npm install -g aws-cdk`)

### インストール

```bash
# CDKプロジェクトの依存関係をインストール
npm install

# TypeScriptコードのビルド
npm run build

# フロントエンドの依存関係をインストール
cd frontend
npm install

# フロントエンドをビルド
npm run build
cd ..

# スタックのデプロイ
npm run deploy
```

### 設定

スタックは適切なデフォルト設定でデプロイされますが、以下をカスタマイズできます：

- **リージョン**: AWS CLIまたはCDKコンテキスト経由で設定
- **環境**: 開発設定には削除ポリシーが含まれます
- **セキュリティ**: すべてのリソースでAWS管理暗号化を使用

## 使用方法

デプロイ後、3つの重要なURLが提供されます：

1. **CloudFront URL**: レビュー開始のためのWebインターフェース
2. **API Gateway URL**: プログラマティックアクセス用REST API  
3. **AppSync URL**: リアルタイムデータ用GraphQLエンドポイント

### Webインターフェースの使用

1. CloudFront URLにアクセス
2. 「新しいレビューを開始」ボタンをクリック
3. AWSアカウントIDとリージョンを入力
4. オプションで特定のWell-Architectedの柱を選択
5. レビューの進捗をリアルタイムで監視
6. AIエージェントによる発見事項と推奨事項を確認

### レビューの開始

```javascript
// REST API経由
POST /reviews
{
  "awsAccountId": "123456789012",
  "region": "us-east-1",
  "pillar": "security" // オプション: 特定の柱
}

// GraphQL経由
mutation {
  updateReview(input: {
    reviewId: "review-123",
    status: PENDING
  }) {
    reviewId
    status
  }
}
```

### 進捗の監視

```javascript
// リアルタイム更新のためのGraphQLサブスクリプション
subscription {
  onReviewUpdated(reviewId: "review-123") {
    status
    score
    findings {
      severity
      title
    }
  }
}
```

## データモデル

### レビューエンティティ
- **reviewId**: 一意識別子
- **status**: PENDING | IN_PROGRESS | COMPLETED | FAILED
- **findings**: 発見されたアーキテクチャ課題の配列
- **recommendations**: AI生成の改善提案
- **score**: 全体的なアーキテクチャスコア (0-100)

### 発見事項（Finding）
- **pillar**: Well-Architectedの柱
- **title**: 発見事項のタイトル
- **description**: 詳細な説明
- **severity**: LOW | MEDIUM | HIGH | CRITICAL
- **resourceArn**: 対象AWSリソース
- **service**: AWSサービス名

### 推奨事項（Recommendation）
- **title**: 推奨事項のタイトル
- **description**: 詳細な説明
- **priority**: LOW | MEDIUM | HIGH | CRITICAL
- **effort**: 実装工数の見積もり
- **implementationGuide**: 実装ガイド
- **links**: 参考リンク

### Well-Architected の柱
- 運用性の優秀性
- セキュリティ
- 信頼性
- パフォーマンス効率
- コスト最適化
- 持続可能性

## プロジェクト構造

```
cdkconf-strands-agents/
├── bin/                          # CDKアプリケーションエントリーポイント
├── lib/
│   ├── stacks/
│   │   └── strands-agents-stack.ts    # メインCDKスタック
│   └── constructs/
│       ├── frontend-construct.ts       # CloudFront + S3 + WAF
│       ├── backend-api-construct.ts    # API Gateway + Lambda
│       ├── appsync-construct.ts        # GraphQL API
│       ├── ai-agent-construct.ts       # Bedrock Agent
│       └── async-processing-construct.ts # SQS + Lambda
├── lambda/
│   ├── ai-agent/               # Strands Agents SDK Lambda
│   ├── api-handler/            # REST APIハンドラー
│   ├── async-processor/        # 非同期処理Lambda
│   └── layers/strands-agents/  # Lambda Layer
├── frontend/                   # React + Vite Webアプリケーション
│   ├── src/
│   │   ├── components/         # Reactコンポーネント
│   │   │   ├── ReviewDashboard.tsx
│   │   │   ├── ReviewForm.tsx
│   │   │   ├── ReviewList.tsx
│   │   │   └── ReviewDetails.tsx
│   │   ├── App.tsx            # メインアプリケーション
│   │   └── App.css            # スタイルシート
│   └── dist/                  # ビルド済みファイル
├── schema.graphql             # GraphQLスキーマ定義
└── *.drawio                   # アーキテクチャ図
```

## 開発

### 利用可能なスクリプト

```bash
# CDKプロジェクト
npm run build        # TypeScriptのコンパイル
npm run watch        # 開発用ウォッチモード
npm run test         # Jestテストの実行
npm run synth        # CloudFormationの合成
npm run deploy       # AWSへのデプロイ

# フロントエンド（frontend/ディレクトリ内で実行）
npm run dev          # 開発サーバーの起動
npm run build        # プロダクションビルド
npm run preview      # ビルド結果のプレビュー
```

### テスト

```bash
# すべてのテストを実行
npm test

# 特定のテストスイートを実行
npm test -- --testPathPattern=constructs
npm test -- --testPathPattern=stacks
```

### CDKコマンド

```bash
# デプロイされたスタックと現在の状態を比較
cdk diff

# CloudFormationテンプレートを表示
cdk synth

# 特定のプロファイルでデプロイ
cdk deploy --profile your-profile

# スタックを削除
cdk destroy
```

## セキュリティ

このプロジェクトはAWSセキュリティベストプラクティスを実装しています：

- **暗号化**: すべてのデータを保存時と転送時に暗号化
- **IAM**: きめ細かい権限による最小権限アクセス
- **WAF**: パブリックエンドポイントを保護するWeb Application Firewall
- **VPC**: 該当する場所でのネットワーク分離
- **CDK Nag**: 自動化されたセキュリティコンプライアンスチェック

## 技術スタック

### バックエンド

- **AWS CDK**: インフラストラクチャ as Code
- **AWS Solutions Constructs**: ベストプラクティスパターン
- **AWS Lambda**: サーバーレス関数
- **Amazon DynamoDB**: NoSQLデータベース
- **Amazon SQS**: メッセージキュー
- **AWS AppSync**: GraphQL API
- **Amazon Bedrock**: AI/MLサービス
- **Strands Agents SDK**: AIエージェント開発

### フロントエンド

- **React 19**: UIライブラリ
- **Vite**: 高速ビルドツール
- **TypeScript**: 型安全な開発
- **Apollo Client**: GraphQLクライアント
- **CSS3**: モダンスタイリング

### セキュリティ・監視

- **AWS WAF**: Webアプリケーションファイアウォール
- **AWS KMS**: 暗号化キー管理
- **CDK Nag**: セキュリティ検証
- **CloudWatch**: ログとメトリクス