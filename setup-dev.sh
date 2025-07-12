#!/bin/bash

# AWS Well-Architected Review Platform - 開発環境セットアップスクリプト
# このスクリプトは開発環境のセットアップとローカル開発サーバーの起動を行います

set -e  # エラー時に停止

echo "🛠️ 開発環境をセットアップしています..."

# 色付きメッセージ用の関数
print_success() {
    echo -e "\033[32m✅ $1\033[0m"
}

print_info() {
    echo -e "\033[34mℹ️  $1\033[0m"
}

print_warning() {
    echo -e "\033[33m⚠️  $1\033[0m"
}

print_error() {
    echo -e "\033[31m❌ $1\033[0m"
}

# 前提条件のチェック
print_info "前提条件をチェックしています..."

# Node.jsのチェック
if ! command -v node &> /dev/null; then
    print_error "Node.jsがインストールされていません。Node.js 18.x以降をインストールしてください。"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
if [[ $(echo "$NODE_VERSION 18.0.0" | tr " " "\n" | sort -V | head -n1) != "18.0.0" ]]; then
    print_error "Node.js 18.x以降が必要です。現在のバージョン: $NODE_VERSION"
    exit 1
fi

print_success "Node.js チェック完了: $NODE_VERSION"

# CDKプロジェクトのセットアップ
print_info "CDKプロジェクトの依存関係をインストールしています..."
npm install

print_info "CDKプロジェクトをビルドしています..."
npm run build

print_success "CDKプロジェクトのセットアップが完了しました"

# フロントエンドのセットアップ
print_info "フロントエンドの依存関係をインストールしています..."
cd frontend
npm install

print_info "フロントエンドをビルドしています..."
npm run build

print_success "フロントエンドのセットアップが完了しました"
cd ..

# 開発用ファイルの生成
print_info "開発用設定ファイルを生成しています..."

# フロントエンド用の環境変数ファイル（例）
cat > frontend/.env.local << EOF
# 開発用環境変数
# デプロイ後に実際のURLに更新してください
VITE_API_GATEWAY_URL=https://your-api-gateway-url
VITE_APPSYNC_URL=https://your-appsync-url/graphql
VITE_APPSYNC_API_KEY=your-api-key
VITE_AWS_REGION=us-east-1
EOF

print_success "環境変数ファイルを生成しました: frontend/.env.local"

# 開発用スクリプトの生成
cat > start-dev.sh << 'EOF'
#!/bin/bash

echo "🚀 開発サーバーを起動しています..."

# バックグラウンドでCDKのwatchモードを起動
echo "CDK watch モードを起動中..."
npm run watch &
CDK_PID=$!

# フロントエンド開発サーバーを起動
echo "フロントエンド開発サーバーを起動中..."
cd frontend
npm run dev &
FRONTEND_PID=$!

echo "開発サーバーが起動しました！"
echo "フロントエンド: http://localhost:5173"
echo ""
echo "停止するには Ctrl+C を押してください"

# 終了処理
cleanup() {
    echo "開発サーバーを停止しています..."
    kill $CDK_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# プロセスが終了するまで待機
wait
EOF

chmod +x start-dev.sh

print_success "開発用スクリプトを生成しました: start-dev.sh"

# Strands Agents Lambda Layerのセットアップ
print_info "Strands Agents Lambda Layerをセットアップしています..."
if [ -f "lambda/layers/strands-agents/setup.sh" ]; then
    cd lambda/layers/strands-agents
    chmod +x setup.sh
    print_info "Lambda Layer setup.shを実行可能にしました"
    cd ../../..
else
    print_warning "Lambda Layer setup.shが見つかりません"
fi

# 開発用README生成
cat > DEVELOPMENT.md << 'EOF'
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
EOF

print_success "開発ガイドを生成しました: DEVELOPMENT.md"

echo ""
print_success "🎉 開発環境のセットアップが完了しました！"
echo ""
print_info "次のステップ:"
echo "1. ./start-dev.sh で開発サーバーを起動"
echo "2. frontend/.env.local で環境変数を設定"
echo "3. ./deploy.sh でAWSにデプロイ"
echo "4. DEVELOPMENT.md で詳細な開発ガイドを確認"
echo ""
print_info "開発サーバー:"
echo "- フロントエンド: http://localhost:5173"
echo "- CDKの変更は自動的に監視されます"