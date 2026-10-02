import { memo, type ReactNode } from 'react';

/**
 * Content frame (G1): readable max width, generous padding, no horizontal
 * overflow at any breakpoint. Desktop-first; columns inside collapse.
 */
export const AdminContent = memo(function AdminContent({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '1.6rem 2rem 3rem',
        maxWidth: 1180,
        width: '100%',
        marginInline: 'auto',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
});
