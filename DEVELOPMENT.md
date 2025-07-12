# 開発ガイド

## 開発環境の起動

```bash
# 開発サーバーの起動
./start-dev.sh

# または個別に起動
npm run watch           # CDK watch mode
cd frontend && npm run dev  # Frontend dev server
```

## 環境変数の設定

フロントエンドの設定は `frontend/.env.local` で行います：

```env
VITE_API_GATEWAY_URL=https://your-api-gateway-url
VITE_APPSYNC_URL=https://your-appsync-url/graphql
VITE_APPSYNC_API_KEY=your-api-key
VITE_AWS_REGION=us-east-1
```

## デプロイ

```bash
# 本番デプロイ
./deploy.sh

# 開発環境のみテスト
npm run synth
```

## よく使うコマンド

```bash
# CDK
npm run build      # TypeScript build
npm run test       # Run tests
npm run synth      # Synthesize CloudFormation
cdk diff          # Show differences

# Frontend  
cd frontend
npm run dev        # Dev server
npm run build      # Production build
npm run preview    # Preview build
```

## トラブルシューティング

1. **TypeScript エラー**: `npm run build` でビルドし直す
2. **依存関係エラー**: `npm install` を実行
3. **CDK エラー**: `cdk doctor` で診断
4. **フロントエンド エラー**: `frontend/` で `npm install` を実行
