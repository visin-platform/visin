import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
    // Test fixtures and mocked-component props deliberately use `any` for
    // throwaway shapes (partial API fixtures, vi.mock prop stand-ins) —
    // production code and real types are still held to no-explicit-any.
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Fixtures describe stored data, which may well carry a colour.
      'no-restricted-syntax': 'off',
    },
  }
);
