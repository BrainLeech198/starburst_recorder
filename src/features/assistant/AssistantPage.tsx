import { useI18n } from '@/shared/i18n/context'
import AssistantChat from './AssistantChat'

/**
 * 完整页面。内容限宽居中，桌面上别把一句回答拉成一整屏宽；
 * 页面高度撑满内容区，对话框自己滚，输入区常驻底部。
 */
export default function AssistantPage() {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-4 pb-1 pt-3">
      <h1 className="m-0 mb-2 text-sm font-medium text-fg">{t('assistant.title')}</h1>
      <AssistantChat />
    </div>
  )
}
