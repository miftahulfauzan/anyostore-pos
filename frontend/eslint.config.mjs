import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import parser from 'eslint-config-next/parser';
import globals from 'globals';

export default defineConfig([
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      parser,
      parserOptions: { requireConfigFile: false, babelOptions: { plugins: ['@babel/plugin-syntax-jsx'] }, ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      // JSX identifiers are intentionally not checked by the base rule here;
      // Next's compiler remains the source of truth for component resolution.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**']),
]);
