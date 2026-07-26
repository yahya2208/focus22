import { useTranslation } from '../../hooks/useTranslation';

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

interface Props {
  steps: FunnelStep[];
  title?: string;
}

export function FunnelChart({ steps, title }: Props) {
  const { t } = useTranslation();
  const maxVal = steps[0]?.value ?? 1;
  return (
    <div>
      {title && <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{title}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {steps.map((step, i) => {
          const pct = maxVal > 0 ? (step.value / maxVal) * 100 : 0;
          const prevVal = steps[i - 1]?.value;
          const convFromPrev = i > 0 && prevVal != null && prevVal > 0 ? ((step.value / prevVal) * 100).toFixed(1) : null;
          return (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '140px', textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#ccc' }}>{step.label}</p>
                {convFromPrev && <p style={{ margin: 0, fontSize: '0.6rem', color: '#666' }}>{convFromPrev}% {t('campaign.fromPrev')}</p>}
              </div>
              <div style={{ flex: 1, height: '28px', background: '#1e1e2e', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  width: `${pct}%`, height: '100%', background: step.color, borderRadius: '4px',
                  transition: 'width 0.5s ease', minWidth: step.value > 0 ? '2px' : 0,
                }} />
              </div>
              <span style={{ width: '50px', fontSize: '0.8rem', color: '#f0f0f0', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{step.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
