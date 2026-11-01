/**
 * 助手技能库：内置技能 + 官网下载 + 本地文件导入。
 *
 * 技能只是提示词层面的「方法包」，不会多拿数据权限；
 * 启用状态和已安装技能都存在本机 localStorage，随时可以停用或移除。
 */
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useToast } from '@/app/providers/ToastProvider'
import { openExternal } from '@/platform/openExternal'
import { useI18n } from '@/shared/i18n/context'
import PageShell from '@/shared/ui/PageShell'
import SettingCard, { SettingBadge } from '@/shared/ui/SettingCard'
import { choiceTile } from '@/shared/ui/buttonStyles'
import { Icon } from '@/shared/ui/icons'
import {
  SKILLS_SITE_URL,
  downloadSkill,
  fetchSkillCatalog,
  installSkill,
  loadSkills,
  normalizeSkill,
  removeSkill,
  setSkillEnabled,
  type AssistantSkill,
  type SkillCatalogEntry,
} from '@/features/assistant/assistantSkills'

export default function SkillsPage() {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [skills, setSkills] = useState(loadSkills)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalog, setCatalog] = useState<SkillCatalogEntry[] | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [working, setWorking] = useState('')
  const importRef = useRef<HTMLInputElement | null>(null)

  const enabledCount = skills.filter((skill) => skill.enabled).length

  function refresh() {
    setSkills(loadSkills())
  }

  function toggle(skill: AssistantSkill) {
    setSkillEnabled(skill.id, !skill.enabled)
    refresh()
  }

  function remove(skill: AssistantSkill) {
    removeSkill(skill.id)
    refresh()
    showToast({ message: t('skills.removed', { name: skill.name }) })
  }

  async function openCatalog() {
    setCatalogOpen(true)
    if (catalog !== null || loadingCatalog) return
    setLoadingCatalog(true)
    const list = await fetchSkillCatalog()
    setLoadingCatalog(false)
    if (list === null) {
      showToast({ message: t('skills.catalogFailed') })
      setCatalog([])
      return
    }
    setCatalog(list)
  }

  async function install(entry: SkillCatalogEntry) {
    if (working !== '') return
    setWorking(entry.id)
    try {
      const skill = await downloadSkill(entry)
      if (!skill) {
        showToast({ message: t('skills.importBad') })
        return
      }
      const result = installSkill(skill)
      if (result === 'builtin') {
        showToast({ message: t('skills.builtinAlready') })
        return
      }
      refresh()
      showToast({ message: t('skills.installedDone', { name: skill.name }) })
    } finally {
      setWorking('')
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ''
    if (!picked) return
    try {
      const skill = normalizeSkill(JSON.parse(await picked.text()))
      if (!skill) {
        showToast({ message: t('skills.importBad') })
        return
      }
      const result = installSkill(skill)
      if (result === 'builtin') {
        showToast({ message: t('skills.builtinAlready') })
        return
      }
      refresh()
      showToast({ message: t('skills.installedDone', { name: skill.name }) })
    } catch {
      showToast({ message: t('skills.importBad') })
    }
  }

  function installed(id: string) {
    return skills.some((skill) => skill.id === id)
  }

  return (
    <PageShell
      title={t('skills.title')}
      description={t('skills.description')}
      badge={<SettingBadge>{t('skills.badge', { count: enabledCount })}</SettingBadge>}
      backTo="/me/agent"
      backLabel={t('me.agent')}
    >
      <SettingCard title={t('skills.catalogTitle')} description={t('skills.catalogDesc')}>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void openCatalog()} className={choiceTile(false, 'px-3 py-2 text-xs')}>
            <Icon name="download" />
            {loadingCatalog ? t('skills.catalogLoading') : t('skills.catalogLoad')}
          </button>
          <button
            type="button"
            onClick={() => void openExternal(SKILLS_SITE_URL)}
            className={choiceTile(false, 'px-3 py-2 text-xs')}
          >
            {t('skills.site')}
          </button>
        </div>

        {catalogOpen && (
          <div className="mt-3 flex flex-col gap-2">
            {loadingCatalog && (
              <p className="m-0 text-[11px] text-muted">{t('skills.catalogLoading')}</p>
            )}
            {!loadingCatalog && catalog !== null && catalog.length === 0 && (
              <p className="m-0 text-[11px] text-muted">{t('skills.catalogEmpty')}</p>
            )}
            {(catalog ?? []).map((entry) => {
              const already = installed(entry.id)
              return (
                <div key={entry.id} className="rounded-xl border border-line bg-surface-2 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 text-sm text-fg">{entry.name}</p>
                      <p className="m-0 mt-0.5 text-[11px] text-muted">{entry.description}</p>
                      <p className="m-0 mt-1 text-[10px] text-muted">
                        {entry.category} · v{entry.version} · {entry.author}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={already || working === entry.id}
                      onClick={() => void install(entry)}
                      className="shrink-0 rounded-lg border border-brand px-2.5 py-1 text-xs text-brand transition-colors hover:bg-brand/10 disabled:opacity-40"
                    >
                      <Icon name="download" />
                      {already ? t('skills.installed') : t('skills.install')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SettingCard>

      <SettingCard title={t('skills.importTitle')}>
        <p className="m-0 text-xs text-muted">{t('skills.importDesc')}</p>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          className={choiceTile(false, 'mt-2 px-3 py-2 text-xs')}
        >
          <Icon name="upload" />
          {t('skills.importButton')}
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => void importFile(event)}
        />
      </SettingCard>

      <div className="flex flex-col gap-2">
        {skills.map((skill) => (
          <article key={skill.id} className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-sm font-medium text-fg">{skill.name}</h3>
                  <SettingBadge tone={skill.builtin ? 'plain' : 'ok'}>
                    {skill.builtin ? t('skills.builtin') : t('skills.installed')}
                  </SettingBadge>
                  {!skill.enabled && <SettingBadge tone="plain">{t('skills.disabled')}</SettingBadge>}
                </div>
                <p className="m-0 mt-1 text-xs text-muted">{skill.description}</p>
                <p className="m-0 mt-1 text-[10px] text-muted">
                  {skill.category} · v{skill.version} · {skill.author}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={skill.enabled}
                onClick={() => toggle(skill)}
                className={choiceTile(skill.enabled, 'shrink-0 px-2.5 py-1 text-xs')}
              >
                {skill.enabled ? t('skills.disable') : t('skills.enable')}
              </button>
            </div>

            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer select-none">{t('skills.instructions')}</summary>
              <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-fg">
                {skill.instructions}
              </pre>
            </details>

            {!skill.builtin && (
              <button
                type="button"
                onClick={() => remove(skill)}
                className="mt-2 text-[11px] text-danger transition-colors hover:underline"
              >
                {t('skills.remove')}
              </button>
            )}
          </article>
        ))}
      </div>
    </PageShell>
  )
}
