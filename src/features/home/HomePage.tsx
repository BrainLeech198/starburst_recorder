import { useState } from 'react'
import { Link } from 'react-router'
import { useCareMode } from '@/shared/care/careContext'
import { useI18n } from '@/shared/i18n/context'
import type { MessageKey } from '@/shared/i18n/messages/zh'
import ShareReceiveDialog from '@/features/share/ShareReceiveDialog'
import Dropdown from '@/shared/ui/Dropdown'
import { Icon } from '@/shared/ui/icons'
import InstallHint from './InstallHint'
import TodayScheduleCard from './TodayScheduleCard'
import { dismissHomeBrand, isHomeBrandDismissed } from './homeBrand'

const ENTRIES: { to: string; icon: string; labelKey: MessageKey; descKey: MessageKey }[] = [
  { to: '/diary', icon: '📖', labelKey: 'nav.diary', descKey: 'home.diaryDesc' },
  { to: '/health', icon: '💪', labelKey: 'nav.health', descKey: 'home.healthDesc' },
  { to: '/training', icon: '🏋️', labelKey: 'nav.training', descKey: 'home.trainingDesc' },
  { to: '/finance', icon: '💰', labelKey: 'nav.finance', descKey: 'home.financeDesc' },
]

function Starburst({ onDismiss, label }: { onDismiss: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={label}
      title={label}
      className="rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <svg width="96" height="96" viewBox="0 0 88 88" aria-hidden="true" className="block h-16 w-16 sm:h-24 sm:w-24">
        <circle cx="44" cy="44" r="34" fill="var(--color-brand)" fillOpacity="0.12" />
        <path
          d="M44 5 L52.5 35.5 L83 44 L52.5 52.5 L44 83 L35.5 52.5 L5 44 L35.5 35.5 Z"
          fill="var(--color-brand)"
        />
      </svg>
    </button>
  )
}

export default function HomePage() {
  const { t } = useI18n()
  const { state: care } = useCareMode()
  const careHome = care.care
  const [shareAction, setShareAction] = useState<'scan' | 'paste' | null>(null)
  const [brandVisible, setBrandVisible] = useState(() => !isHomeBrandDismissed())
  const [activeView, setActiveView] = useState<'home' | 'today'>('home')

  function hideBrand() {
    dismissHomeBrand()
    setBrandVisible(false)
  }

  return (
    <div
      className={[
        'relative mx-auto flex w-full flex-1 flex-col px-4 pt-20 sm:px-6',
        careHome
          ? 'max-w-xl items-stretch justify-start pb-8'
          : 'max-w-lg items-center justify-start pb-16 sm:pb-8',
      ].join(' ')}
    >
      <div className="fixed right-4 top-3 z-50 sm:right-6 sm:top-4">
        <Dropdown
          label="⋯"
          menuLabel={t('common.more')}
          caret={false}
          items={[
            { label: t('share.scan'), icon: 'scan', onSelect: () => setShareAction('scan') },
            { label: t('share.importCode'), icon: 'import', onSelect: () => setShareAction('paste') },
          ]}
          buttonClassName="inline-flex h-10 w-11 items-center justify-center rounded-xl border border-line bg-surface text-xl leading-none text-muted shadow-sm transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </div>

      <div className="fixed left-4 top-3 z-50 sm:top-4 md:left-4">
        <div
          role="group"
          aria-label={t('home.viewSwitcher')}
          className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface/95 p-1 shadow-sm backdrop-blur"
        >
          {(['home', 'today'] as const).map((view) => {
            const selected = activeView === view
            return (
              <button
                key={view}
                type="button"
                aria-pressed={selected}
                onClick={() => setActiveView(view)}
                className={[
                  'sb-pressable inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  selected
                    ? 'bg-brand/15 font-medium text-brand'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                ].join(' ')}
              >
                {view === 'home' ? (
                  <span aria-hidden="true" className="text-base leading-none">
                    🏠
                  </span>
                ) : (
                  <Icon name="check" className="h-4 w-4 shrink-0" />
                )}
                {t(view === 'home' ? 'nav.home' : 'home.todayChecklist.title')}
              </button>
            )
          })}
        </div>
      </div>

      {activeView === 'today' ? (
        <TodayScheduleCard />
      ) : (
        <>
          {!careHome && brandVisible && (
            <div className="mt-5 flex flex-col items-center">
              <Starburst onDismiss={hideBrand} label={t('home.brand.dismiss')} />
              <h1 className="mt-5 text-2xl font-medium tracking-wide sm:mt-7">{t('app.name')}</h1>
              <p className="mt-2 text-sm text-muted">{t('app.tagline')}</p>
            </div>
          )}

          {careHome && <h1 className="mt-1 w-full text-xl font-semibold">{t('home.careTitle')}</h1>}

          <div
            className={
              careHome
                ? 'mt-5 grid w-full grid-cols-1 gap-3'
                : 'mt-8 grid w-full grid-cols-2 auto-rows-fr gap-3 sm:mt-10'
            }
          >
            {ENTRIES.map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                className={careHome
                  ? 'flex min-h-20 items-center gap-4 rounded-xl border border-line bg-surface p-5 text-left transition-colors hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
                  : 'flex min-h-20 items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-brand sm:min-h-24 sm:p-4'}
              >
                <span aria-hidden="true" className={careHome ? 'text-3xl leading-none' : 'text-lg leading-none'}>
                  {entry.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={careHome ? 'text-lg font-semibold' : 'text-base font-medium'}>{t(entry.labelKey)}</div>
                  <div className={careHome ? 'mt-1 text-sm text-muted' : 'mt-1 min-h-8 text-xs leading-4 text-muted'}>
                    {t(entry.descKey)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <InstallHint />
        </>
      )}

      {shareAction && (
        <ShareReceiveDialog
          key={shareAction}
          autoScan={shareAction === 'scan'}
          onClose={() => setShareAction(null)}
        />
      )}

    </div>
  )
}
