import { useState, useEffect, useCallback, memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, HStack } from '../../design-system/layout';
import { getRepairRepository } from '../../services/repair/repair-repository';
import type { Courier, Technician } from '../../services/repair/repair-types';

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

type Tab = 'couriers' | 'technicians';

const DEFAULT_COURIERS: Omit<Courier, 'id' | 'createdAt'>[] = [
  { name: 'أحمد', phone: '0551000001', whatsapp: '0551000001', vehicle: 'سيارة', status: 'active', notes: '' },
  { name: 'محمد', phone: '0551000002', whatsapp: '0551000002', vehicle: 'دراجة نارية', status: 'active', notes: '' },
  { name: 'ياسين', phone: '0551000003', whatsapp: '0551000003', vehicle: 'سيارة', status: 'active', notes: '' },
  { name: 'كريم', phone: '0551000004', whatsapp: '0551000004', vehicle: 'شاحنة صغيرة', status: 'active', notes: '' },
];

const DEFAULT_TECHNICIANS: Omit<Technician, 'id' | 'createdAt'>[] = [
  { name: 'علي', phone: '0552000001', specialty: 'هواتف ذكية', status: 'active', notes: '' },
  { name: 'خالد', phone: '0552000002', specialty: 'حاسوب', status: 'active', notes: '' },
  { name: 'سامي', phone: '0552000003', specialty: 'تابلت', status: 'active', notes: '' },
];

