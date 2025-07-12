import React, { useState } from 'react';

interface ReviewFormProps {
  onSubmit: (data: {
    awsAccountId: string;
    region: string;
    pillar?: string;
  }) => void;
  onCancel: () => void;
}

const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1'
];

const PILLARS = [
  { value: '', label: 'すべての柱' },
  { value: 'operational-excellence', label: '運用の優秀性' },
  { value: 'security', label: 'セキュリティ' },
  { value: 'reliability', label: '信頼性' },
  { value: 'performance-efficiency', label: 'パフォーマンス効率' },
  { value: 'cost-optimization', label: 'コスト最適化' },
  { value: 'sustainability', label: '持続可能性' }
];

const ReviewForm: React.FC<ReviewFormProps> = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    awsAccountId: '',
    region: 'us-east-1',
    pillar: ''
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.awsAccountId.trim()) {
      newErrors.awsAccountId = 'AWSアカウントIDは必須です';
    } else if (!/^\d{12}$/.test(formData.awsAccountId.trim())) {
      newErrors.awsAccountId = 'AWSアカウントIDは12桁の数字である必要があります';
    }

    if (!formData.region) {
      newErrors.region = 'リージョンを選択してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      const submitData = {
        awsAccountId: formData.awsAccountId.trim(),
        region: formData.region,
        ...(formData.pillar && { pillar: formData.pillar })
      };
      onSubmit(submitData);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="review-form">
      <div className="form-group">
        <label htmlFor="awsAccountId">
          AWSアカウントID *
        </label>
        <input
          type="text"
          id="awsAccountId"
          value={formData.awsAccountId}
          onChange={(e) => handleInputChange('awsAccountId', (e.target as HTMLInputElement).value)}
          placeholder="123456789012"
          className={errors.awsAccountId ? 'error' : ''}
        />
        {errors.awsAccountId && (
          <span className="error-message">{errors.awsAccountId}</span>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="region">
          AWSリージョン *
        </label>
        <select
          id="region"
          value={formData.region}
          onChange={(e) => handleInputChange('region', (e.target as HTMLSelectElement).value)}
          className={errors.region ? 'error' : ''}
        >
          {REGIONS.map(region => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
        {errors.region && (
          <span className="error-message">{errors.region}</span>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="pillar">
          Well-Architectedの柱（オプション）
        </label>
        <select
          id="pillar"
          value={formData.pillar}
          onChange={(e) => handleInputChange('pillar', (e.target as HTMLSelectElement).value)}
        >
          {PILLARS.map(pillar => (
            <option key={pillar.value} value={pillar.value}>
              {pillar.label}
            </option>
          ))}
        </select>
        <small className="form-hint">
          特定の柱のみを評価する場合は選択してください
        </small>
      </div>

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn-secondary">
          キャンセル
        </button>
        <button type="submit" className="btn-primary">
          レビューを開始
        </button>
      </div>
    </form>
  );
};

export default ReviewForm;