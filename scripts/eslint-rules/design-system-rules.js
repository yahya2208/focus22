/**
 * Custom ESLint rules to enforce Design System token usage.
 *
 * Rules:
 * 1. no-inline-styles — ban style={{ }} except for dynamic values
 * 2. no-hardcoded-colors — ban hex/rgb/rgba string literals
 * 3. no-hardcoded-spacing — ban numeric padding/margin/gap values
 * 4. no-hardcoded-radius — ban numeric borderRadius values
 * 5. no-hardcoded-font-size — ban numeric fontSize values
 * 6. no-hardcoded-shadow — ban boxShadow values
 */

const HARDCODED_COLOR_RE = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\s*\(|hsla?\s*\(/;
const NUMERIC_VALUE_RE = /^\d+(\.\d+)?(px|em|rem|%|vh|vw|vmin|vmax)?$/;
const SPACING_PROPS = new Set(['padding', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom', 'gap', 'rowGap', 'columnGap']);
const RADIUS_PROPS = new Set(['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']);
const FONT_SIZE_PROPS = new Set(['fontSize']);
const SHADOW_PROPS = new Set(['boxShadow']);

function isNonConfigFile(filename) {
  if (!filename) return false;
  return filename.includes('/design-system/') ||
         filename.includes('__tests__') ||
         filename.includes('eslint.config') ||
         filename.includes('scripts/eslint-rules');
}

function isNumericLiteral(node) {
  if (node.type === 'Literal' && typeof node.value === 'number') return true;
  if (node.type === 'Literal' && typeof node.value === 'string' && NUMERIC_VALUE_RE.test(node.value)) return true;
  if (node.type === 'TemplateLiteral' && !node.expressions.length && NUMERIC_VALUE_RE.test(node.quasis[0].value.raw)) return true;
  return false;
}

function isLiteralString(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return true;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return true;
  return false;
}

function getStringValue(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.raw;
  return null;
}

function isDynamicPropertyValue(node) {
  return node.type !== 'Literal' && node.type !== 'TemplateLiteral';
}

function getStylePropsInJSX(context) {
  const filename = context.filename ?? context.physicalFilename ?? '';
  if (isNonConfigFile(filename)) return false;

  return {
    JSXAttribute(node) {
      if (node.name.name !== 'style') return;
      if (node.value.type !== 'JSXExpressionContainer') return;
      const expr = node.value.expression;
      if (expr.type !== 'ObjectExpression') return;
      return expr.properties;
    },
  };
}

const noInlineStyles = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Ban style={{ }} except for dynamic values' },
    messages: {
      avoidStyle: 'Avoid inline style={{ }}. Use design-system components (Card, Surface, Stack, Flex, Text, Heading) or token variables instead.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.physicalFilename ?? '';
    if (isNonConfigFile(filename)) return {};

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        if (node.value.type !== 'JSXExpressionContainer') return;
        const expr = node.value.expression;
        if (expr.type !== 'ObjectExpression') return;

        const allDynamic = expr.properties.every(
          (prop) => prop.type === 'SpreadElement' || (prop.value && isDynamicPropertyValue(prop.value))
        );

        if (!allDynamic) {
          context.report({ node, messageId: 'avoidStyle' });
        }
      },
    };
  },
};

const noHardcodedColors = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Ban hex/rgb/rgba color values in JSX style objects' },
    messages: {
      avoidColor: 'Avoid hardcoded color "{{ value }}". Use colors from useColors() or ColorRoles.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.physicalFilename ?? '';
    if (isNonConfigFile(filename)) return {};

    function checkLiteral(node) {
      if (node.type === 'Literal' && typeof node.value === 'string') {
        if (HARDCODED_COLOR_RE.test(node.value) && !node.value.includes('var(')) {
          context.report({ node, messageId: 'avoidColor', data: { value: node.value } });
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        if (node.value.type !== 'JSXExpressionContainer') return;
        const expr = node.value.expression;
        if (expr.type !== 'ObjectExpression') return;
        for (const prop of expr.properties) {
          if (prop.type === 'SpreadElement' || !prop.value) continue;
          const keyName = prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'Literal' ? prop.key.value : null;
          if (keyName === 'color' || keyName === 'background' || keyName === 'backgroundColor' || keyName === 'borderColor' || keyName === 'border' || keyName === 'borderTop' || keyName === 'borderRight' || keyName === 'borderBottom' || keyName === 'borderLeft' || typeof keyName === 'string' && (keyName.endsWith('Color') || keyName.endsWith('Shadow'))) {
            checkLiteral(prop.value);
          }
        }
      },
    };
  },
};

const noHardcodedSpacing = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Ban numeric padding/margin/gap values' },
    messages: {
      avoidSpacing: 'Avoid numeric "{{ key }}: {{ value }}". Use spacing tokens (spacing.sm, spacing.md, spacing.lg, etc.).',
    },
  },
  create(context) {
    const filename = context.filename ?? context.physicalFilename ?? '';
    if (isNonConfigFile(filename)) return {};

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        if (node.value.type !== 'JSXExpressionContainer') return;
        const expr = node.value.expression;
        if (expr.type !== 'ObjectExpression') return;
        for (const prop of expr.properties) {
          if (prop.type === 'SpreadElement' || !prop.value) continue;
          const keyName = prop.key.type === 'Identifier' ? prop.key.name : null;
          if (typeof keyName === 'string' && SPACING_PROPS.has(keyName) && isNumericLiteral(prop.value)) {
            const val = getStringValue(prop.value) ?? (prop.value.type === 'Literal' ? String(prop.value.value) : '');
            context.report({ node, messageId: 'avoidSpacing', data: { key: keyName, value: val } });
          }
        }
      },
    };
  },
};

