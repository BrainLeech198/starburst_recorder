import { Link } from 'react-router'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'

const ENTRIES: { to: string; icon: string; labelKey: MessageKey; descKey: MessageKey }[] = [
  { to: '/diary', icon: '📖', labelKey: 'nav.diary', descKey: 'home.diaryDesc' },
  { to: '/health', icon: '💪', labelKey: 'nav.health', descKey: 'home.healthDesc' },
  { to: '/finance', icon: '💰', labelKey: 'nav.finance', descKey: 'home.financeDesc' },
  { to: '/calendar', icon: '📅', labelKey: 'nav.calendar', descKey: 'home.calendarDesc' },
]

function Starburst() {
  return (
    <svg width="96" height="96" viewBox="0 0 88 88" aria-hidden="true">
      <circle cx="44" cy="44" r="34" fill="var(--color-brand)" fillOpacity="0.12" />
      <path
        d="M44 5 L52.5 35.5 L83 44 L52.5 52.5 L44 83 L35.5 52.5 L5 44 L35.5 35.5 Z"
        fill="var(--color-brand)"
      />
    </svg>
  )
}

export default function HomePage() {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-6">
      <Starburst />
      <h1 className="mt-7 text-2xl font-medium tracking-wide">{t('app.name')}</h1>
      <p className="mt-2 text-sm text-muted">{t('app.tagline')}</p>

      <div className="mt-10 grid w-full grid-cols-2 gap-3">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {entry.icon}
            </span>
            <div className="min-w-0">
              <div className="text-base font-medium">{t(entry.labelKey)}</div>
              <div className="mt-1 text-xs text-muted">{t(entry.descKey)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
