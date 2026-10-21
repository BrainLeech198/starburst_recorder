/**
 * 中文文案。以后加语言时：
 *   1. 在同目录新建 `en.ts`，键必须和这里一一对应
 *   2. 在 `index.tsx` 的 SUPPORTED_LOCALES / MESSAGES 里登记
 * 组件里只写 `t('nav.home')` 这样的键，不再直接写中文。
 */
export const zh = {
  'app.name': '星芒记录者',

  'nav.home': '首页',
  'nav.records': '记录',
  'nav.diary': '日记',
  'nav.health': '健康',
  'nav.finance': '经济',
  'nav.calendar': '日历',
  'nav.me': '我的',

  'me.title': '我的',
  'me.avatar': '头像',
  'me.localAccount': '本地账户',
  'me.localAccountHint': '数据只存在这台设备，不上传',
  'me.settings': '设置',
  'me.settingsHint': '主题、数据与备份',
  'me.agent': '助手',
  'me.agentHint': '悬浮球、AI 模型',
  'me.futureNote': '以后这里会有账号与同步（现在只做本地）。',

  'common.confirm': '确定',
  'common.cancel': '取消',
  'common.settings': '设置',
} as const

export type MessageKey = keyof typeof zh
