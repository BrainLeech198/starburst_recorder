import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default [
  { ignores: ['dist', 'node_modules', 'android', 'src-tauri'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Provider 文件刻意同时导出组件与其配套 hook（如 ThemeProvider / useTheme）。
    // 这会让 Fast Refresh 退化为整页刷新，影响可忽略，故对这类文件关闭该规则。
    files: ['src/app/providers/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Electron 主进程/预加载脚本跑在 Node 里，用的是 CommonJS
    files: ['electron/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
]
