import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import designSystemRules from './scripts/eslint-rules/design-system-rules.js';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'design-system': { rules: designSystemRules.rules },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'design-system/no-inline-styles': 'warn',
      'design-system/no-hardcoded-colors': 'warn',
      'design-system/no-hardcoded-spacing': 'warn',
      'design-system/no-hardcoded-radius': 'warn',
      'design-system/no-hardcoded-font-size': 'warn',
      'design-system/no-hardcoded-shadow': 'warn',
    },
  },
  { ignores: ['dist/', 'node_modules/'] }
);
