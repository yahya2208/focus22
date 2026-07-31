import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';
import { Button } from '../../design-system/components/Button';
import { Card } from '../../design-system/components/Card';
import { Badge } from '../../design-system/components/Badge';
import { Chip } from '../../design-system/components/Chip';
import { Text } from '../../design-system/components/Text';
import { Heading } from '../../design-system/components/Heading';
import { Surface } from '../../design-system/components/Surface';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { IconButton } from '../../design-system/components/IconButton';
import { Modal } from '../../design-system/components/Modal';
import { EmptyState } from '../../design-system/components/EmptyState';
import { Loader } from '../../design-system/components/Loader';
import { Skeleton } from '../../design-system/components/Skeleton';
import { Toast } from '../../design-system/components/Toast';
import { Stack } from '../../design-system/components/Stack';
import { Flex } from '../../design-system/components/Flex';
import { Divider } from '../../design-system/components/Divider';
import { Section } from '../../design-system/layout/Section';

function withTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Design System — Component Snapshots', () => {
  describe('Button', () => {
    it('primary variant', () => {
      const { container } = withTheme(<Button variant="primary">Primary</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('all variants', () => {
      const variants = ['primary', 'secondary', 'ghost', 'outline', 'danger', 'success', 'warning', 'link'] as const;
      for (const v of variants) {
        const { container } = withTheme(<Button key={v} variant={v}>{v}</Button>);
        expect(container.firstChild).toMatchSnapshot(`button-${v}`);
      }
    });
    it('all sizes', () => {
      const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
      for (const s of sizes) {
        const { container } = withTheme(<Button key={s} size={s}>Size {s}</Button>);
        expect(container.firstChild).toMatchSnapshot(`button-size-${s}`);
      }
    });
    it('disabled state', () => {
      const { container } = withTheme(<Button disabled>Disabled</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('loading state', () => {
      const { container } = withTheme(<Button loading>Loading</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('with icon', () => {
      const { container } = withTheme(<Button icon="★">Icon</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('full width', () => {
      const { container } = withTheme(<Button fullWidth>Full Width</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Card', () => {
    it('all variants', () => {
      const variants = ['surface', 'glass', 'outlined', 'elevated', 'interactive'] as const;
      for (const v of variants) {
        const { container } = withTheme(<Card key={v} variant={v}>Card {v}</Card>);
        expect(container.firstChild).toMatchSnapshot(`card-${v}`);
      }
    });
    it('hoverable', () => {
      const { container } = withTheme(<Card hoverable>Hoverable</Card>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Badge', () => {
    it('all variants', () => {
      const variants = ['success', 'warning', 'error', 'info', 'neutral', 'processing', 'running', 'completed', 'pending'] as const;
      for (const v of variants) {
        const { container } = withTheme(<Badge key={v} variant={v}>{v}</Badge>);
        expect(container.firstChild).toMatchSnapshot(`badge-${v}`);
      }
    });
  });

  describe('Chip', () => {
    it('all variants', () => {
      const variants = ['filter', 'tag', 'selectable', 'clickable', 'status'] as const;
      for (const v of variants) {
        const { container } = withTheme(<Chip key={v} variant={v}>{v}</Chip>);
        expect(container.firstChild).toMatchSnapshot(`chip-${v}`);
      }
    });
    it('selected state', () => {
      const { container } = withTheme(<Chip variant="selectable" selected>Selected</Chip>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Text', () => {
    it('all variants', () => {
      const variants = ['display', 'h1', 'h2', 'h3', 'title', 'subtitle', 'body', 'bodySmall', 'label', 'caption', 'button', 'overline', 'stat', 'mono'] as const;
      for (const v of variants) {
        const { container } = withTheme(<Text key={v} variant={v}>{v}</Text>);
        expect(container.firstChild).toMatchSnapshot(`text-${v}`);
      }
    });
    it('all colors', () => {
      const colors = ['primary', 'secondary', 'muted', 'accent', 'success', 'warning', 'danger', 'info'] as const;
      for (const c of colors) {
        const { container } = withTheme(<Text key={c} color={c}>{c}</Text>);
        expect(container.firstChild).toMatchSnapshot(`text-color-${c}`);
      }
    });
  });

  describe('Heading', () => {
    it('all variants', () => {
      const variants = ['display', 'h1', 'h2', 'h3'] as const;
      for (const v of variants) {
        const { container } = withTheme(<Heading key={v} variant={v}>Heading {v}</Heading>);
        expect(container.firstChild).toMatchSnapshot(`heading-${v}`);
      }
    });
  });

  describe('Surface', () => {
    it('all variants', () => {
      const variants = ['base', 'raised', 'overlay', 'glass'] as const;
      for (const v of variants) {
        const { container } = withTheme(<Surface key={v} variant={v}>Surface {v}</Surface>);
        expect(container.firstChild).toMatchSnapshot(`surface-${v}`);
      }
    });
  });

  describe('Input', () => {
    it('default', () => {
      const { container } = withTheme(<Input placeholder="Enter text..." />);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('disabled', () => {
      const { container } = withTheme(<Input disabled value="Disabled" />);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('error state', () => {
      const { container } = withTheme(<Input error placeholder="Error" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Select', () => {
    const options = [{ value: '1', label: 'Option 1' }, { value: '2', label: 'Option 2' }];
    it('default', () => {
      const { container } = withTheme(<Select options={options} placeholder="Choose..." />);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('error state', () => {
      const { container } = withTheme(<Select options={options} placeholder="Error" error />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('IconButton', () => {
    it('all variants', () => {
      const variants = ['solid', 'ghost', 'outline'] as const;
      for (const v of variants) {
        const { container } = withTheme(<IconButton key={v} variant={v} icon="★" aria-label={v} />);
        expect(container.firstChild).toMatchSnapshot(`iconbutton-${v}`);
      }
    });
    it('all sizes', () => {
      const sizes = ['sm', 'md', 'lg'] as const;
      for (const s of sizes) {
        const { container } = withTheme(<IconButton key={s} size={s} icon="★" aria-label={`size-${s}`} />);
        expect(container.firstChild).toMatchSnapshot(`iconbutton-size-${s}`);
      }
    });
    it('disabled', () => {
      const { container } = withTheme(<IconButton disabled icon="★" aria-label="disabled" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Modal', () => {
    it('renders when open', () => {
      const { container } = withTheme(<Modal open onClose={() => {}} title="Test Modal"><p>Content</p></Modal>);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('renders nothing when closed', () => {
      const { container } = withTheme(<Modal open={false} onClose={() => {}} title="Hidden"><p>Content</p></Modal>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('EmptyState', () => {
    it('with icon and title', () => {
      const { container } = withTheme(<EmptyState icon="🔍" title="Nothing here" />);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('with description and action', () => {
      const { container } = withTheme(<EmptyState icon="📦" title="No items" description="Try again later." action={<button>Retry</button>} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Loader', () => {
    it('all sizes', () => {
      const sizes = ['sm', 'md', 'lg'] as const;
      for (const s of sizes) {
        const { container } = withTheme(<Loader key={s} size={s} />);
        expect(container.firstChild).toMatchSnapshot(`loader-${s}`);
      }
    });
  });

  describe('Skeleton', () => {
    it('all variants', () => {
      const variants = ['text', 'circle', 'rect'] as const;
      for (const v of variants) {
        const { container } = withTheme(<Skeleton key={v} variant={v} />);
        expect(container.firstChild).toMatchSnapshot(`skeleton-${v}`);
      }
    });
  });

  describe('Toast', () => {
    it('all types', () => {
      const types = ['success', 'error', 'warning', 'info'] as const;
      for (const t of types) {
        const { container } = withTheme(<Toast key={t} type={t} message={`${t} message`} />);
        expect(container.firstChild).toMatchSnapshot(`toast-${t}`);
      }
    });
    it('with dismiss', () => {
      const { container } = withTheme(<Toast type="info" message="Dismissible" onDismiss={() => {}} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Layout', () => {
    it('Stack', () => {
      const { container } = withTheme(<Stack gap="md"><div>A</div><div>B</div></Stack>);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('Flex', () => {
      const { container } = withTheme(<Flex gap="sm" align="center"><div>A</div><div>B</div></Flex>);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('Divider', () => {
      const { container } = withTheme(<Divider />);
      expect(container.firstChild).toMatchSnapshot();
    });
    it('Section', () => {
      const { container } = withTheme(<Section title="Test Section"><div>Content</div></Section>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
