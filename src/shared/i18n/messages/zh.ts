/**
 * 中文文案。以后加语言时：
 *   1. 在同目录新建 `en.ts`，键必须和这里一一对应
 *   2. 在 `shared/i18n/context.ts` 的 SUPPORTED_LOCALES / MESSAGES 里登记
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

  'settings.description': '应用级的两件事：看着怎么样、数据放哪儿。',
  'settings.theme': '主题',
  'settings.themeHint': '明暗模式与主题色',
  'settings.data': '数据与备份',
  'settings.dataHint': '导出、恢复、数据落在哪儿',
  'settings.dataCount': '日记 {entries} · 随记 {stamps}',

  'agent.description': '星芒助手长什么样、用哪个模型，都在这里。',
  'agent.ball': '悬浮球',
  'agent.ballHint': '助手的形象与大小',
  'agent.ai': 'AI 模型',
  'agent.aiHint': '厂商、服务地址、密钥',
  'agent.configured': '已配置',
  'agent.notConfigured': '未配置',

  'ball.description':
    '球可以拖着挪位；长时间不动，它会自己贴到屏幕边上只露半边。现在助手还没接通，所以悬浮球默认不显示——这里的设置先存着。',
  'ball.shape': '形象',
  'ball.size': '大小',

  'appearance.description': '换主题色的时候，导航背景、强调元素和悬浮球的颜色会一起变。',
  'appearance.mode': '明暗',
  'appearance.accent': '主题色',
  'appearance.accentAria': '主题色 {label}',

  'window.title': '窗口尺寸',
  'window.description': '只在桌面程序里有这一项；也可以直接拖窗口边框改大小。',
  'window.loading': '读取中…',
  'window.presets': '预设',
  'window.compact': '紧凑',
  'window.standard': '标准',
  'window.wide': '宽屏',
  'window.custom': '自己填',
  'window.width': '宽',
  'window.height': '高',
  'window.apply': '应用',
  'window.min': '最小 420×560。',

  'common.confirm': '确定',
  'common.cancel': '取消',
  'common.settings': '设置',
  'common.loading': '加载中…',

  'error.title': '这个页面出问题了',
  'error.hint': '可以先刷新重试；如果一直这样，记录不会丢，数据还在本机。',
  'error.reload': '刷新重试',
} as const

export type MessageKey = keyof typeof zh
