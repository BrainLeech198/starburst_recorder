import { useState } from 'react'
import { Link } from 'react-router'
import { useCareMode } from '@/shared/care/careContext'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import ShareReceiveDialog from '@/features/share/ShareReceiveDialog'
import InstallHint from './InstallHint'

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
  const { state: care } = useCareMode()
  const careHome = care.care
  const [scanOpen, setScanOpen] = useState(false)
  return (
    <div
      className={[
        'mx-auto flex w-full flex-1 flex-col px-6',
        careHome ? 'max-w-xl items-stretch justify-start py-8' : 'max-w-md items-center justify-center',
      ].join(' ')}
    >
      {!careHome && (
        <>
          <Starburst />
          <h1 className="mt-7 text-2xl font-medium tracking-wide">{t('app.name')}</h1>
          <p className="mt-2 text-sm text-muted">{t('app.tagline')}</p>
        </>
      )}

      {careHome && <h1 className="w-full text-xl font-semibold">{t('home.careTitle')}</h1>}

      <div className={careHome ? 'mt-5 grid w-full grid-cols-1 gap-3' : 'mt-10 grid w-full grid-cols-2 gap-3'}>
        {ENTRIES.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            className={
              careHome
                ? 'flex min-h-20 items-center gap-4 rounded-xl border border-line bg-surface p-5 text-left transition-colors hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
                : 'flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand'
            }
          >
            <span aria-hidden="true" className={careHome ? 'text-3xl leading-none' : 'text-lg leading-none'}>
              {entry.icon}
            </span>
            <div className="min-w-0">
              <div className={careHome ? 'text-lg font-semibold' : 'text-base font-medium'}>{t(entry.labelKey)}</div>
              <div className={careHome ? 'mt-1 text-sm text-muted' : 'mt-1 text-xs text-muted'}>{t(entry.descKey)}</div>
            </div>
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className={
          careHome
            ? 'mt-5 flex min-h-12 w-full items-center gap-3 border-t border-line px-2 pt-4 text-left text-base font-medium text-brand transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
            : 'mt-3 flex w-full items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4 text-left transition-colors hover:border-brand'
        }
      >
        <span aria-hidden="true" className="text-xl leading-none">▦</span>
        <div>
          <div className={careHome ? 'font-medium' : 'text-base font-medium'}>{t('share.receive')}</div>
          {!careHome && <div className="mt-1 text-xs text-muted">{t('share.receiveDesc')}</div>}
        </div>
      </button>

      {scanOpen && <ShareReceiveDialog onClose={() => setScanOpen(false)} />}

      <InstallHint />
    </div>
  )
}
