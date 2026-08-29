import { memo, useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import { InventoryService, type InventoryRecord } from '../../services/inventory-service';
import { getInventoryReady, subscribeCentralInventory } from '../../services/inventory-central-service';
import { deleteListing, setListingPublished } from '../../services/listing-service';
import { filterAdminListing, loadAdminListingsBoard, type AdminListingsBoard } from '../../domains/listings/adminBoard';
import type { ListingRecord } from '../../domains/listings';
import { InventorySummaryCards } from '../../components/inventory/InventorySummaryCards';
import { InventorySearchBar } from '../../components/inventory/InventorySearchBar';
import { InventoryViewToggle, type View } from '../../components/inventory/InventoryViewToggle';
import { InventoryTable } from '../../components/inventory/InventoryTable';
import { AddInventoryModal } from '../../components/inventory/AddInventoryModal';
import { EditInventoryModal } from '../../components/inventory/EditInventoryModal';
import { InventoryTransactionRow } from '../../components/inventory/InventoryTransactionRow';
import { ListingCategoryFilter, type CategoryFilter } from '../../components/inventory/listings/ListingCategoryFilter';
import { ListingRow } from '../../components/inventory/listings/ListingRow';
import { CarListingForm } from '../../components/inventory/listings/CarListingForm';
import { PropertyListingForm } from '../../components/inventory/listings/PropertyListingForm';
import { ProduceListingForm } from '../../components/inventory/listings/ProduceListingForm';
import { EditListingModal } from '../../components/inventory/listings/EditListingModal';

const EMPTY_BOARD: AdminListingsBoard = { phones: [], cars: [], properties: [], produce: [] };

export const CatalogInventoryScreen = memo(function CatalogInventoryScreen() {
  const colors = useThemeColors();
  const styles = useThemeStyles();
  const [view, setView] = useState<View>('dashboard');
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [editingRecord, setEditingRecord] = useState<InventoryRecord | null>(null);
  const [ready, setReady] = useState(() => getInventoryReady());
  const [pending, setPending] = useState(false);

  // ── Category-aware listings board (P8.4) ──────────────────────────────────
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [board, setBoard] = useState<AdminListingsBoard>(EMPTY_BOARD);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState('');
  const [editingListing, setEditingListing] = useState<ListingRecord | null>(null);

  const refreshBoard = useCallback(async () => {
    setBoardLoading(true);
    try {
      const next = await loadAdminListingsBoard();
      setBoard({ cars: next.cars, properties: next.properties, phones: next.phones, produce: next.produce });
      setBoardError('');
    } catch (e) {
      // Surfaced in the UI — data errors are never swallowed.
      setBoardError(e instanceof Error ? e.message : String(e));
    } finally {
      setBoardLoading(false);
    }
  }, []);

  const refresh = useCallback(() => setRecords(InventoryService.getAll()), []);

  useEffect(() => {
    return subscribeCentralInventory(() => setReady(getInventoryReady()));
  }, []);

  useEffect(() => {
    if (ready) {
      refresh();
      void refreshBoard();
    }
  }, [ready, refresh, refreshBoard]);

  // Defensive phone-scope on the admin phone grid. Correctness lives at the
  // service boundary (category==='phone' cache filter); this UI filter is a
  // defensive layer only — it guards against a future cache regression ever
  // surfacing a car/property row as a malformed phone card.
  const phoneRows = records.filter((r) => r.category === undefined || r.category === 'phone');
  const filtered = search ? InventoryService.search(search).filter((r) => r.category === undefined || r.category === 'phone') : phoneRows;
  const totalItems = phoneRows.reduce((s, r) => s + r.quantity, 0);
  const lowStock = phoneRows.filter(r => r.quantity > 0 && r.quantity <= 3).length;
  const outOfStock = phoneRows.filter(r => r.quantity <= 0).length;

  // Client-side substring filtering mirrors the phone search contract.
  const visibleCars = search ? board.cars.filter((r) => filterAdminListing(r, search)) : board.cars;
  const visibleProperties = search ? board.properties.filter((r) => filterAdminListing(r, search)) : board.properties;
  const visibleProduce = search ? board.produce.filter((r) => filterAdminListing(r, search)) : board.produce;

  const counts = {
    all: phoneRows.length + board.cars.length + board.properties.length + board.produce.length,
    phone: phoneRows.length,
    car: board.cars.length,
    property: board.properties.length,
    produce: board.produce.length,
  };

  const handleListingTogglePublish = async (listing: ListingRecord) => {
    setPending(true);
    try {
      await setListingPublished(listing.id, !listing.isPublished);
      await refreshBoard();
    } catch (e) {
      setBoardError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const handleListingDelete = async (id: string) => {
    setPending(true);
    try {
      await deleteListing(id); // SOFT delete (00039)
      await refreshBoard();
    } catch (e) {
      setBoardError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

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
          {(categoryFilter === 'all' || categoryFilter === 'phone') && (
            <InventorySummaryCards colors={colors} totalItems={totalItems} recordsCount={records.length} lowStock={lowStock} outOfStock={outOfStock} />
          )}
          <InventorySearchBar value={search} onChange={setSearch} colors={colors} />
          <ListingCategoryFilter value={categoryFilter} onChange={setCategoryFilter} colors={colors} counts={counts} />

          {boardError !== '' && (
            <div style={{ color: colors.danger, fontSize: '0.78rem', padding: '8px', border: `1px solid ${colors.danger}30`, borderRadius: '8px' }}>
              ⚠ تعذر تحميل السيارات/العقارات: {boardError}
            </div>
          )}

          {categoryFilter === 'all' && (
            <div style={{ color: colors.textMuted, fontSize: '0.75rem' }}>الهواتف ({filtered.length})</div>
          )}
          {(categoryFilter === 'all' || categoryFilter === 'phone') && (
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
          )}

          {categoryFilter === 'all' && (
            <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '4px' }}>السيارات ({visibleCars.length})</div>
          )}
          {(categoryFilter === 'all' || categoryFilter === 'car') && (
            boardLoading ? (
              <div style={{ ...styles.textMuted, textAlign: 'center', padding: '0.75rem', fontSize: '0.85rem' }}>جارٍ تحميل السيارات…</div>
            ) : visibleCars.length === 0 ? (
              categoryFilter === 'car' && (
                <div style={{ ...styles.textMuted, textAlign: 'center', padding: '2rem' }}>لا توجد سيارات بعد.</div>
              )
            ) : (
              <div style={{ ...styles.flexCol, gap: 6 }}>
                {visibleCars.map((listing) => (
                  <ListingRow
                    key={listing.id}
                    record={listing}
                    colors={colors}
                    busy={pending}
                    onEdit={() => setEditingListing(listing)}
                    onDelete={() => void handleListingDelete(listing.id)}
                    onTogglePublish={() => void handleListingTogglePublish(listing)}
                  />
                ))}
              </div>
            )
          )}

          {categoryFilter === 'all' && (
            <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '4px' }}>العقارات ({visibleProperties.length})</div>
          )}
          {(categoryFilter === 'all' || categoryFilter === 'property') && (
            boardLoading ? (
              <div style={{ ...styles.textMuted, textAlign: 'center', padding: '0.75rem', fontSize: '0.85rem' }}>جارٍ تحميل العقارات…</div>
            ) : visibleProperties.length === 0 ? (
              categoryFilter === 'property' && (
                <div style={{ ...styles.textMuted, textAlign: 'center', padding: '2rem' }}>لا توجد عقارات بعد.</div>
              )
            ) : (
              <div style={{ ...styles.flexCol, gap: 6 }}>
                {visibleProperties.map((listing) => (
                  <ListingRow
                    key={listing.id}
                    record={listing}
                    colors={colors}
                    busy={pending}
                    onEdit={() => setEditingListing(listing)}
                    onDelete={() => void handleListingDelete(listing.id)}
                    onTogglePublish={() => void handleListingTogglePublish(listing)}
                  />
                ))}
              </div>
            )
          )}

          {categoryFilter === 'all' && (
            <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '4px' }}>المنتجات ({visibleProduce.length})</div>
          )}
          {(categoryFilter === 'all' || categoryFilter === 'produce') && (
            boardLoading ? (
              <div style={{ ...styles.textMuted, textAlign: 'center', padding: '0.75rem', fontSize: '0.85rem' }}>جارٍ تحميل المنتجات…</div>
            ) : visibleProduce.length === 0 ? (
              categoryFilter === 'produce' && (
                <div style={{ ...styles.textMuted, textAlign: 'center', padding: '2rem' }}>لا توجد منتجات بعد.</div>
              )
            ) : (
              <div style={{ ...styles.flexCol, gap: 6 }}>
                {visibleProduce.map((listing) => (
                  <ListingRow
                    key={listing.id}
                    record={listing}
                    colors={colors}
                    busy={pending}
                    onEdit={() => setEditingListing(listing)}
                    onDelete={() => void handleListingDelete(listing.id)}
                    onTogglePublish={() => void handleListingTogglePublish(listing)}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}

      {view === 'add' && (
        <AddInventoryModal colors={colors} onDone={() => { refresh(); setView('dashboard'); }} />
      )}

      {view === 'add-car' && (
        <CarListingForm colors={colors} onDone={() => { void refreshBoard(); setView('dashboard'); }} />
      )}

      {view === 'add-property' && (
        <PropertyListingForm colors={colors} onDone={() => { void refreshBoard(); setView('dashboard'); }} />
      )}

      {view === 'add-produce' && (
        <ProduceListingForm colors={colors} onDone={() => { void refreshBoard(); setView('dashboard'); }} />
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

      {editingListing && (
        <EditListingModal
          record={editingListing}
          colors={colors}
          busy={pending}
          onSaved={() => { setEditingListing(null); void refreshBoard(); }}
          onClose={() => setEditingListing(null)}
        />
      )}
    </div>
  );
});