export const RepairPersonnelScreen = memo(function RepairPersonnelScreen() {
  const dispatch = useAppDispatch();
  const { t: translate, dir } = useTranslation();
  const t = translate as (key: string) => string;
  const colors = useThemeColors();
  const isRtl = dir === 'rtl';

  const [tab, setTab] = useState<Tab>('couriers');
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const repo = getRepairRepository();

  const loadData = useCallback(async () => {
    setCouriers(await repo.getAllCouriers());
    setTechnicians(await repo.getAllTechnicians());
  }, [repo]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (couriers.length === 0 && technicians.length === 0) {
      (async () => {
        for (const c of DEFAULT_COURIERS) {
          await repo.saveCourier({ ...c, id: uid(), createdAt: new Date().toISOString() });
        }
        for (const t of DEFAULT_TECHNICIANS) {
          await repo.saveTechnician({ ...t, id: uid(), createdAt: new Date().toISOString() });
        }
        await loadData();
      })();
    }
  }, [couriers.length, technicians.length, repo, loadData]);

  const startEdit = useCallback((item: Courier | Technician) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPhone(item.phone);
    setEditNotes(item.notes);
    if ('vehicle' in item) {
      const c = item as Courier;
      setEditWhatsapp(c.whatsapp);
      setEditVehicle(c.vehicle);
    } else {
      const t = item as Technician;
      setEditSpecialty(t.specialty);
    }
  }, []);

  const startAdd = useCallback(() => {
    setEditingId('new');
    setEditName('');
    setEditPhone('');
    setEditWhatsapp('');
    setEditVehicle('');
    setEditSpecialty('');
    setEditNotes('');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editName.trim()) return;
    const now = new Date().toISOString();
    if (editingId === 'new') {
      if (tab === 'couriers') {
        await repo.saveCourier({ id: uid(), name: editName.trim(), phone: editPhone, whatsapp: editWhatsapp, vehicle: editVehicle, status: 'active', notes: editNotes, createdAt: now });
      } else {
        await repo.saveTechnician({ id: uid(), name: editName.trim(), phone: editPhone, specialty: editSpecialty, status: 'active', notes: editNotes, createdAt: now });
      }
    } else if (editingId) {
      if (tab === 'couriers') {
        const existing = couriers.find(c => c.id === editingId);
        if (existing) await repo.saveCourier({ ...existing, name: editName.trim(), phone: editPhone, whatsapp: editWhatsapp, vehicle: editVehicle, notes: editNotes });
      } else {
        const existing = technicians.find(t => t.id === editingId);
        if (existing) await repo.saveTechnician({ ...existing, name: editName.trim(), phone: editPhone, specialty: editSpecialty, notes: editNotes });
      }
    }
    setEditingId(null);
    await loadData();
  }, [editingId, editName, editPhone, editWhatsapp, editVehicle, editSpecialty, editNotes, tab, repo, couriers, technicians, loadData]);

  const toggleStatus = useCallback(async (item: Courier | Technician, type: Tab) => {
    if (type === 'couriers') {
      const c = item as Courier;
      await repo.saveCourier({ ...c, status: c.status === 'active' ? 'inactive' : 'active' });
    } else {
      const t = item as Technician;
      await repo.saveTechnician({ ...t, status: t.status === 'active' ? 'inactive' : 'active' });
    }
    await loadData();
  }, [repo, loadData]);

  const handleDelete = useCallback(async (id: string, type: Tab) => {
    if (type === 'couriers') await repo.deleteCourier(id);
    else await repo.deleteTechnician(id);
    await loadData();
  }, [repo, loadData]);

  const inputStyle: React.CSSProperties = {
    background: colors.bgInput, border: `1px solid ${colors.border}`,
    color: colors.text, borderRadius: '10px', padding: '0.6rem 0.8rem',
    width: '100%', fontFamily: 'inherit', fontSize: '0.85rem',
    boxSizing: 'border-box', outline: 'none', marginBottom: '0.5rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600,
    color: colors.textSecondary, marginBottom: '0.2rem',
  };

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard, borderRadius: '12px',
    border: `1px solid ${colors.borderLight}`, padding: '0.75rem',
    marginBottom: '0.5rem',
  };

  const btnPrimary: React.CSSProperties = {
    background: colors.accent, color: '#fff', border: 'none',
    borderRadius: '10px', padding: '0.6rem 1.2rem', fontSize: '0.85rem',
    fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  };

  const btnDanger: React.CSSProperties = {
    background: 'transparent', color: '#ef4444', border: `1px solid #ef4444`,
    borderRadius: '10px', padding: '0.4rem 0.8rem', fontSize: '0.75rem',
    fontFamily: 'inherit', cursor: 'pointer',
  };

  const list = tab === 'couriers' ? couriers : technicians;

  return (
    <Screen ariaLabel="إدارة المندوبين والفنيين" scroll>
      <div style={{ direction: dir, padding: '0.5rem 0' }}>
        <HStack justify="space-between" align="center" style={{ marginBottom: '1rem' }}>
          <h1 style={{ color: colors.text, fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
            {t('repair.personnel') || 'إدارة المندوبين والفنيين'}
          </h1>
          <button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-home' })} style={{
            background: 'none', border: `1px solid ${colors.borderLight}`,
            color: colors.textMuted, borderRadius: '10px', padding: '0.4rem 0.8rem',
            fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {isRtl ? '← رجوع' : '← Back'}
          </button>
        </HStack>

        <HStack gap="xs" wrap style={{ marginBottom: '1rem' }}>
          <button onClick={() => setTab('couriers')} style={{
            padding: '0.5rem 1rem', borderRadius: '10px', border: 'none',
            background: tab === 'couriers' ? colors.accent : colors.bgInput,
            color: tab === 'couriers' ? '#fff' : colors.textSecondary,
            fontSize: '0.85rem', fontWeight: tab === 'couriers' ? 700 : 500,
            fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {t('repair.couriers') || 'المندوبين'} ({couriers.length})
          </button>
          <button onClick={() => setTab('technicians')} style={{
            padding: '0.5rem 1rem', borderRadius: '10px', border: 'none',
            background: tab === 'technicians' ? colors.accent : colors.bgInput,
            color: tab === 'technicians' ? '#fff' : colors.textSecondary,
            fontSize: '0.85rem', fontWeight: tab === 'technicians' ? 700 : 500,
            fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {t('repair.technicians') || 'الفنيين'} ({technicians.length})
          </button>
        </HStack>

        {editingId && (
          <div style={cardStyle}>
            <h3 style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
              {editingId === 'new' ? (tab === 'couriers' ? 'إضافة مندوب' : 'إضافة فني') : 'تعديل'}
            </h3>
            <label style={labelStyle}>{t('common.name') || 'الاسم'}</label>
            <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} placeholder="الاسم" />
            <label style={labelStyle}>{t('common.phone') || 'رقم الهاتف'}</label>
            <input style={inputStyle} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="05XX XX XX XX" />
            <label style={labelStyle}>{t('common.notes') || 'ملاحظات'}</label>
            <input style={inputStyle} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="..." />
            {tab === 'couriers' && (
              <>
                <label style={labelStyle}>{t('repair.whatsapp') || 'واتساب'}</label>
                <input style={inputStyle} value={editWhatsapp} onChange={e => setEditWhatsapp(e.target.value)} placeholder="05XX XX XX XX" />
                <label style={labelStyle}>{t('repair.vehicle') || 'وسيلة النقل'}</label>
                <input style={inputStyle} value={editVehicle} onChange={e => setEditVehicle(e.target.value)} placeholder="سيارة / دراجة نارية" />
              </>
            )}
            {tab === 'technicians' && (
              <>
                <label style={labelStyle}>{t('repair.specialty') || 'التخصص'}</label>
                <input style={inputStyle} value={editSpecialty} onChange={e => setEditSpecialty(e.target.value)} placeholder="هواتف ذكية / حاسوب" />
              </>
            )}
            <HStack gap="sm" style={{ marginTop: '0.5rem' }}>
              <button onClick={saveEdit} style={btnPrimary}>
                {editingId === 'new' ? (t('common.add') || 'إضافة') : (t('common.save') || 'حفظ')}
              </button>
              <button onClick={cancelEdit} style={{ ...btnPrimary, background: colors.border }}>
                {t('common.cancel') || 'إلغاء'}
              </button>
            </HStack>
          </div>
        )}

        {!editingId && (
          <button onClick={() => startAdd()} style={{ ...btnPrimary, marginBottom: '0.75rem', width: '100%' }}>
            + {tab === 'couriers' ? (t('repair.addCourier') || 'إضافة مندوب') : (t('repair.addTechnician') || 'إضافة فني')}
          </button>
        )}

        <div style={{ marginTop: '0.5rem' }}>
          {list.map(item => (
            <div key={item.id} style={cardStyle}>
              <HStack justify="space-between" align="center">
                <div>
                  <div style={{ color: colors.text, fontSize: '0.9rem', fontWeight: 600 }}>
                    {item.name}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
                    {item.phone}
                    {tab === 'couriers' && ` - ${(item as Courier).vehicle}`}
                    {tab === 'technicians' && ` - ${(item as Technician).specialty}`}
                  </div>
                  <span style={{
                    fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '8px',
                    background: item.status === 'active' ? '#22c55e33' : '#ef444433',
                    color: item.status === 'active' ? '#22c55e' : '#ef4444',
                  }}>
                    {item.status === 'active' ? (t('common.active') || 'نشط') : (t('common.inactive') || 'غير نشط')}
                  </span>
                </div>
                <HStack gap="xs">
                  <button onClick={() => startEdit(item)} style={{
                    background: 'none', border: 'none', color: colors.accent,
                    fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {t('common.edit') || 'تعديل'}
                  </button>
                  <button onClick={() => toggleStatus(item, tab)} style={{
                    background: 'none', border: 'none', color: colors.warning,
                    fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {item.status === 'active' ? (t('common.deactivate') || 'تعطيل') : (t('common.activate') || 'تفعيل')}
                  </button>
                  <button onClick={() => handleDelete(item.id, tab)} style={btnDanger}>
                    {t('common.delete') || 'حذف'}
                  </button>
                </HStack>
              </HStack>
            </div>
          ))}
          {list.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted, fontSize: '0.85rem' }}>
              {tab === 'couriers' ? 'لا يوجد مندوبين' : 'لا يوجد فنيين'}
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
});
