/**
 * 一句话记一次训练：把「今天卧推 3 组 8/8/6，40 公斤」拆成一条训练记录。
 *
 * 提示词与解析都是纯函数，请求走 aiClient；解析结果先回填到表单里让用户改，确认后才落库。
 */
import type { HealthTraining, TrainingKind } from '@/core/db/schema'
import { pickExercises } from '@/core/db/normalize'
import { newCode, newId } from '@/core/utils/id'
import { isDateKey, todayKey } from '@/core/utils/dateKey'
import { translate } from '@/shared/i18n/context'
import { chat, explainFailure, pickReply } from '@/features/ai/aiClient'
import type { AiConfig } from '@/features/ai/aiConfig'
import type { MessageKey } from '@/shared/i18n/messages/zh'

export interface PhraseResult {
  ok: boolean
  training?: HealthTraining
  errorKey?: MessageKey
}

const KINDS: TrainingKind[] = ['strength', 'cardio', 'mobility', 'sport', 'other']
const MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'fullBody', 'cardio', 'other']

export function buildPhrasePrompt(today: string): { system: string; user: string } {
  return {
    system: `你在帮用户把一句话记成一次训练。只做一件事：拆出动作、组数和数字。

今天是 ${today}。

字段约定：
- kind 只能是：strength（力量）、cardio（有氧）、mobility（拉伸）、sport（球类）、other（其他）
- muscle 只能是：${MUSCLES.join(' / ')}
- 每个动作：{"name":"卧推","kind":"strength","muscle":"chest","sets":[{"reps":8,"weightKg":40,"durationSec":null,"restSec":null,"rpe":null}],"durationMin":null,"distanceKm":null,"note":""}
- 「3 组 8/8/6」要拆成三组，reps 分别是 8、8、6
- 「3 组 12 次 40kg」拆成三组，每组 reps 12、weightKg 40
- 不确定的数字填 null，不要编造负重
- 有氧可以只给 durationMin 和 distanceKm，sets 留空数组
- 只输出一个 JSON 对象，不要代码块、不要解释、不要开场白

格式：
{"dateKey":"${today}","time":"19:30","kind":"strength","title":"","exercises":[...],"durationMin":null,"feeling":null,"note":""}`,
    user: '',
  }
}

function stripFence(text: string) {
  return text
    .trim()
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
}

function nullablePositive(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max
    ? value
    : null
}

function clockNow() {
  return new Date().toTimeString().slice(0, 5)
}

export function parseTrainingPhrase(reply: string, today = todayKey()): PhraseResult {
  const json = stripFence(reply).match(/\{[\s\S]*\}/)?.[0]
  if (!json) return { ok: false, errorKey: 'training.phraseEmpty' }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { ok: false, errorKey: 'training.phraseEmpty' }
  }

  const exercises = pickExercises(data.exercises)
  if (exercises.length === 0) return { ok: false, errorKey: 'training.phraseEmpty' }

  const kind = KINDS.includes(data.kind as TrainingKind) ? (data.kind as TrainingKind) : 'other'
  const rawDate = typeof data.dateKey === 'string' ? data.dateKey : ''
  const rawTime = typeof data.time === 'string' ? data.time : ''
  const feeling = nullablePositive(data.feeling, 5)

  return {
    ok: true,
    training: {
      id: newId(),
      code: newCode(),
      dateKey: isDateKey(rawDate) ? rawDate : today,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : clockNow(),
      kind,
      title: typeof data.title === 'string' ? data.title.trim() : '',
      exercises,
      durationMin: nullablePositive(data.durationMin, 1440),
      feeling: feeling === null ? null : Math.round(feeling),
      note: typeof data.note === 'string' ? data.note.trim() : '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    },
  }
}

export interface PhraseAnalysis {
  ok: boolean
  training: HealthTraining | null
  error: string
}

export async function analyzeTrainingPhrase(
  config: AiConfig,
  phrase: string,
  today = todayKey(),
): Promise<PhraseAnalysis> {
  const prompt = buildPhrasePrompt(today)
  const result = await chat({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: phrase },
    ],
    temperature: 0.2,
  })

  if (!result.ok) {
    return { ok: false, training: null, error: explainFailure(result, config.baseUrl) }
  }

  const parsed = parseTrainingPhrase(pickReply(result.body), today)
  if (!parsed.ok || !parsed.training) {
    return {
      ok: false,
      training: null,
      error: translate(parsed.errorKey ?? 'training.phraseEmpty'),
    }
  }
  return { ok: true, training: parsed.training, error: '' }
}
