import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { generateId } from '../data-source';
import { loadRuntimeSettings, getRuntimeSetting } from '../../core/config/runtime-settings';

interface AutomationRule {
  id: string;
  name: string;
  condition: {
    metric: 'trade_conversion' | 'visitor_count' | 'inventory_level' | 'device_visitors' | 'campaign_roi';
    operator: '>' | '<' | '>=' | '<=' | '==';
    value: number;
  };
  action: {
    type: 'generate_campaign' | 'send_alert' | 'show_vip_offer' | 'order_stock';
    params: string;
  };
  enabled: boolean;
  createdAt: string;
  lastTriggered: string | null;
  triggerCount: number;
}

interface SimulatedData {
  trade_conversion: number;
  visitor_count: number;
  inventory_level: number;
  device_visitors: number;
  campaign_roi: number;
}

const STORAGE_KEY = 'bi_automation_rules';

const METRIC_LABELS: Record<AutomationRule['condition']['metric'], string> = {
  trade_conversion: 'نسبة التحويل',
  visitor_count: 'عدد الزوار',
  inventory_level: 'مستوى المخزون',
  device_visitors: 'زوار جهاز معين',
  campaign_roi: 'عائد الحملة',
};

const ACTION_LABELS: Record<AutomationRule['action']['type'], string> = {
  generate_campaign: 'إنشاء حملة',
  send_alert: 'إرسال تنبيه',
  show_vip_offer: 'عرض VIP',
  order_stock: 'طلب مخزون',
};

type Template = { name: string; condition: AutomationRule['condition']; action: AutomationRule['action'] };

// Templates read the centralized rule thresholds at use time (DB source of
// truth; safe hardcoded fallbacks retained). Only the numeric thresholds are
// centralized — operators/actions/names stay fixed.
function getTemplates(): Template[] {
  return [
    {
      name: 'المخزون منخفض',
      condition: { metric: 'inventory_level', operator: '<', value: getRuntimeSetting('rules.inventory_low_threshold', 5) },
      action: { type: 'send_alert', params: 'مخزون منخفض — يرجى إعادة الطلب' },
    },
    {
      name: 'زوار كثر لجهاز',
      condition: { metric: 'device_visitors', operator: '>', value: getRuntimeSetting('rules.device_visitors_threshold', 30) },
      action: { type: 'generate_campaign', params: 'حملة استهداف لأجهزة محددة' },
    },
    {
      name: 'تحويل منخفض',
      condition: { metric: 'trade_conversion', operator: '<', value: getRuntimeSetting('rules.trade_conversion_threshold', 10) },
      action: { type: 'send_alert', params: 'نسبة تحويل منخفضة — يرجى المراجعة' },
    },
    {
      name: 'زائر مميز',
      condition: { metric: 'visitor_count', operator: '>', value: getRuntimeSetting('rules.visitor_count_threshold', 90) },
      action: { type: 'show_vip_offer', params: 'عرض VIP للزائر المميز' },
    },
  ];
}

// Centralized default threshold for new rules (DB source of truth; fallback 3).
const defaultRuleThreshold = () => getRuntimeSetting('rules.default_threshold', 3);

const CURRENT_DATA: SimulatedData = {  trade_conversion: 8,
  visitor_count: 95,
  inventory_level: 3,
  device_visitors: 45,
  campaign_roi: 12,
};

function loadRules(): AutomationRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AutomationRule[];
  } catch { /* ignore */ }
  return [];
}

