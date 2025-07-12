import React from 'react';
import { useQuery, gql } from '@apollo/client';

const GET_REVIEW = gql`
  query GetReview($reviewId: String!) {
    getReview(reviewId: $reviewId) {
      reviewId
      status
      awsAccountId
      region
      pillar
      score
      findings {
        id
        pillar
        title
        description
        severity
        resourceArn
        service
      }
      recommendations {
        id
        title
        description
        priority
        effort
        implementationGuide
        links
      }
      createdAt
      updatedAt
    }
  }
`;

interface ReviewDetailsProps {
  reviewId: string;
  subscriptionData?: any;
}

const ReviewDetails: React.FC<ReviewDetailsProps> = ({ reviewId, subscriptionData }) => {
  const { data, loading, error } = useQuery(GET_REVIEW, {
    variables: { reviewId },
    pollInterval: 10000, // Poll every 10 seconds
  });

  const review = subscriptionData?.onReviewUpdated || data?.getReview;

  if (loading && !review) {
    return (
      <div className="review-details loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>レビュー詳細を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="review-details error">
        <h3>エラーが発生しました</h3>
        <p>{error.message}</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="review-details empty">
        <p>レビューが見つかりません</p>
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    const severityMap: { [key: string]: string } = {
      CRITICAL: 'severity-critical',
      HIGH: 'severity-high',
      MEDIUM: 'severity-medium',
      LOW: 'severity-low'
    };
    return severityMap[severity] || 'severity-medium';
  };

  const getPriorityColor = (priority: string) => {
    const priorityMap: { [key: string]: string } = {
      CRITICAL: 'priority-critical',
      HIGH: 'priority-high',
      MEDIUM: 'priority-medium',
      LOW: 'priority-low'
    };
    return priorityMap[priority] || 'priority-medium';
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

  return (
    <div className="review-details">
      <div className="details-header">
        <h3>レビュー詳細</h3>
        <div className="review-meta">
          <span className="review-id">ID: {review.reviewId}</span>
          <span className={`status ${review.status.toLowerCase()}`}>
            {review.status === 'PENDING' && '待機中'}
            {review.status === 'IN_PROGRESS' && '処理中'}
            {review.status === 'COMPLETED' && '完了'}
            {review.status === 'FAILED' && '失敗'}
          </span>
        </div>
      </div>

      <div className="review-info">
        <div className="info-row">
          <label>AWSアカウント:</label>
          <span>{review.awsAccountId}</span>
        </div>
        <div className="info-row">
          <label>リージョン:</label>
          <span>{review.region}</span>
        </div>
        {review.pillar && (
          <div className="info-row">
            <label>対象の柱:</label>
            <span>{review.pillar}</span>
          </div>
        )}
        <div className="info-row">
          <label>作成日時:</label>
          <span>{formatDate(review.createdAt)}</span>
        </div>
        <div className="info-row">
          <label>更新日時:</label>
          <span>{formatDate(review.updatedAt)}</span>
        </div>
      </div>

      {review.score !== undefined && (
        <div className="score-section">
          <h4>総合スコア</h4>
          <div className={`score-display ${getScoreColor(review.score)}`}>
            <span className="score-value">{review.score.toFixed(1)}</span>
            <span className="score-max">/100</span>
          </div>
        </div>
      )}

      {review.findings && review.findings.length > 0 && (
        <div className="findings-section">
          <h4>発見事項 ({review.findings.length}件)</h4>
          <div className="findings-list">
            {review.findings.map((finding: any) => (
              <div key={finding.id} className="finding-item">
                <div className="finding-header">
                  <h5>{finding.title}</h5>
                  <span className={`severity-badge ${getSeverityColor(finding.severity)}`}>
                    {finding.severity}
                  </span>
                </div>
                <div className="finding-details">
                  <div className="pillar">柱: {finding.pillar}</div>
                  {finding.service && (
                    <div className="service">サービス: {finding.service}</div>
                  )}
                  {finding.resourceArn && (
                    <div className="resource">リソース: {finding.resourceArn}</div>
                  )}
                </div>
                <p className="finding-description">{finding.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {review.recommendations && review.recommendations.length > 0 && (
        <div className="recommendations-section">
          <h4>推奨事項 ({review.recommendations.length}件)</h4>
          <div className="recommendations-list">
            {review.recommendations.map((recommendation: any) => (
              <div key={recommendation.id} className="recommendation-item">
                <div className="recommendation-header">
                  <h5>{recommendation.title}</h5>
                  <span className={`priority-badge ${getPriorityColor(recommendation.priority)}`}>
                    {recommendation.priority}
                  </span>
                </div>
                <div className="recommendation-effort">
                  実装工数: {recommendation.effort}
                </div>
                <p className="recommendation-description">{recommendation.description}</p>
                {recommendation.implementationGuide && (
                  <div className="implementation-guide">
                    <h6>実装ガイド:</h6>
                    <p>{recommendation.implementationGuide}</p>
                  </div>
                )}
                {recommendation.links && recommendation.links.length > 0 && (
                  <div className="recommendation-links">
                    <h6>参考リンク:</h6>
                    <ul>
                      {recommendation.links.map((link: string, index: number) => (
                        <li key={index}>
                          <a href={link} target="_blank" rel="noopener noreferrer">
                            {link}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {review.status === 'IN_PROGRESS' && (
        <div className="progress-section">
          <div className="progress-indicator">
            <div className="spinner"></div>
            <p>AIエージェントがアーキテクチャを分析中です...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewDetails;