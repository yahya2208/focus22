import { memo, useEffect, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';
import { Card } from '../../design-system/components/Card';
import { Flex } from '../../design-system/components/Flex';
import {
  ensureCategoriesLoaded,
  getCategories,
  getCategoryLabel,
  subscribeCategories,
  type CategoryNode,
} from '../../services/categories-service';

/**
 * Category navigation (00050). Renders EXCLUSIVELY from the DB-driven
 * categories service — no hardcoded list.
 *
 * Layout: on wide (desktop) screens it is a persistent left sidebar where
 * hovering a top-level row expands its subcategories inline. On narrow
 * (mobile) screens it collapses into a "Categories" trigger that expands on
 * tap (tap options per the brief: no hover-only navigation on mobile).
 * Renders nothing when the categories table is empty/not yet created.
 */
export const CategoryNav = memo(function CategoryNav() {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const wide = useIsWideLayout(768);
  const [roots, setRoots] = useState<CategoryNode[]>(() => getCategories());
  const [open, setOpen] = useState(wide);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    ensureCategoriesLoaded().catch(() => {});
    return subscribeCategories(() => setRoots(getCategories()));
  }, []);

  useEffect(() => {
    setOpen(wide);
  }, [wide]);

  const reveal = (id: string | null) => setHoveredId(id);

  const hideFocus = (id: string) => (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(next)) return;
    reveal(null);
    void id;
  };

  if (roots.length === 0) return null;

  const navigateTo = (node: CategoryNode) => {
    dispatch({ type: 'NAVIGATE', screen: 'category', params: { slug: node.slug } });
    if (!wide) setOpen(false);
  };

  const renderChildren = (node: CategoryNode) => {
    if (node.children.length === 0) return null;
    const expanded = wide ? hoveredId === node.id : open;
    if (!expanded) return null;
    const indent = (side: 'left' | 'right') => ({
      paddingLeft: side === 'left' ? (locale === 'ar' ? 0 : '0.25rem') : undefined,
      paddingRight: side === 'right' ? (locale === 'ar' ? '0.25rem' : 0) : undefined,
    });
    const rtl = locale === 'ar' ? 'right' : 'left';
    return (
      <div style={{ margin: '0.25rem 0 0.5rem', ...indent('right') }}>
        {node.children.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => navigateTo(child)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              width: '100%', textAlign: rtl, background: 'none', border: 'none',
              padding: '0.45rem 0.75rem', borderRadius: '10px', cursor: 'pointer',
              color: colors.textSecondary, fontSize: '0.8rem', fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            {child.icon && (
              <span role="img" aria-hidden="true" style={{ fontSize: '1rem', lineHeight: 1 }}>{child.icon}</span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {getCategoryLabel(child, locale)}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <Card variant="glass" padding="md" style={{ width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t('category.menuTitle')}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
          textAlign: locale === 'ar' ? 'right' : 'left',
        }}
      >
        <Flex align="center" gap="sm">
          <span role="img" aria-hidden="true" style={{ fontSize: '1.25rem', lineHeight: 1 }}>🗂</span>
          <span style={{ color: colors.text, fontWeight: 800, fontSize: '0.95rem' }}>{t('category.menuTitle')}</span>
        </Flex>
        <span
          aria-hidden="true"
          style={{
            color: colors.textMuted, fontSize: '0.75rem', transition: 'transform 0.18s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </button>

      {!wide && (
        <p style={{ color: colors.textMuted, fontSize: '0.72rem', margin: '0.35rem 0 0' }}>
          {t('category.menuHint')}
        </p>
      )}

      {open && (
        <div style={{ marginTop: '0.5rem' }}>
          {roots.map((node) => (
            <div
              key={node.id}
              onMouseEnter={() => reveal(node.id)}
              onMouseLeave={() => reveal(null)}
              onFocusCapture={() => setHoveredId(node.id)}
              onBlurCapture={hideFocus(node.id)}
            >
              <button
                type="button"
                onClick={() => navigateTo(node)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.55rem', width: '100%',
                  textAlign: locale === 'ar' ? 'right' : 'left', background: 'none', border: 'none',
                  padding: '0.5rem 0.7rem',
                  borderRadius: '10px', cursor: 'pointer', color: colors.text, fontSize: '0.85rem',
                  fontWeight: 600, fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                {node.icon && (
                  <span role="img" aria-hidden="true" style={{ fontSize: '1.15rem', lineHeight: 1 }}>{node.icon}</span>
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getCategoryLabel(node, locale)}
                </span>
                {node.children.length > 0 && (
                  <span aria-hidden="true" style={{ color: colors.textMuted, fontSize: '0.65rem' }}>
                    {wide ? '›' : ''}
                  </span>
                )}
              </button>
              {renderChildren(node)}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
});