function saveRules(rules: AutomationRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function RuleEngine() {
  const colors = useThemeColors();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [triggered, setTriggered] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{
    name: string;
    metric: AutomationRule['condition']['metric'];
    operator: AutomationRule['condition']['operator'];
    value: number;
    action: AutomationRule['action']['type'];
    params: string;
  }>({
    name: '',
    metric: 'trade_conversion',
    operator: '>',
    value: defaultRuleThreshold(),
    action: 'send_alert',
    params: '',
  });

  useEffect(() => {
    setRules(loadRules());
    loadRuntimeSettings();
  }, []);

  const persist = useCallback((next: AutomationRule[]) => {
    setRules(next);
    saveRules(next);
  }, []);

  const addRule = () => {
    const newRule: AutomationRule = {
      id: generateId(),
      name: form.name || 'قاعدة جديدة',
      condition: { metric: form.metric, operator: form.operator, value: form.value },
      action: { type: form.action, params: form.params },
      enabled: true,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      triggerCount: 0,
    };
    persist([newRule, ...rules]);
    setShowForm(false);
    setForm({ name: '', metric: 'trade_conversion', operator: '>', value: defaultRuleThreshold(), action: 'send_alert', params: '' });
  };

  const addTemplate = (tpl: Template) => {
    const newRule: AutomationRule = {
      id: generateId(),
      name: tpl.name,
      condition: { ...tpl.condition },
      action: { ...tpl.action },
      enabled: true,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      triggerCount: 0,
    };
    persist([newRule, ...rules]);
  };

  const toggleEnabled = (id: string) => {
    persist(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: string) => {
    persist(rules.filter(r => r.id !== id));
  };

  const evaluateRules = () => {
    const t = new Set<string>();
    const next = rules.map(r => {
      if (!r.enabled) return r;
      const dataVal = CURRENT_DATA[r.condition.metric];
      let fired = false;
      switch (r.condition.operator) {
        case '>': fired = dataVal > r.condition.value; break;
        case '<': fired = dataVal < r.condition.value; break;
        case '>=': fired = dataVal >= r.condition.value; break;
        case '<=': fired = dataVal <= r.condition.value; break;
        case '==': fired = dataVal === r.condition.value; break;
      }
      if (fired) {
        t.add(r.id);
        return { ...r, lastTriggered: new Date().toISOString(), triggerCount: r.triggerCount + 1 };
      }
      return r;
    });
    setTriggered(t);
    persist(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>محرك القواعد (IF-THEN)</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={evaluateRules} style={{
            padding: '7px 16px', borderRadius: '8px', border: 'none',
            background: colors.accent, color: '#000', fontSize: '0.78rem',
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            تشغيل القواعد
          </button>
          <button onClick={() => setShowForm(true)} style={{
            padding: '7px 16px', borderRadius: '8px', border: `1px solid ${colors.borderLight}`,
            background: colors.bgInput, color: colors.text, fontSize: '0.78rem',
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            + إضافة قاعدة
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{
          background: colors.bgCard, border: `1px solid ${colors.accent}`,
          borderRadius: '12px', padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <input
            placeholder="اسم القاعدة"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`,
              background: colors.bgInput, color: colors.text, fontSize: '0.82rem',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: colors.textSecondary, fontSize: '0.78rem', alignSelf: 'center' }}>إذا كان</span>
            <select
              value={form.metric}
              onChange={e => setForm(f => ({ ...f, metric: e.target.value as AutomationRule['condition']['metric'] }))}
              style={{
                padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '0.78rem',
                fontFamily: 'inherit', outline: 'none',
              }}
            >
              {Object.entries(METRIC_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={form.operator}
              onChange={e => setForm(f => ({ ...f, operator: e.target.value as AutomationRule['condition']['operator'] }))}
              style={{
                padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '0.78rem',
                fontFamily: 'inherit', outline: 'none',
              }}
            >
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
              <option value="==">==</option>
            </select>
            <input
              type="number"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
              style={{
                width: '70px', padding: '6px 10px', borderRadius: '6px',
                border: `1px solid ${colors.border}`, background: colors.bgInput,
                color: colors.text, fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none',
              }}
            />
            <span style={{ color: colors.textSecondary, fontSize: '0.78rem', alignSelf: 'center' }}>ثم</span>
            <select
              value={form.action}
              onChange={e => setForm(f => ({ ...f, action: e.target.value as AutomationRule['action']['type'] }))}
              style={{
                padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '0.78rem',
                fontFamily: 'inherit', outline: 'none',
              }}
            >
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <input
            placeholder="معلمات الإجراء (مثل: نص التنبيه)"
            value={form.params}
            onChange={e => setForm(f => ({ ...f, params: e.target.value }))}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`,
              background: colors.bgInput, color: colors.text, fontSize: '0.82rem',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addRule} style={{
              padding: '7px 16px', borderRadius: '8px', border: 'none',
              background: colors.accent, color: '#000', fontSize: '0.78rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              حفظ القاعدة
            </button>
            <button onClick={() => setShowForm(false)} style={{
              padding: '7px 16px', borderRadius: '8px', border: `1px solid ${colors.borderLight}`,
              background: 'transparent', color: colors.textMuted, fontSize: '0.78rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '12px 16px',
      }}>
        <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginBottom: '8px' }}>قوالب جاهزة</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {getTemplates().map((tpl, i) => (
            <button key={i} onClick={() => addTemplate(tpl)} style={{
              padding: '5px 12px', borderRadius: '6px', border: `1px solid ${colors.borderLight}`,
              background: colors.bgHover, color: colors.textSecondary, fontSize: '0.72rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              + {tpl.name}
            </button>
          ))}
        </div>
      </div>

      {rules.length === 0 ? (
        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
          لا توجد قواعد بعد. أضف قاعدة جديدة أو استخدم القوالب الجاهزة.
        </div>
      ) : (
        rules.map(rule => {
          const isTriggered = triggered.has(rule.id);
          return (
            <div key={rule.id} style={{
              background: colors.bgCard,
              border: `1px solid ${isTriggered ? colors.success : rule.enabled ? colors.border : colors.borderLight}`,
              borderRight: `4px solid ${isTriggered ? colors.success : rule.enabled ? colors.accent : colors.textFaint}`,
              borderRadius: '12px', padding: '12px 16px',
              opacity: rule.enabled ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: colors.text, fontSize: '0.88rem', fontWeight: 600 }}>{rule.name}</span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700,
                      background: isTriggered ? colors.successBg : rule.enabled ? colors.infoBg : colors.textFaint + '30',
                      color: isTriggered ? colors.successText : rule.enabled ? colors.info : colors.textMuted,
                    }}>
                      {isTriggered ? '✓ نشط الآن' : rule.enabled ? 'نشط' : 'معطل'}
                    </span>
                    {isTriggered && <span style={{ color: colors.successText, fontSize: '0.9rem' }}>✓</span>}
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginTop: '4px' }}>
                    إذا كان {METRIC_LABELS[rule.condition.metric]} {rule.condition.operator} {rule.condition.value}
                    {' ← '}
                    {ACTION_LABELS[rule.action.type]}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                    <span style={{ color: colors.textFaint, fontSize: '0.65rem' }}>
                      آخر تشغيل: {rule.lastTriggered ? new Date(rule.lastTriggered).toLocaleDateString('ar-DZ', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                    <span style={{ color: colors.textFaint, fontSize: '0.65rem' }}>
                      عدد مرات التشغيل: {rule.triggerCount}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={() => toggleEnabled(rule.id)}
                    style={{
                      padding: '5px 10px', borderRadius: '6px', border: 'none',
                      background: rule.enabled ? colors.dangerBg : colors.successBg,
                      color: rule.enabled ? colors.dangerText : colors.successText,
                      fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {rule.enabled ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    style={{
                      padding: '5px 10px', borderRadius: '6px', border: 'none',
                      background: colors.dangerBg, color: colors.dangerText,
                      fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    حذف
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
