import type { DataSource } from './data-source';

export function DemoBadge({ source }: { source: DataSource }) {
  if (source === 'live') return null;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '4px',
      background: '#f39c1220', color: '#f39c12',
      fontSize: '0.6rem', fontWeight: 700,
      letterSpacing: '0.04em',
    }}>
      <span style={{ fontSize: '0.5rem' }}>⚠</span>
      {source === 'demo' ? 'DEMO' : source === 'partial' ? 'PARTIAL' : 'CACHED'}
    </span>
  );
}

export function DemoNotice() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 14px', borderRadius: '8px',
      background: '#f39c1220', border: '1px solid #f39c1240',
      color: '#f39c12', fontSize: '0.72rem',
    }}>
      <span>⚠</span>
      <span>بعض البيانات المعروضة هي بيانات تجريبية. قم بتوصيل قاعدة بيانات حقيقية للحصول على نتائج دقيقة.</span>
    </div>
  );
}
