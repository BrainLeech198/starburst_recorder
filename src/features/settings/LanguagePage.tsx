/**
 * 「语言」二级页：选界面语言，立即生效并写进 localStorage（sb_locale）。
 * 目前中/英两种；以后加语言就往 LOCALES 里添一行。
 */
import { useI18n } from '@/shared/i18n/context'
import type { Locale } from '@/shared/i18n/context'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import { choiceTile } from '@/shared/ui/buttonStyles'

const LOCALES: { id: Locale; labelKey: 'language.zh' | 'language.en' }[] = [
  { id: 'zh', labelKey: 'language.zh' },
  { id: 'en', labelKey: 'language.en' },
]

export default function LanguagePage() {
  const { t, locale, setLocale } = useI18n()

  return (
    <PageShell
      title={t('language.title')}
      badge={
        <SettingBadge>{t(locale === 'zh' ? 'language.zh' : 'language.en')}</SettingBadge>
      }
      description={t('language.description')}
    >
      <SettingCard>
        <SettingGroup label={t('language.title')} first>
          <div className="grid grid-cols-2 gap-2">
            {LOCALES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLocale(item.id)}
                className={choiceTile(
                  locale === item.id,
                  'flex items-center justify-center gap-2 px-3 py-2',
                )}
              >
                {t(item.labelKey)}
                {locale === item.id && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
