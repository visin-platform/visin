import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The service worker is plain script served as-is, running in a worker scope.
    files: ['public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', Request: 'readonly' },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // A colour written out stays the same in light and dark. Use a palette
      // path in `sx` ('text.secondary'), a token from @visin/frontend-core
      // (`surface.divider`, `livePalette(theme)`, `tint`) or, for a chart
      // series, `useChartColors()`.
      'no-restricted-syntax': [
        'error',
        {
          selector: String.raw`Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|(?:^|\s)#[0-9a-fA-F]{6}\b|\b(?:rgba?|hsla?)\(/]`,
          message: 'Colour literal: use a theme palette path, a @visin/frontend-core token, or useChartColors().',
        },
        {
          selector: String.raw`TemplateElement[value.raw=/(?:^|\s)#[0-9a-fA-F]{6}\b|\b(?:rgba?|hsla?)\(/]`,
          message: 'Colour literal: use a theme palette path, a @visin/frontend-core token, or useChartColors().',
        },
      ],
    },
  },
  {
    // Fixtures describe stored data, which may well carry a colour.
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  }
);
