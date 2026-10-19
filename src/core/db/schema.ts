/** 一条日记 */
export interface DiaryEntry {
  /** 内部唯一 id（ULID，天然按时间有序） */
  id: string
  /** 7 位十六进制短编号，用于展示与区分，如 a3f9c21 */
  code: string
  /** 归属日期，'YYYY-MM-DD'（按设备本地时区派生） */
  dateKey: string
  createdAt: number
  updatedAt: number
  /** 纯文本正文 */
  content: string
  /** 软删除标记 */
  deletedAt: number | null
}

/** 某一天的信息（与条数无关，同一天的多条日记共享） */
export interface DiaryDay {
  dateKey: string
  /** 天气描述，手填或以后由天气接口写入 */
  weather: string | null
  updatedAt: number
}

/** 随记的一笔：某天某个时刻发生的一件小事，一天可以有很多笔 */
export interface DiaryStamp {
  /** 内部唯一 id（ULID） */
  id: string
  /** 归属日期，'YYYY-MM-DD' */
  dateKey: string
  /** 时刻标记，'HH:MM' */
  time: string
  /** 这一笔的内容 */
  content: string
  createdAt: number
  updatedAt: number
  /** 软删除标记 */
  deletedAt: number | null
}
