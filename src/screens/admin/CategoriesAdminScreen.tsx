import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack } from '../../design-system/layout';
import { layout } from '../../design-system/tokens';
import { Card } from '../../design-system/components/Card';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Modal } from '../../design-system/components/Modal';
import { EmptyState } from '../../design-system/components/EmptyState';
import { Loader } from '../../design-system/components/Loader';
import { Badge } from '../../design-system/components/Badge';
import {
  ensureCategoriesLoaded,
  getAllCategories,
  subscribeCategories,
  getCategoryLabel,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminSetCategoryStatus,
  adminReorderCategories,
} from '../../services/categories-service';
import {
  CATEGORY_DISPLAY_MODES,
  CATEGORY_THEMES,
  type Category,
  type CategoryAdminInput,
  type CategoryDisplayMode,
  type CategoryTheme,
} from '../../core/categories/types';
import { getCategoryThemePreset } from '../../core/categories/themes';

const EMPTY_FORM: Omit<CategoryAdminInput, 'parentId' | 'sortOrder'> & {
  parentId: string;
  sortOrder: number;
} = {
  slug: '',
  name: '',
  nameAr: '',
  description: '',
  descriptionAr: '',
  icon: '',
  parentId: '',
  sortOrder: 0,
  isActive: true,
  displayMode: 'storefront',
  theme: 'technology',
  deliveryAvailable: false,
  isFeatured: false,
};

function CategoryRowCard({
  category,
  onEdit,
  onToggle,
  onDelete,
  onMove,
  acting,
}: {
  category: Category;
  onEdit: (c: Category) => void;
  onToggle: (c: Category) => void;
  onDelete: (c: Category) => void;
  onMove: (c: Category, dir: -1 | 1) => void;
  acting: string | null;
}) {
  const colors = useThemeColors();
  const { t, locale } = useTranslation();
  const theme = getCategoryThemePreset(category.theme);
  const busy = acting === category.id;

  return (
    <Card variant="interactive" padding="lg" style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" gap="md" wrap>
        <Flex align="center" gap="sm" wrap>
          <span
            role="img"
            aria-hidden="true"
            style={{
              fontSize: '1.15rem',
              width: '38px', height: '38px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '10px', background: theme.accentSoft, color: theme.accent, flexShrink: 0,
            }}
          >
            {category.icon || '📁'}
          </span>
          <div style={{ minWidth: 0 }}>
            <Flex align="center" gap="sm" wrap>
              <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>
                {getCategoryLabel(category, locale)}
              </span>
              {category.isFeatured && (
                <Badge variant="info">{t('adminCategories.featured')}</Badge>
              )}
              {category.deliveryAvailable && (
                <Badge variant="success">🛵</Badge>
              )}
              <Badge variant={category.isActive ? 'success' : 'neutral'}>
                {category.isActive ? t('adminCategories.active') : t('adminCategories.inactive')}
              </Badge>
            </Flex>
            <span style={{ color: colors.textMuted, fontSize: '0.72rem' }}>/{category.slug}</span>
          </div>
        </Flex>

        <Flex gap="xs" align="center" wrap>
          <Button variant="ghost" size="sm" onClick={() => onMove(category, -1)} disabled={busy} aria-label={t('adminCategories.moveUp')}>
            ↑
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onMove(category, 1)} disabled={busy} aria-label={t('adminCategories.moveDown')}>
            ↓
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onToggle(category)} disabled={busy}>
            {category.isActive ? t('adminCategories.hideInactive') : t('adminCategories.active')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onEdit(category)} disabled={busy}>
            {t('adminCategories.edit')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => onDelete(category)} disabled={busy}>
            {t('adminCategories.delete')}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

