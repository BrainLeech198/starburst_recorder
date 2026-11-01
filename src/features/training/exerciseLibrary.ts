/**
 * 内置动作库：纯静态数据，不建表、不落库。
 *
 * 用户第一次点选记时先看「常用」八个，再搜。搜不到也能直接保存，
 * 自定义动作名不写进这里，下次从历史记录里出现。
 */
import type { TrainingKind } from '@/core/db/schema'

export interface LibraryExercise {
  name: string
  kind: TrainingKind
  muscle: string
  /** 英文与常见叫法，供搜索与 AI 匹配 */
  aliases: string[]
}

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { name: '卧推', kind: 'strength', muscle: 'chest', aliases: ['bench press', 'bench', '平板卧推'] },
  { name: '上斜卧推', kind: 'strength', muscle: 'chest', aliases: ['incline bench', 'incline press'] },
  { name: '俯卧撑', kind: 'strength', muscle: 'chest', aliases: ['push up', 'pushup'] },
  { name: '哑铃飞鸟', kind: 'strength', muscle: 'chest', aliases: ['dumbbell fly', 'fly'] },
  { name: '深蹲', kind: 'strength', muscle: 'legs', aliases: ['squat', '杠铃深蹲'] },
  { name: '硬拉', kind: 'strength', muscle: 'back', aliases: ['deadlift'] },
  { name: '引体向上', kind: 'strength', muscle: 'back', aliases: ['pull up', 'pullup', '引体'] },
  { name: '杠铃划船', kind: 'strength', muscle: 'back', aliases: ['barbell row', 'row'] },
  { name: '坐姿划船', kind: 'strength', muscle: 'back', aliases: ['seated row', 'cable row'] },
  { name: '高位下拉', kind: 'strength', muscle: 'back', aliases: ['lat pulldown', 'pulldown', '下拉'] },
  { name: '推举', kind: 'strength', muscle: 'shoulders', aliases: ['overhead press', 'ohp', '肩推'] },
  { name: '侧平举', kind: 'strength', muscle: 'shoulders', aliases: ['lateral raise'] },
  { name: '面拉', kind: 'strength', muscle: 'shoulders', aliases: ['face pull'] },
  { name: '哑铃弯举', kind: 'strength', muscle: 'arms', aliases: ['bicep curl', 'curl', '弯举'] },
  { name: '三头下压', kind: 'strength', muscle: 'arms', aliases: ['triceps pushdown', 'pushdown', '绳索下压'] },
  { name: '双杠臂屈伸', kind: 'strength', muscle: 'arms', aliases: ['dip', '臂屈伸'] },
  { name: '腿举', kind: 'strength', muscle: 'legs', aliases: ['leg press'] },
  { name: '弓步蹲', kind: 'strength', muscle: 'legs', aliases: ['lunge', '箭步蹲'] },
  { name: '腿弯举', kind: 'strength', muscle: 'legs', aliases: ['leg curl'] },
  { name: '腿屈伸', kind: 'strength', muscle: 'legs', aliases: ['leg extension'] },
  { name: '提踵', kind: 'strength', muscle: 'legs', aliases: ['calf raise'] },
  { name: '臀桥', kind: 'strength', muscle: 'legs', aliases: ['glute bridge', 'hip thrust'] },
  { name: '平板支撑', kind: 'strength', muscle: 'core', aliases: ['plank'] },
  { name: '卷腹', kind: 'strength', muscle: 'core', aliases: ['crunch', '仰卧起坐', 'sit up'] },
  { name: '悬垂举腿', kind: 'strength', muscle: 'core', aliases: ['hanging leg raise', '举腿'] },
  { name: '俄罗斯转体', kind: 'strength', muscle: 'core', aliases: ['russian twist'] },
  { name: '跑步', kind: 'cardio', muscle: 'cardio', aliases: ['run', 'running', '慢跑', 'jog'] },
  { name: '快走', kind: 'cardio', muscle: 'cardio', aliases: ['walk', 'walking', '走路'] },
  { name: '骑行', kind: 'cardio', muscle: 'cardio', aliases: ['cycling', 'bike', '单车'] },
  { name: '游泳', kind: 'cardio', muscle: 'cardio', aliases: ['swim', 'swimming'] },
  { name: '跳绳', kind: 'cardio', muscle: 'cardio', aliases: ['jump rope', 'skip'] },
  { name: '椭圆机', kind: 'cardio', muscle: 'cardio', aliases: ['elliptical'] },
  { name: '划船机', kind: 'cardio', muscle: 'cardio', aliases: ['rowing machine', 'erg'] },
  { name: '爬楼机', kind: 'cardio', muscle: 'cardio', aliases: ['stair climber', 'stairs'] },
  { name: '开合跳', kind: 'cardio', muscle: 'fullBody', aliases: ['jumping jack'] },
  { name: '波比跳', kind: 'cardio', muscle: 'fullBody', aliases: ['burpee'] },
  { name: '拉伸', kind: 'mobility', muscle: 'fullBody', aliases: ['stretch', 'stretching'] },
  { name: '瑜伽', kind: 'mobility', muscle: 'fullBody', aliases: ['yoga'] },
  { name: '泡沫轴放松', kind: 'mobility', muscle: 'other', aliases: ['foam roll', '泡沫轴'] },
  { name: '篮球', kind: 'sport', muscle: 'fullBody', aliases: ['basketball'] },
  { name: '羽毛球', kind: 'sport', muscle: 'fullBody', aliases: ['badminton'] },
  { name: '足球', kind: 'sport', muscle: 'legs', aliases: ['football', 'soccer'] },
  { name: '网球', kind: 'sport', muscle: 'fullBody', aliases: ['tennis'] },
  { name: '徒步', kind: 'sport', muscle: 'legs', aliases: ['hiking', 'hike', '爬山'] },
]

/** 第一次点选记时直接摆出来的八个 */
const COMMON_NAMES = ['卧推', '深蹲', '硬拉', '引体向上', '杠铃划船', '推举', '跑步', '平板支撑']

export const COMMON_EXERCISES: LibraryExercise[] = COMMON_NAMES.map((name) =>
  EXERCISE_LIBRARY.find((item) => item.name === name),
).filter((item): item is LibraryExercise => item !== undefined)

function matches(item: LibraryExercise, query: string) {
  if (item.name.toLowerCase().includes(query)) return true
  return item.aliases.some((alias) => alias.toLowerCase().includes(query))
}

/** 中文名与英文别名都能命中；结果按库里的顺序，不重复 */
export function searchExercises(query: string, limit = 20): LibraryExercise[] {
  const keyword = query.trim().toLowerCase()
  if (keyword === '') return EXERCISE_LIBRARY.slice(0, limit)
  const seen = new Set<string>()
  const found: LibraryExercise[] = []
  for (const item of EXERCISE_LIBRARY) {
    if (seen.has(item.name) || !matches(item, keyword)) continue
    seen.add(item.name)
    found.push(item)
    if (found.length >= limit) break
  }
  return found
}

/** 按名字或别名找一条，用来补全类型与部位 */
export function findExercise(name: string): LibraryExercise | undefined {
  const keyword = name.trim().toLowerCase()
  if (keyword === '') return undefined
  return EXERCISE_LIBRARY.find(
    (item) =>
      item.name.toLowerCase() === keyword ||
      item.aliases.some((alias) => alias.toLowerCase() === keyword),
  )
}
