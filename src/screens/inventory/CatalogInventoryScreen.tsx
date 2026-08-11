import { memo, useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import { InventoryService, type InventoryRecord } from '../../services/inventory-service';
import { getInventoryReady, subscribeCentralInventory } from '../../services/inventory-central-service';
import { InventorySummaryCards } from '../../components/inventory/InventorySummaryCards';
import { InventorySearchBar } from '../../components/inventory/InventorySearchBar';
import { InventoryViewToggle, type View } from '../../components/inventory/InventoryViewToggle';
import { InventoryTable } from '../../components/inventory/InventoryTable';
import { AddInventoryModal } from '../../components/inventory/AddInventoryModal';
import { EditInventoryModal } from '../../components/inventory/EditInventoryModal';
import { InventoryTransactionRow } from '../../components/inventory/InventoryTransactionRow';

export const CatalogInventoryScreen = memo(function CatalogInventoryScreen() {
  const colors = useThemeColors();
  const styles = useThemeStyles();
  const [view, setView] = useState<View>('dashboard');
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [editingRecord, setEditingRecord] = useState<InventoryRecord | null>(null);
  const [ready, setReady] = useState(() => getInventoryReady());
  const [pending, setPending] = useState(false);

  const refresh = useCallback(() => setRecords(InventoryService.getAll()), []);

  useEffect(() => {
    return subscribeCentralInventory(() => setReady(getInventoryReady()));
  }, []);

  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  const filtered = search ? InventoryService.search(search) : records;
  const totalItems = records.reduce((s, r) => s + r.quantity, 0);
  const lowStock = records.filter(r => r.quantity > 0 && r.quantity <= 3).length;
  const outOfStock = records.filter(r => r.quantity <= 0).length;

  const handleEditSave = async (record: InventoryRecord, newQty: number) => {
    const diff = newQty - record.quantity;
    setPending(true);
    try {
      if (diff > 0) await InventoryService.addStock(record.brand, record.model, record.variant, diff);
      else if (diff < 0) await InventoryService.removeStock(record.id, Math.abs(diff));
      refresh();
      setEditingRecord(null);
    } finally {
      setPending(false);
    }
  };

  const handleToggleVisibility = async (id: string) => {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    setPending(true);
    try {
      if (rec.status === 'archived' || rec.status === 'discontinued') await InventoryService.unhideRecord(id);
      else await InventoryService.hideRecord(id);
      refresh();
    } finally {
      setPending(false);
    }
  };

  const handleTogglePublish = async (id: string) => {
    setPending(true);
    try {
      await InventoryService.publishRecord(id, !InventoryService.isRecordPublished(id));
      refresh();
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async (id: string) => {
    setPending(true);
    try {
      await InventoryService.deleteRecord(id);
      refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ ...styles.flexCol, gap: 16 }}>
      <div style={styles.flexBetween}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>📦 المخزون</h2>
        <InventoryViewToggle view={view} onViewChange={setView} colors={colors} />
      </div>

      {!ready && (
        <div style={{ ...styles.textMuted, textAlign: 'center', padding: '0.75rem', fontSize: '0.85rem' }}>
          جارٍ تحميل المخزون…
        </div>
      )}

      {view === 'dashboard' && (
        <>
          <InventorySummaryCards colors={colors} totalItems={totalItems} recordsCount={records.length} lowStock={lowStock} outOfStock={outOfStock} />
          <InventorySearchBar value={search} onChange={setSearch} colors={colors} />
          <InventoryTable
            filtered={filtered}
            search={search}
            colors={colors}
            busy={pending}
            publishedIds={new Set(records.map(r => r.id).filter(id => InventoryService.isRecordPublished(id)))}
            onEdit={setEditingRecord}
            onDelete={handleDelete}
            onToggleVisibility={handleToggleVisibility}
            onTogglePublish={handleTogglePublish}
          />
        </>
      )}

      {view === 'add' && (
        <AddInventoryModal colors={colors} onDone={() => { refresh(); setView('dashboard'); }} />
      )}

      {view === 'transactions' && (
        <div style={{ ...styles.flexCol, gap: 4 }}>
          {InventoryService.getRecentTransactions(30).length === 0 ? (
            <div style={{ ...styles.textMuted, textAlign: 'center', padding: '2rem' }}>
              لا توجد حركات بعد.
            </div>
          ) : (
            InventoryService.getRecentTransactions(30).map(tx => (
              <InventoryTransactionRow key={tx.id} tx={tx} colors={colors} />
            ))
          )}
        </div>
      )}

      {editingRecord && (
        <EditInventoryModal record={editingRecord} colors={colors} busy={pending} onSave={handleEditSave} onClose={() => setEditingRecord(null)} />
      )}
    </div>
  );
});
