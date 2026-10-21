import { useI18n } from '@/shared/i18n/context'

export default function HealthPage() {
  const { t } = useI18n()
  return (
    <div className="p-4">
      <h1 className="text-lg font-medium">{t('nav.health')}</h1>
      <p className="mt-2 text-sm text-muted">{t('health.placeholder')}</p>
    </div>
  )
}
