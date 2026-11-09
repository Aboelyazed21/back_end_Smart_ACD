import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DecisionBadge, DecisionCard, DecisionLegend, RuleCitation } from './Decision';
import type { Decision } from '../../lib/types';

const sample: Decision = {
  status: 'REVIEW_REQUIRED',
  reason_ar: 'يوجد تعارض مانع في بيانات المقرر.',
  reason_en: 'Blocking anomaly.',
  rule_code: 'A-CAT-09',
  article: '9',
  page: '12',
  anomaly_ids: ['A-CAT-09'],
  flags: ['working_value'],
  details: { prerequisite: 'CSC2101' },
};

describe('DecisionBadge', () => {
  it('renders the Arabic label for each status', () => {
    render(<DecisionBadge status="ELIGIBLE" />);
    expect(screen.getByText('مؤهل')).toBeInTheDocument();
  });

  it('renders the review-required label', () => {
    render(<DecisionBadge status="REVIEW_REQUIRED" />);
    expect(screen.getByText('يحتاج مراجعة')).toBeInTheDocument();
  });
});

describe('RuleCitation', () => {
  it('shows the rule, article and page', () => {
    render(<RuleCitation ruleCode="A-REG-01" article="4" page="7" />);
    expect(screen.getByText('A-REG-01')).toBeInTheDocument();
    expect(screen.getByText('مادة 4')).toBeInTheDocument();
    expect(screen.getByText('ص 7')).toBeInTheDocument();
  });
});

describe('DecisionCard', () => {
  it('exposes the decision reason, citation and anomaly', () => {
    render(<DecisionCard decision={sample} title="CSC3101" />);
    expect(screen.getByText('CSC3101')).toBeInTheDocument();
    expect(screen.getByText(sample.reason_ar)).toBeInTheDocument();
    expect(screen.getAllByText('A-CAT-09').length).toBeGreaterThan(0);
    expect(screen.getByText('يحتاج مراجعة')).toBeInTheDocument();
  });

  it('toggles the structured details panel', () => {
    render(<DecisionCard decision={sample} />);
    const toggle = screen.getByRole('button', { name: /عرض تفاصيل القرار/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"prerequisite": "CSC2101"/)).toBeInTheDocument();
  });
});

describe('DecisionLegend', () => {
  it('lists all four outcomes', () => {
    render(<DecisionLegend />);
    expect(screen.getByText('مؤهل')).toBeInTheDocument();
    expect(screen.getByText('غير مؤهل')).toBeInTheDocument();
    expect(screen.getByText('غير معروف')).toBeInTheDocument();
    expect(screen.getByText('يحتاج مراجعة')).toBeInTheDocument();
  });
});
