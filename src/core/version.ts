/**
 * 应用版本号：构建时由 vite.config.ts 注入（来源 package.json 的 version）。
 * 单独放一个文件，检查更新和「关于」都用同一份，不要在页面里各写一个字符串。
 */
declare const __APP_VERSION__: string

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
