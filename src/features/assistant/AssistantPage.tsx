import { useI18n } from '@/shared/i18n/context'
import AssistantChat from './AssistantChat'

export default function AssistantPage() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-full w-full flex-col px-4 pt-4">
      <h1 className="m-0 text-lg font-medium">{t('assistant.title')}</h1>
      <AssistantChat />
    </div>
  )
}
