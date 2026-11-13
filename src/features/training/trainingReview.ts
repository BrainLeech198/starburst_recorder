import type { HealthTraining } from '@/core/db/schema'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import type { AiConfig } from '@/features/ai/aiConfig'
import type { Locale } from '@/shared/i18n/context'

const LOCALE_NAMES: Record<Locale, string> = {
  zh: '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  ru: 'Русский',
  es: 'Español',
}

export function buildTrainingReviewPrompt(
  trainings: HealthTraining[],
  from: string,
  to: string,
  locale: Locale,
) {
  const rows = trainings
    .filter((training) => training.deletedAt === null && training.dateKey >= from && training.dateKey <= to)
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time))
    .map((training) => ({
      date: training.dateKey,
      title: training.title,
      type: training.kind,
      durationMin: training.durationMin,
      exercises: (training.exercises ?? []).map((exercise) => ({
        name: exercise.name,
        muscle: exercise.muscle,
        sets: exercise.sets.map((set) => ({ reps: set.reps, weightKg: set.weightKg })),
        durationMin: exercise.durationMin,
        distanceKm: exercise.distanceKm,
      })),
    }))
  return {
    rows,
    system: `你是训练记录回顾助手。用${LOCALE_NAMES[locale]}回答，只根据给出的记录总结本区间训练。指出记录覆盖和缺失，不推断用户体能、伤病或训练效果；建议最多三条、温和且可选择；证据不足就明确说不足。不要把不同动作的容量解释成肌肉量，不提供诊断或医疗建议。`,
    user: JSON.stringify({ range: { from, to }, sessions: rows }, null, 2),
  }
}

export async function reviewTrainingPeriod(
  config: AiConfig,
  trainings: HealthTraining[],
  from: string,
  to: string,
  locale: Locale,
) {
  const prompt = buildTrainingReviewPrompt(trainings, from, to, locale)
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    temperature: 0.4,
  })
  if (!result.ok) return { ok: false as const, error: explainFailure(result, config.baseUrl) }
  return { ok: true as const, text: pickReply(result.body).trim() }
}
