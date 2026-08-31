import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Modal } from '../../design-system/components/Modal';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Stack } from '../../design-system/layout';
import { Badge } from '../../design-system/components/Badge';
import { Loader } from '../../design-system/components/Loader';
import { Card } from '../../design-system/components/Card';
import {
  adminListCategoryProducts,
  adminAssignProducts,
  adminRemoveProduct,
  adminSetMembershipActive,
  adminSetMembershipFeatured,
  adminReorderCategoryProducts,
} from '../../services/category-products-service';
import { loadAdminListingsBoard } from '../../domains/listings/adminBoard';
import type { ListingRecord } from '../../domains/listings/types';
import type { CategoryMemberAdmin, CategoryProductDomain } from '../../core/categories/membership';
import { canCreateProducts } from '../../core/categories/membership';
import type { Category } from '../../core/categories/types';
import { getCategoryLabel } from '../../services/categories-service';
import { CarListingForm } from '../../components/inventory/listings/CarListingForm';
import { PropertyListingForm } from '../../components/inventory/listings/PropertyListingForm';
import { ProduceListingForm } from '../../components/inventory/listings/ProduceListingForm';
import { AddInventoryModal } from '../../components/inventory/AddInventoryModal';

type DomainFilter = CategoryProductDomain | 'all';

const DOMAIN_FILTERS: DomainFilter[] = ['all', 'phone', 'car', 'property', 'produce'];

function memberLabel(member: CategoryMemberAdmin): string {
  const parts = [member.brand, member.model].filter((s) => s && s.trim() !== '');
  return parts.join(' ') || member.productId;
}

export interface CategoryProductsPanelProps {
  category: Category;
  onClose: () => void;
}

/**
 * Products-in-Category panel (00051). Lists the products assigned to a
 * navigation category and lets an admin assign / remove / reorder / hide /
 * feature them. Candidates come from the shared admin listings board; writes
 * flow through the categories_admin-gated SECURITY DEFINER RPCs.
 */
