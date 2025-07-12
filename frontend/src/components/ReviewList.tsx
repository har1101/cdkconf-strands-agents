import React from 'react';

interface Review {
  reviewId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  awsAccountId: string;
  region: string;
  score?: number;
  createdAt: string;
  updatedAt: string;
}

interface ReviewListProps {
  reviews: Review[];
  selectedReviewId: string | null;
  onSelectReview: (reviewId: string) => void;
  onRetryReview: (reviewId: string) => void;
}

const ReviewList: React.FC<ReviewListProps> = ({
  reviews,
  selectedReviewId,
  onSelectReview,
  onRetryReview
}) => {
  const getStatusDisplay = (status: Review['status']) => {
    const statusMap = {
      PENDING: { label: '待機中', class: 'status-pending' },
      IN_PROGRESS: { label: '処理中', class: 'status-in-progress' },
      COMPLETED: { label: '完了', class: 'status-completed' },
      FAILED: { label: '失敗', class: 'status-failed' }
    };
    return statusMap[status];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-warning';
    return 'score-poor';
  };

  if (reviews.length === 0) {
    return (
      <div className="empty-state">
        <p>まだレビューがありません</p>
        <p>新しいレビューを開始してください</p>
      </div>
    );
  }

  return (
    <div className="review-list">
      {reviews.map((review) => {
        const statusInfo = getStatusDisplay(review.status);
        const isSelected = review.reviewId === selectedReviewId;

        return (
          <div
            key={review.reviewId}
            className={`review-item ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectReview(review.reviewId)}
          >
            <div className="review-header">
              <div className="review-id">
                <strong>{review.reviewId.slice(0, 8)}...</strong>
              </div>
              <div className={`status-badge ${statusInfo.class}`}>
                {statusInfo.label}
              </div>
            </div>

            <div className="review-details">
              <div className="account-info">
                <span className="label">アカウント:</span>
                <span className="value">{review.awsAccountId}</span>
              </div>
              <div className="region-info">
                <span className="label">リージョン:</span>
                <span className="value">{review.region}</span>
              </div>
            </div>

            {review.score !== undefined && (
              <div className="score-info">
                <span className="label">スコア:</span>
                <span className={`score ${getScoreColor(review.score)}`}>
                  {review.score.toFixed(1)}
                </span>
              </div>
            )}

            <div className="review-dates">
              <div className="created-date">
                <span className="label">作成:</span>
                <span className="value">{formatDate(review.createdAt)}</span>
              </div>
              <div className="updated-date">
                <span className="label">更新:</span>
                <span className="value">{formatDate(review.updatedAt)}</span>
              </div>
            </div>

            {review.status === 'FAILED' && (
              <div className="review-actions">
                <button
                  className="retry-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetryReview(review.reviewId);
                  }}
                >
                  再試行
                </button>
              </div>
            )}

            {review.status === 'IN_PROGRESS' && (
              <div className="progress-indicator">
                <div className="spinner"></div>
                <span>処理中...</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ReviewList;