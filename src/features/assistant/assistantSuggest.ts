/**
 * 推荐问：回答完之后，给用户几个可以直接点的问题。
 *
 * 不额外花一次模型请求，而是按上一段回答里出现的话题挑：
 * 提到体重就给体重相关，提到钱就给钱的，什么都没提到就给通用几条。
 * 纯函数，界面只负责翻译和渲染。
 */
import type { MessageKey } from '@/shared/i18n/messages/zh'

interface Rule {
  /** 匹配上一段回答里的话题（中英文都认，回答语言不一定是中文） */
  pattern: RegExp
  keys: MessageKey[]
}

const RULES: Rule[] = [
  {
    pattern: /体重|称重|公斤|kg|weigh|weight/i,
    keys: [
      'assistant.suggest.weight',
      'assistant.suggest.sleep',
      'assistant.suggest.log',
    ],
  },
  {
    pattern: /睡眠|熬夜|失眠|睡|sleep/i,
    keys: [
      'assistant.suggest.sleep',
      'assistant.suggest.mood',
      'assistant.suggest.plan',
    ],
  },
  {
    pattern: /花|支出|收入|消费|钱|finance|spend|expense/i,
    keys: [
      'assistant.suggest.finance',
      'assistant.suggest.summary',
      'assistant.suggest.log',
    ],
  },
  {
    pattern: /日记|心情|烦恼|情绪|焦虑|mood|diary|emotion/i,
    keys: [
      'assistant.suggest.mood',
      'assistant.suggest.sleep',
      'assistant.suggest.plan',
    ],
  },
  {
    pattern: /吃|热量|饮食|蛋白|calorie|kcal|diet/i,
    keys: [
      'assistant.suggest.food',
      'assistant.suggest.weight',
      'assistant.suggest.log',
    ],
  },
]

const FALLBACK: MessageKey[] = [
  'assistant.suggest.summary',
  'assistant.suggest.more',
  'assistant.suggest.log',
]

/**
 * 按上一段回答挑三条推荐问。
 * 话题规则按顺序第一条命中的就够，避免把整段回答拆成八条推荐。
 */
export function suggestKeys(lastReply: string, limit = 3): MessageKey[] {
  const text = lastReply.trim()
  const keys = RULES.find((rule) => rule.pattern.test(text))?.keys ?? FALLBACK
  return [...new Set(keys)].slice(0, limit)
}
