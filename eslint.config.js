import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default [
  // .local 是本机产物与资料（构建结果、安装包、参考仓库、密钥），不进仓库也不参与检查；
  // site/ 是独立静态官网（普通浏览器脚本，不走 App 构建），同样不在 lint 范围里
  // 根目录与 worker 子目录的 .wrangler 是 Wrangler 临时打包产物，不进 git 也不参与检查
  {
    ignores: ['node_modules', 'android', 'src-tauri', '.local', '.wrangler', 'site', 'worker/**/.wrangler'],
  },
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
    files: ['src/app/providers/*.tsx', 'src/features/update/UpdateProvider.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Electron 主进程/预加载脚本跑在 Node 里，用的是 CommonJS
    files: ['electron/**/*.cjs', 'package/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // 路由配置文件导出的是 router 与 lazy 组件常量，不是可热更新的组件模块
    files: ['src/app/router.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // 依赖方向：下层不能反向依赖上层。core / shared / platform 只服务于 app 与 features。
    files: ['src/{core,shared,platform}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/app/*'],
              message: 'core / shared / platform 不能反向依赖 features 或 app；需要共享的代码请下沉到 shared。',
            },
          ],
        },
      ],
    },
  },
  {
    // features 只负责业务模块本身，不负责路由组装，也不直接依赖壳层布局
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/router', '@/app/layout/*'],
              message: 'features 不要直接依赖路由或壳层，页面跳转由 app 层组装。',
            },
          ],
        },
      ],
    },
  },
  {
    // Service Worker 原样拷进产物、不参与打包，跑在 SW 全局里（self / caches / fetch 都不是窗口全局）
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: globals.serviceworker,
    },
  },
  {
    // 推送中继跑在 Cloudflare Worker 里：ESM，全局是 worker 那套（crypto / atob / Response…），
    // 没有 window 也没有 Node 的 Buffer
    files: ['worker/**/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.worker,
    },
  },
  {
    // worker 里的本地工具脚本（生成 VAPID 密钥之类）跑在本机 Node 上，不是 Worker 运行时
    files: ['worker/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  prettier,
]