export const CategoryProductsPanel = memo(function CategoryProductsPanel({
  category,
  onClose,
}: CategoryProductsPanelProps) {
  const colors = useThemeColors();
  const { t, locale } = useTranslation();

  const [members, setMembers] = useState<CategoryMemberAdmin[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [candidates, setCandidates] = useState<ListingRecord[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidateDomain, setCandidateDomain] = useState<DomainFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = canCreateProducts(category.domain);

  async function loadMembers() {
    setMembersLoading(true);
    try {
      setMembers(await adminListCategoryProducts(category.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  async function openAssign() {
    setAssignOpen(true);
    setSelected(new Set());
    setCandidatesLoading(true);
    try {
      const board = await loadAdminListingsBoard();
      setCandidates([...board.phones, ...board.cars, ...board.properties, ...board.produce]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCandidatesLoading(false);
    }
  }

  const assignedIds = useMemo(() => new Set(members.map((m) => m.productId)), [members]);

  const filteredCandidates = useMemo(() => {
    const q = candidateQuery.trim().toLowerCase();
    return candidates.filter((c) => {
      if (assignedIds.has(c.id)) return false;
      if (candidateDomain !== 'all' && c.category !== candidateDomain) return false;
      if (q === '') return true;
      return `${c.brand} ${c.model} ${c.city} ${c.code}`.toLowerCase().includes(q);
    });
  }, [candidates, candidateQuery, candidateDomain, assignedIds]);

  async function handleAssign() {
    const ids = Array.from(selected);
    if (ids.length === 0 || acting) return;
    setActing('assign');
    setError('');
    try {
      await adminAssignProducts(category.id, ids);
      setSelected(new Set());
      setAssignOpen(false);
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  async function handleCreated(productId: string) {
    setActing('create');
    setError('');
    try {
      await adminAssignProducts(category.id, [productId]);
      setCreateOpen(false);
      setAssignOpen(false);
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  // Produce/car/property create flows are ATOMIC (00056): the server already
  // inserted the membership with the product — no post-create assign needed.
  async function handleCreatedAtomic(_productId: string) {
    setActing('create');
    setError('');
    setCreateOpen(false);
    setAssignOpen(false);
    await loadMembers();
    setActing(null);
  }

  async function handleRemove(m: CategoryMemberAdmin) {
    if (acting) return;
    setActing(m.productId);
    setError('');
    try {
      await adminRemoveProduct(category.id, m.productId);
      setMembers((prev) => prev.filter((x) => x.productId !== m.productId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  async function handleToggleActive(m: CategoryMemberAdmin) {
    if (acting) return;
    setActing(m.productId);
    setError('');
    try {
      await adminSetMembershipActive(category.id, m.productId, !m.membershipActive);
      setMembers((prev) =>
        prev.map((x) => (x.productId === m.productId ? { ...x, membershipActive: !m.membershipActive } : x)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  async function handleToggleFeatured(m: CategoryMemberAdmin) {
    if (acting) return;
    setActing(m.productId);
    setError('');
    try {
      await adminSetMembershipFeatured(category.id, m.productId, !m.isFeatured);
      setMembers((prev) =>
        prev.map((x) => (x.productId === m.productId ? { ...x, isFeatured: !m.isFeatured } : x)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  async function handleMove(m: CategoryMemberAdmin, dir: -1 | 1) {
    if (acting || members.length < 2) return;
    const idx = members.findIndex((x) => x.productId === m.productId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= members.length) return;
    setActing(m.productId);
    setError('');
    try {
      const next = members.slice();
      const target = next[j];
      if (!target) return;
      next[idx] = { ...target, sortOrder: m.sortOrder };
      next[j] = { ...m, sortOrder: target.sortOrder };
      await adminReorderCategoryProducts(
        category.id,
        next.map((x) => ({ productId: x.productId, sortOrder: x.sortOrder })),
      );
      setMembers(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('categoryProducts.productsFor').replace('{category}', getCategoryLabel(category, locale))}
    >
      <Stack gap="md">
        {error && <span style={{ color: colors.warningText, fontSize: '0.75rem' }}>{error}</span>}

        <Flex justify="space-between" align="center" gap="sm" wrap>
          <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
            {members.length} · {t('category.products')}
          </span>
          <Button size="sm" variant="primary" onClick={openAssign}>
            + {t('categoryProducts.assign')}
          </Button>
          {canCreate && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => { setError(''); setCreateOpen((v) => !v); setAssignOpen(false); }}
              disabled={acting !== null}
              aria-label={t('categoryProducts.createHere')}
            >
              + {t('categoryProducts.createHere')}
            </Button>
          )}
        </Flex>

        {createOpen && (
          <Card padding="lg" style={{ width: '100%' }}>
            <Stack gap="md">
              <Flex justify="space-between" align="center" gap="sm" wrap>
                <span style={{ color: colors.text, fontWeight: 800, fontSize: '0.9rem' }}>
                  {t('categoryProducts.newProduct').replace('{category}', getCategoryLabel(category, locale))}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                  {t('adminCategories.cancel')}
                </Button>
              </Flex>
              {canCreate && category.domain === 'produce' && (
                <ProduceListingForm
                  colors={colors}
                  busy={acting !== null}
                  categoryId={category.id}
                  onDone={handleCreatedAtomic}
                />
              )}
              {canCreate && category.domain === 'car' && (
                <CarListingForm
                  colors={colors}
                  busy={acting !== null}
                  categoryId={category.id}
                  onDone={handleCreatedAtomic}
                />
              )}
              {canCreate && category.domain === 'property' && (
                <PropertyListingForm
                  colors={colors}
                  busy={acting !== null}
                  categoryId={category.id}
                  onDone={handleCreatedAtomic}
                />
              )}
              {canCreate && category.domain === 'phone' && (
                <AddInventoryModal
                  colors={colors}
                  onDone={() => setCreateOpen(false)}
                  onCreated={handleCreated}
                />
              )}
            </Stack>
          </Card>
        )}

        {membersLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
            <Loader />
          </div>
        ) : members.length === 0 ? (
          <Card padding="lg" style={{ width: '100%' }}>
            <Stack gap="md">
              <span style={{ color: colors.textMuted, fontSize: '0.82rem' }}>
                {t('categoryProducts.noProducts')}
              </span>
              {canCreate && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => { setError(''); setCreateOpen(true); setAssignOpen(false); }}
                  disabled={acting !== null}
                >
                  + {t('categoryProducts.createHere')}
                </Button>
              )}
            </Stack>
          </Card>
        ) : (
          <Stack gap="sm">
            {members.map((m, i) => (
              <Card key={m.productId} variant="interactive" padding="md" style={{ width: '100%' }}>
                <Flex justify="space-between" align="center" gap="sm" wrap>
                  <Flex align="center" gap="sm" wrap style={{ minWidth: 0 }}>
                    <span style={{ color: colors.textMuted, fontSize: '0.72rem', width: 20 }}>
                      {i + 1}
                    </span>
                    <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.85rem', minWidth: 0 }}>
                      {memberLabel(m)}
                    </span>
                    <Badge variant={m.membershipActive ? 'success' : 'neutral'}>
                      {m.domain}
                    </Badge>
                    {m.isFeatured && <Badge variant="info">{t('categoryProducts.featured')}</Badge>}
                    {!m.membershipActive && (
                      <Badge variant="neutral">{t('categoryProducts.hideFromPage')}</Badge>
                    )}
                  </Flex>
                  <Flex gap="xs" align="center" wrap>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMove(m, -1)}
                      disabled={acting !== null || i === 0}
                      aria-label={t('categoryProducts.moveUp')}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMove(m, 1)}
                      disabled={acting !== null || i === members.length - 1}
                      aria-label={t('categoryProducts.moveDown')}
                    >
                      ↓
                    </Button>
                    <Button
                      variant={m.membershipActive ? 'ghost' : 'secondary'}
                      size="sm"
                      onClick={() => handleToggleActive(m)}
                      disabled={acting !== null}
                    >
                      {m.membershipActive
                        ? t('categoryProducts.hideFromPage')
                        : t('categoryProducts.showOnPage')}
                    </Button>
                    <Button
                      variant={m.isFeatured ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => handleToggleFeatured(m)}
                      disabled={acting !== null}
                    >
                      {t('categoryProducts.featured')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemove(m)}
                      disabled={acting !== null}
                    >
                      {t('categoryProducts.remove')}
                    </Button>
                  </Flex>
                </Flex>
              </Card>
            ))}
          </Stack>
        )}

        {assignOpen && (
          <Card padding="lg" style={{ width: '100%' }}>
            <Stack gap="md">
              <span style={{ color: colors.text, fontWeight: 800, fontSize: '0.9rem' }}>
                {t('categoryProducts.assign')}
              </span>
              <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
                {t('categoryProducts.assignHint')}
              </span>
              <Flex gap="sm" align="center" wrap>
                <div style={{ flex: '1 1 220px' }}>
                  <Input
                    value={candidateQuery}
                    onChange={(e) => setCandidateQuery(e.target.value)}
                    placeholder={t('categoryProducts.searchPlaceholder')}
                  />
                </div>
                <Select
                  value={candidateDomain}
                  onChange={(e) => setCandidateDomain(e.target.value as DomainFilter)}
                  options={DOMAIN_FILTERS.map((d) => ({
                    value: d,
                    label: d === 'all'
                      ? t('categoryProducts.allDomains')
                      : d === 'phone'
                        ? t('categoryProducts.domain.phone')
                        : d === 'car'
                          ? t('categoryProducts.domain.car')
                          : d === 'property'
                            ? t('categoryProducts.domain.property')
                            : t('categoryProducts.domain.produce'),
                  }))}
                />
              </Flex>

              {candidatesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0' }}>
                  <Loader />
                </div>
              ) : filteredCandidates.length === 0 ? (
                <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>
                  {t('categoryProducts.noProducts')}
                </span>
              ) : (
                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <Stack gap="xs">
                    {filteredCandidates.map((c) => {
                      const checked = selected.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (checked) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                          aria-pressed={checked}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '10px',
                            border: `1px solid ${checked ? colors.accent : colors.border}`,
                            background: checked ? colors.accent + '22' : colors.bgCard,
                            color: colors.text,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontWeight: checked ? 700 : 500,
                            fontSize: '0.8rem',
                            textAlign: 'start',
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            {[c.brand, c.model].filter(Boolean).join(' ') || c.id}
                          </span>
                          <Badge variant="neutral">{c.category}</Badge>
                        </button>
                      );
                    })}
                  </Stack>
                </div>
              )}

              <Flex justify="flex-end" gap="sm">
                <Button variant="ghost" size="sm" onClick={() => setAssignOpen(false)}>
                  {t('adminCategories.cancel')}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleAssign}
                  disabled={selected.size === 0 || acting !== null}
                >
                  {t('categoryProducts.added').replace('{count}', String(selected.size))}
                </Button>
              </Flex>
            </Stack>
          </Card>
        )}
      </Stack>
    </Modal>
  );
});
