/**
 * AI 生成内容旁的免责小字。
 *
 * 各处 AI 入口共用这一份口径，避免每个弹窗各写一句、说法还不一致。
 * 只用一小行灰字，不抢正文；需要完整说明时再单独放开窗，别在这里堆成长段。
 */
import { useI18n } from '@/shared/i18n/context'
import { Icon } from '@/shared/ui/icons'
import type { MessageKey } from '@/shared/i18n/messages/zh'

const KEYS = {
  /** 通用：AI 写出来的内容可能有误 */
  note: 'ai.disclaimerNote',
  /** 健康与营养估算：不能替代医生或营养师 */
  health: 'ai.disclaimerHealth',
  /** 图片识字 / 认食物：识别结果可能有误 */
  vision: 'ai.disclaimerVision',
  /** AI 助手：回答可能出错，也可能替你改动记录 */
  assistant: 'ai.disclaimerAssistant',
  /** 模型配置页：数据会发给第三方服务商 */
  privacy: 'ai.disclaimerPrivacy',
} as const satisfies Record<string, MessageKey>

export type AiDisclaimerKind = keyof typeof KEYS

export default function AiDisclaimer({
  kind = 'note',
  className = '',
}: {
  kind?: AiDisclaimerKind
  className?: string
}) {
  const { t } = useI18n()
  return (
    <p
      className={`m-0 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted ${className}`}
    >
      <Icon name="info" className="mt-px h-3 w-3 shrink-0" />
      <span className="min-w-0">{t(KEYS[kind])}</span>
    </p>
  )
}
