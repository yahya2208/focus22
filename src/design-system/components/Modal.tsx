import { memo, useEffect, type ReactNode, type CSSProperties } from 'react';
import { useModalRecipe } from '../useTokens';
import { spacing } from '../spacing';
import { zIndex } from '../z-index';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}

export const Modal = memo(function Modal({
  open,
  onClose,
  title,
  children,
  style,
}: ModalProps) {
  const recipe = useModalRecipe();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: zIndex.modal,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: recipe.overlayBg,
        padding: spacing.lg,
        animation: 'fadeIn 200ms',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: recipe.maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: recipe.contentBg,
          borderRadius: recipe.contentRadius,
          boxShadow: recipe.contentShadow,
          padding: recipe.contentPadding,
          ...style,
        }}
      >
        {title && (
          <h2
            style={{
              fontSize: recipe.titleFontSize,
              fontWeight: recipe.titleFontWeight as CSSProperties['fontWeight'],
              color: recipe.titleColor,
              margin: `0 0 ${spacing.md}`,
            }}
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
});
