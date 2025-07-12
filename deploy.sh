#!/bin/bash

# AWS Well-Architected Review Platform - デプロイスクリプト
# このスクリプトはCDKプロジェクトとフロントエンドを含む全体をデプロイします

set -e  # エラー時に停止

echo "🚀 AWS Well-Architected Review Platform のデプロイを開始します..."

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

# AWS CLIのチェック
if ! command -v aws &> /dev/null; then
    print_error "AWS CLIがインストールされていません。"
    exit 1
fi

# AWS認証情報のチェック
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS認証情報が設定されていません。aws configure を実行してください。"
    exit 1
fi

# CDK CLIのチェック
if ! command -v cdk &> /dev/null; then
    print_warning "CDK CLIがインストールされていません。インストールしています..."
    npm install -g aws-cdk
fi

print_success "前提条件のチェックが完了しました"

# CDKプロジェクトのビルド
print_info "CDKプロジェクトの依存関係をインストールしています..."
npm install

print_info "CDKプロジェクトをビルドしています..."
npm run build

print_success "CDKプロジェクトのビルドが完了しました"

# フロントエンドのビルド
print_info "フロントエンドの依存関係をインストールしています..."
cd frontend
npm install

print_info "フロントエンドをビルドしています..."
npm run build

print_success "フロントエンドのビルドが完了しました"
cd ..

# CDKブートストラップ（初回のみ必要）
print_info "CDKブートストラップを確認しています..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

if [ -z "$REGION" ]; then
    REGION="us-east-1"
    print_warning "リージョンが設定されていません。デフォルトで us-east-1 を使用します。"
fi

print_info "アカウント: $ACCOUNT_ID, リージョン: $REGION"

# ブートストラップスタックの存在チェック
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION &> /dev/null; then
    print_info "CDKブートストラップを実行しています..."
    cdk bootstrap aws://$ACCOUNT_ID/$REGION
    print_success "CDKブートストラップが完了しました"
else
    print_info "CDKブートストラップ済みです"
fi

# CDK差分の確認
print_info "デプロイ前の差分を確認しています..."
if cdk diff; then
    print_info "差分確認が完了しました"
else
    print_warning "差分確認でエラーが発生しましたが、続行します"
fi

# Strands Agents Lambda Layerのビルド
print_info "Strands Agents Lambda Layerをビルドしています..."
if [ -f "lambda/layers/strands-agents/setup.sh" ]; then
    cd lambda/layers/strands-agents
    chmod +x setup.sh
    ./setup.sh
    cd ../../..
    print_success "Lambda Layerのビルドが完了しました"
else
    print_warning "Lambda Layer setup.shが見つかりません。手動でセットアップが必要かもしれません。"
fi

# デプロイの実行
print_info "スタックをデプロイしています..."
print_warning "このプロセスには5-10分かかる場合があります..."

if cdk deploy --require-approval never; then
    print_success "🎉 デプロイが正常に完了しました！"
    
    # デプロイ後の出力情報を表示
    print_info "デプロイされたリソースの情報:"
    cdk ls
    
    print_info "出力値:"
    aws cloudformation describe-stacks \
        --stack-name StrandsAgentsWellArchitectedStack \
        --query 'Stacks[0].Outputs' \
        --output table \
        --region $REGION 2>/dev/null || print_warning "出力値の取得に失敗しました"
    
    echo ""
    print_success "デプロイが完了しました！"
    print_info "CloudFront URLにアクセスしてアプリケーションを使用できます。"
    print_info "URLは上記の出力値またはAWSコンソールで確認してください。"
    
else
    print_error "デプロイに失敗しました"
    print_info "エラーの詳細を確認し、問題を修正してから再度実行してください。"
    exit 1
fi

# 後処理の提案
echo ""
print_info "🔧 デプロイ後の設定:"
echo "1. フロントエンドのApp.tsxでAPI URLを更新してください"
echo "2. Bedrock Knowledge Baseを手動で設定してください（Docker依存のため）"
echo "3. API Keyの設定が必要な場合は、AppSyncコンソールで確認してください"
echo ""
print_info "📝 有用なコマンド:"
echo "  - ログの確認: aws logs tail /aws/lambda/[function-name] --follow"
echo "  - スタックの削除: cdk destroy"
echo "  - 差分の確認: cdk diff"
echo ""
print_success "デプロイプロセスが完了しました！"