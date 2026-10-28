/**
 * 「语言」二级页：选界面语言，立即生效并写进 localStorage（sb_locale）。
 * 加语言时只改 context.ts 的 LOCALE_ORDER / LOCALE_LABEL_KEYS，这里自动跟上。
 */
import { LOCALE_LABEL_KEYS, LOCALE_ORDER, useI18n } from '@/shared/i18n/context'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import { choiceTile } from '@/shared/ui/buttonStyles'

export default function LanguagePage() {
  const { t, locale, setLocale } = useI18n()

  return (
    <PageShell
      title={t('language.title')}
      badge={<SettingBadge>{t(LOCALE_LABEL_KEYS[locale])}</SettingBadge>}
      description={t('language.description')}
    >
      <SettingCard>
        <SettingGroup label={t('language.title')} first>
          <div className="grid grid-cols-2 gap-2">
            {LOCALE_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setLocale(id)}
                className={choiceTile(
                  locale === id,
                  'flex items-center justify-center gap-2 px-3 py-2',
                )}
              >
                {t(LOCALE_LABEL_KEYS[id])}
                {locale === id && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </SettingGroup>
      </SettingCard>
    </PageShell>
  )
}