function EditorModal({
  editing,
  all,
  onClose,
  onSaved,
  acting,
}: {
  editing: Category | null;
  all: Category[];
  onClose: () => void;
  onSaved: () => void;
  acting: string | null;
}) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const isNew = !editing;

  const [form, setForm] = useState<typeof EMPTY_FORM>(
    editing
      ? {
          slug: editing.slug,
          name: editing.name,
          nameAr: editing.nameAr,
          description: editing.description,
          descriptionAr: editing.descriptionAr,
          icon: editing.icon,
          parentId: editing.parentId ?? '',
          sortOrder: editing.sortOrder,
          isActive: editing.isActive,
          displayMode: editing.displayMode,
          theme: editing.theme,
          deliveryAvailable: editing.deliveryAvailable,
          isFeatured: editing.isFeatured,
        }
      : { ...EMPTY_FORM },
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState(isNew ? true : editing!.isActive);
  const [slugTouched, setSlugTouched] = useState(false);

  const themePreview = useMemo(() => getCategoryThemePreset(form.theme as CategoryTheme), [form.theme]);

  const parentOptions = useMemo(
    () =>
      all
        .filter((c) => c.id !== editing?.id)
        .map((c) => ({ value: c.id, label: `/${c.slug}` })),
    [all, editing?.id],
  );

  const slugConflict = !!form.slug &&
    all.some((c) => c.slug === form.slug && c.id !== editing?.id);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (saving) return;
    const effectiveSlug = form.slug || (form.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    setError('');
    try {
      setSaving(true);
      const active = form.isActive;
      if (isNew) {
        await adminCreateCategory({
          ...form,
          slug: effectiveSlug,
          parentId: form.parentId || null,
          sortOrder: form.sortOrder,
          isActive: active,
        });
      } else if (editing) {
        await adminUpdateCategory(editing.id, {
          ...form,
          slug: effectiveSlug,
          parentId: form.parentId || null,
          isActive: active,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const previewLabel = form.name || form.nameAr || t('adminCategories.new');

  return (
    <Modal open onClose={onClose} title={isNew ? t('adminCategories.new') : t('adminCategories.edit')}>
      <Stack gap="md">
        {/* Live preview */}
        <div style={{ borderRadius: '14px', overflow: 'hidden', background: themePreview.gradient, color: '#fff', padding: '1rem 1.1rem' }}>
          <Flex align="center" gap="sm" wrap>
            <span role="img" aria-hidden="true" style={{ fontSize: '1.3rem' }}>{form.icon || '📁'}</span>
            <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{previewLabel}</span>
          </Flex>
          {(form.description || form.descriptionAr) && (
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', margin: '0.4rem 0 0' }}>
              {form.description || form.descriptionAr}
            </p>
          )}
        </div>

        <Stack gap="sm">
          <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.name')}</label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('adminCategories.name')} />
          <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.nameAr')}</label>
          <Input value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} placeholder={t('adminCategories.nameAr')} />
          <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.slug')}</label>
          <Input
            value={form.slug}
            onChange={(e) => { set('slug', e.target.value); setSlugTouched(true); }}
            placeholder="my-category"
            error={slugConflict && slugTouched}
          />
          {slugConflict && slugTouched && (
            <span style={{ color: colors.warningText, fontSize: '0.7rem' }}>{t('adminCategories.slugTaken')}</span>
          )}
          <Flex gap="sm" wrap>
            <div style={{ flex: '1 1 140px' }}>
              <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.icon')}</label>
              <Input value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="🍎" />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.parent')}</label>
              <Select
                value={form.parentId}
                onChange={(e) => set('parentId', e.target.value)}
                options={[{ value: '', label: t('adminCategories.new') }, ...parentOptions]}
              />
            </div>
          </Flex>
          <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.description')}</label>
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={t('adminCategories.description')} />
          <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.descriptionAr')}</label>
          <Input value={form.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} placeholder={t('adminCategories.descriptionAr')} />

          <Flex gap="sm" wrap>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.displayMode')}</label>
              <Select
                value={form.displayMode}
                onChange={(e) => set('displayMode', e.target.value as CategoryDisplayMode)}
                options={CATEGORY_DISPLAY_MODES.map((m) => ({ value: m, label: m }))}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.theme')}</label>
              <Select
                value={form.theme}
                onChange={(e) => set('theme', e.target.value as CategoryTheme)}
                options={CATEGORY_THEMES.map((th) => ({ value: th, label: th }))}
              />
            </div>
          </Flex>
          <Flex gap="sm" wrap>
            <div style={{ flex: '1 1 120px' }}>
              <label style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600 }}>{t('adminCategories.order')}</label>
              <Input
                type="number"
                value={String(form.sortOrder)}
                onChange={(e) => set('sortOrder', Number(e.target.value) || 0)}
              />
            </div>
            <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'flex-end', gap: '0.5rem', marginBottom: '0.15rem' }}>
              <Button variant={isActive ? 'primary' : 'ghost'} size="sm" onClick={() => { setIsActive(true); set('isActive', true); }}>
                {t('adminCategories.active')}
              </Button>
              <Button variant={!isActive ? 'primary' : 'ghost'} size="sm" onClick={() => { setIsActive(false); set('isActive', false); }}>
                {t('adminCategories.inactive')}
              </Button>
              <Button variant={form.isFeatured ? 'primary' : 'ghost'} size="sm" onClick={() => set('isFeatured', !form.isFeatured)}>
                {t('adminCategories.featured')}
              </Button>
              <Button variant={form.deliveryAvailable ? 'primary' : 'ghost'} size="sm" onClick={() => set('deliveryAvailable', !form.deliveryAvailable)}>
                🛵
              </Button>
            </div>
          </Flex>
        </Stack>

        {error && <span style={{ color: colors.warningText, fontSize: '0.75rem' }}>{error}</span>}

        <Flex justify="flex-end" gap="sm">
          <Button variant="ghost" onClick={onClose}>{t('adminCategories.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || acting !== null}>
            {saving ? '…' : t('adminCategories.save')}
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
}

export const CategoriesAdminScreen = memo(function CategoriesAdminScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [categories, setCategories] = useState<Category[]>(() => getAllCategories());
  const [loaded, setLoaded] = useState(getAllCategories().length > 0);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    ensureCategoriesLoaded().then(() => setLoaded(true)).catch(() => setLoaded(true));
    return subscribeCategories(() => setCategories(getAllCategories()));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((c) => {
      if (q && !c.slug.includes(q) && !c.name.toLowerCase().includes(q) && !(c.nameAr || '').toLowerCase().includes(q)) return false;
      if (!showInactive && !c.isActive) return false;
      return true;
    });
  }, [categories, search, showInactive]);

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setEditorOpen(true);
  }

  async function handleToggle(c: Category) {
    if (acting) return;
    setActing(c.id);
    try {
      await adminSetCategoryStatus(c.id, !c.isActive);
    } catch {
      /* keep list as-is */
    } finally {
      setActing(null);
    }
  }

  async function handleMove(c: Category, dir: -1 | 1) {
    if (acting) return;
    setActing(c.id);
    try {
      const siblings = categories.filter((x) => (x.parentId ?? '') === (c.parentId ?? '')).sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = siblings.findIndex((x) => x.id === c.id);
      if (idx < 0) return;
      const j = idx + dir;
      if (j < 0 || j >= siblings.length) return;
      const a = siblings[idx];
      const b = siblings[j];
      if (!a || !b) return;
      const updates: Array<{ id: string; sortOrder: number }> = [
        { id: a.id, sortOrder: b.sortOrder },
        { id: b.id, sortOrder: a.sortOrder },
      ];
      await adminReorderCategories(updates);
    } catch {
      /* ignore */
    } finally {
      setActing(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || acting) return;
    setActing(pendingDelete.id);
    try {
      const hasChildren = categories.some((c) => c.parentId === pendingDelete.id);
      if (hasChildren) {
        // Block-delete: surface a hint, then abort.
        setPendingDelete(null);
        return;
      }
      const ok = await adminDeleteCategory(pendingDelete.id);
      if (ok) setPendingDelete(null);
    } catch {
      setPendingDelete(null);
    } finally {
      setActing(null);
    }
  }

  return (
    <Screen ariaLabel={t('adminCategories.title')} maxWidth={layout.containerMaxFluid} bottomPad="6rem">
      <Stack gap="lg">
        <Flex justify="space-between" align="center" gap="md" wrap>
          <div>
            <h1 style={{ color: colors.text, fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
              {t('adminCategories.title')}
            </h1>
            <p style={{ color: colors.textMuted, fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
              {categories.length} · {t('category.categories')}
            </p>
          </div>
          <Button onClick={openNew}>+ {t('adminCategories.new')}</Button>
        </Flex>

        <Flex gap="sm" align="center" wrap>
          <div style={{ flex: '1 1 240px' }}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('adminCategories.search')} />
          </div>
          <Button variant={showInactive ? 'primary' : 'ghost'} size="sm" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? t('adminCategories.showInactive') : t('adminCategories.hideInactive')}
          </Button>
        </Flex>

        {!loaded ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Loader />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="🗂"
            title={t('adminCategories.noCategories')}
            description={t('category.notFoundHint')}
            action={<Button onClick={openNew}>+ {t('adminCategories.new')}</Button>}
          />
        ) : (
          <Stack gap="sm">
            {visible.map((c) => (
              <CategoryRowCard
                key={c.id}
                category={c}
                onEdit={openEdit}
                onToggle={handleToggle}
                onDelete={(cat) => setPendingDelete(cat)}
                onMove={handleMove}
                acting={acting}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {editorOpen && (
        <EditorModal
          editing={editing}
          all={categories}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {}}
          acting={acting}
        />
      )}

      {pendingDelete && (
        <Modal open onClose={() => setPendingDelete(null)} title={t('adminCategories.delete')}>
          <Stack gap="md">
            <p style={{ color: colors.text, fontSize: '0.85rem', margin: 0 }}>
              {t('adminCategories.deleteConfirm')}
            </p>
            <Flex justify="flex-end" gap="sm">
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>{t('adminCategories.cancel')}</Button>
              <Button variant="danger" onClick={confirmDelete}>
                {t('adminCategories.delete')}
              </Button>
            </Flex>
          </Stack>
        </Modal>
      )}
    </Screen>
  );
});