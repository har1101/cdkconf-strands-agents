import React, { useState } from 'react';
import { useQuery, useMutation, useSubscription, gql } from '@apollo/client';
import ReviewForm from './ReviewForm';
import ReviewList from './ReviewList';
import ReviewDetails from './ReviewDetails';

const GET_REVIEWS = gql`
  query GetReviews($limit: Int) {
    listReviews(limit: $limit) {
      items {
        reviewId
        status
        awsAccountId
        region
        score
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

const UPDATE_REVIEW_STATUS = gql`
  mutation UpdateReviewStatus($reviewId: String!, $status: ReviewStatus!) {
    updateReviewStatus(reviewId: $reviewId, status: $status) {
      reviewId
      status
      updatedAt
    }
  }
`;

const ON_REVIEW_UPDATED = gql`
  subscription OnReviewUpdated($reviewId: String) {
    onReviewUpdated(reviewId: $reviewId) {
      reviewId
      status
      score
      findings {
        id
        title
        severity
        pillar
      }
      recommendations {
        id
        title
        priority
      }
      updatedAt
    }
  }
`;

interface ReviewDashboardProps {
  apiUrl: string;
}

const ReviewDashboard: React.FC<ReviewDashboardProps> = ({ apiUrl }) => {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: reviewsData, loading: reviewsLoading, refetch } = useQuery(GET_REVIEWS, {
    variables: { limit: 20 },
    pollInterval: 30000, // Poll every 30 seconds for updates
  });

  const [updateReviewStatus] = useMutation(UPDATE_REVIEW_STATUS);

  const { data: subscriptionData } = useSubscription(ON_REVIEW_UPDATED, {
    variables: { reviewId: selectedReviewId },
    skip: !selectedReviewId,
  });

  const handleStartReview = async (reviewData: {
    awsAccountId: string;
    region: string;
    pillar?: string;
  }) => {
    try {
      const response = await fetch(`${apiUrl}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reviewData),
      });

      if (response.ok) {
        const result = await response.json();
        const data = result as { reviewId: string };
        setSelectedReviewId(data.reviewId);
        setShowForm(false);
        refetch();
      }
    } catch (error) {
      console.error('Failed to start review:', error);
    }
  };

  const handleRetryReview = async (reviewId: string) => {
    try {
      await updateReviewStatus({
        variables: {
          reviewId,
          status: 'PENDING',
        },
      });
      refetch();
    } catch (error) {
      console.error('Failed to retry review:', error);
    }
  };

  const reviews = reviewsData?.listReviews?.items || [];

  return (
    <div className="review-dashboard">
      <div className="dashboard-header">
        <h2>Well-Architected レビューダッシュボード</h2>
        <button
          className="start-review-btn"
          onClick={() => setShowForm(true)}
        >
          新しいレビューを開始
        </button>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>新しいレビューを開始</h3>
            <ReviewForm
              onSubmit={handleStartReview}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      <div className="dashboard-content">
        <div className="reviews-panel">
          <h3>レビュー一覧</h3>
          {reviewsLoading ? (
            <div className="loading">読み込み中...</div>
          ) : (
            <ReviewList
              reviews={reviews}
              selectedReviewId={selectedReviewId}
              onSelectReview={setSelectedReviewId}
              onRetryReview={handleRetryReview}
            />
          )}
        </div>

        {selectedReviewId && (
          <div className="details-panel">
            <ReviewDetails
              reviewId={selectedReviewId}
              subscriptionData={subscriptionData}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewDashboard;