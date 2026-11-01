/**
 * 日志文案字典。
 *
 * 调用处只传 key 与参数，正文集中在这里：改措辞、加字段只动这一份，
 * 不用翻遍调用点。日志不面向普通用户，所以只维护中文一份，
 * 与 App 的九语言界面文案（`shared/i18n`）分开管理。
 *
 * 写法约定（照工作室规范）：
 * - 点事件，不复述标签：标签已经说明来源，正文里别再写模块名；
 * - 一个主题 + 若干「字段 值」，用 ` | ` 分隔；
 * - 数值说人话、带单位。
 */
export const LOG_TEXT = {
  'app.boot': '应用启动 | 版本 {version} | 平台 {platform}',
  'ai.chat.done': 'AI 请求完成 | 模型 {model} | 状态 {status} | 耗时 {ms} ms',
  'ai.chat.failed': 'AI 请求失败 | 模型 {model} | 状态 {status} | {reason}',
  'ai.models.done': '模型列表 | {count} 个模型 | 耗时 {ms} ms',
  'ai.models.failed': '模型列表拉取失败 | 状态 {status} | 耗时 {ms} ms | 用户可手填模型名',
  'update.check.done': '检查更新 | 通道 {channel} | 结果 {result}',
} as const

/** 所有可用的日志文案 key */
export type LogKey = keyof typeof LOG_TEXT
