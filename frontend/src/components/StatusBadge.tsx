import React from 'react';

const STATUS_MAP: Record<string, string> = {
  active: 'badge-success',
  paid: 'badge-success',
  running: 'badge-success',
  valid: 'badge-success',
  created: 'badge-success',
  confirmed: 'badge-info',
  quotation: 'badge-info',
  scheduled: 'badge-info',
  paused: 'badge-warning',
  draft: 'badge-neutral',
  none: 'badge-neutral',
  inactive: 'badge-neutral',
  closed: 'badge-danger',
  cancelled: 'badge-danger',
  disabled: 'badge-danger',
  expired: 'badge-danger',
  exhausted: 'badge-warning',
  overdue: 'badge-danger',
  invalid: 'badge-danger',
};

export const StatusBadge: React.FC<{ status: string; label?: string }> = ({
  status,
  label,
}) => {
  const key = (status || '').toLowerCase();
  const cls = STATUS_MAP[key] || 'badge-neutral';
  return <span className={`badge ${cls}`}>{label || status}</span>;
};
