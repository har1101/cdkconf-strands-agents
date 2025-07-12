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