const noHardcodedRadius = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Ban numeric borderRadius values' },
    messages: {
      avoidRadius: 'Avoid numeric borderRadius: {{ value }}. Use radius tokens (radius.sm, radius.md, radius.lg).',
    },
  },
  create(context) {
    const filename = context.filename ?? context.physicalFilename ?? '';
    if (isNonConfigFile(filename)) return {};

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        if (node.value.type !== 'JSXExpressionContainer') return;
        const expr = node.value.expression;
        if (expr.type !== 'ObjectExpression') return;
        for (const prop of expr.properties) {
          if (prop.type === 'SpreadElement' || !prop.value) continue;
          const keyName = prop.key.type === 'Identifier' ? prop.key.name : null;
          if (typeof keyName === 'string' && RADIUS_PROPS.has(keyName) && isNumericLiteral(prop.value)) {
            const val = getStringValue(prop.value) ?? (prop.value.type === 'Literal' ? String(prop.value.value) : '');
            context.report({ node, messageId: 'avoidRadius', data: { value: val } });
          }
        }
      },
    };
  },
};

const noHardcodedFontSize = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Ban numeric fontSize values' },
    messages: {
      avoidFontSize: 'Avoid numeric fontSize: {{ value }}. Use typography tokens (typography.body, typography.title, etc.).',
    },
  },
  create(context) {
    const filename = context.filename ?? context.physicalFilename ?? '';
    if (isNonConfigFile(filename)) return {};

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        if (node.value.type !== 'JSXExpressionContainer') return;
        const expr = node.value.expression;
        if (expr.type !== 'ObjectExpression') return;
        for (const prop of expr.properties) {
          if (prop.type === 'SpreadElement' || !prop.value) continue;
          const keyName = prop.key.type === 'Identifier' ? prop.key.name : null;
          if (keyName && FONT_SIZE_PROPS.has(keyName) && isNumericLiteral(prop.value)) {
            const val = getStringValue(prop.value) ?? (prop.value.type === 'Literal' ? String(prop.value.value) : '');
            context.report({ node, messageId: 'avoidFontSize', data: { value: val } });
          }
        }
      },
    };
  },
};

const noHardcodedShadow = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Ban manual boxShadow values' },
    messages: {
      avoidShadow: 'Avoid manual boxShadow. Use elevation tokens (elevation.card, elevation.dropdown, elevation.dialog).',
    },
  },
  create(context) {
    const filename = context.filename ?? context.physicalFilename ?? '';
    if (isNonConfigFile(filename)) return {};

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        if (node.value.type !== 'JSXExpressionContainer') return;
        const expr = node.value.expression;
        if (expr.type !== 'ObjectExpression') return;
        for (const prop of expr.properties) {
          if (prop.type === 'SpreadElement' || !prop.value) continue;
          const keyName = prop.key.type === 'Identifier' ? prop.key.name : null;
          if (keyName && SHADOW_PROPS.has(keyName) && isLiteralString(prop.value)) {
            context.report({ node, messageId: 'avoidShadow' });
          }
        }
      },
    };
  },
};

export default {
  rules: {
    'no-inline-styles': noInlineStyles,
    'no-hardcoded-colors': noHardcodedColors,
    'no-hardcoded-spacing': noHardcodedSpacing,
    'no-hardcoded-radius': noHardcodedRadius,
    'no-hardcoded-font-size': noHardcodedFontSize,
    'no-hardcoded-shadow': noHardcodedShadow,
  },
};
