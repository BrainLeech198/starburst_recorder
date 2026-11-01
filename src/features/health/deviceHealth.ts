/**
 * 安卓端从手机健康应用（Health Connect）只读导入体重与睡眠。
 *
 * 桌面和浏览器没有 Health Connect，入口只在安卓原生端出现；插件用动态 import，
 * Web 与桌面构建不会把原生桥接打进主包。解析、去重、拼夜都在 deviceHealthMap 里，
 * 这里只负责判断平台、要权限、读样本。
 */
import { Capacitor } from '@capacitor/core'
import { sleepsFromSamples, weighInsFromSamples } from './deviceHealthMap'
import type { DeviceSample, ImportedSleep, ImportedWeight } from './deviceHealthMap'

/** 导入窗口：最近这些天。Health Connect 没授历史权限时本来就只读得到约 30 天 */
export const DEVICE_IMPORT_DAYS = 30

/** 单次读取的上限：足够覆盖一个月的体重与逐阶段睡眠 */
const READ_LIMIT = 1000

const READ_TYPES = ['weight', 'sleep'] as const
type ReadType = (typeof READ_TYPES)[number]

export type DeviceHealthStatus = 'unavailable' | 'denied' | 'ok'

export interface DeviceHealthSnapshot {
  status: DeviceHealthStatus
  weights: ImportedWeight[]
  sleeps: ImportedSleep[]
}

/** 健康应用的入口只在安卓原生端有意义；桌面、浏览器都没有 */
export function canImportFromHealthApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function healthPlugin() {
  const { Health } = await import('@krzysztofkostecki/capacitor-health')
  return Health
}

async function readSamples(days: number): Promise<{
  weights: ImportedWeight[]
  sleeps: ImportedSleep[]
}> {
  const Health = await healthPlugin()
  const status = await Health.checkAuthorization({ read: [...READ_TYPES] })
  const granted = READ_TYPES.filter((type) => status.readAuthorized.includes(type))
  if (granted.length === 0) return { weights: [], sleeps: [] }

  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const samples: DeviceSample[] = []
  for (const dataType of granted) {
    const result = await Health.readSamples({
      dataType: dataType as ReadType,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: READ_LIMIT,
      ascending: true,
    })
    samples.push(...result.samples)
  }
  return { weights: weighInsFromSamples(samples), sleeps: sleepsFromSamples(samples) }
}

/**
 * 读最近的体重与睡眠。没装 Health Connect 或没授权时只回状态，不抛错；
 * 真正的读取失败（插件报错）交给界面显示。
 */
export async function readDeviceHealth(
  days = DEVICE_IMPORT_DAYS,
): Promise<DeviceHealthSnapshot> {
  const empty: DeviceHealthSnapshot = { status: 'unavailable', weights: [], sleeps: [] }
  if (!canImportFromHealthApp()) return empty

  const Health = await healthPlugin()
  const availability = await Health.isAvailable()
  if (!availability.available) return empty

  const status = await Health.checkAuthorization({ read: [...READ_TYPES] })
  if (status.readAuthorized.length === 0) return { status: 'denied', weights: [], sleeps: [] }

  const { weights, sleeps } = await readSamples(days)
  return { status: 'ok', weights, sleeps }
}

/** 弹系统的授权页，请求体重与睡眠的只读权限；授权了就返回 true */
export async function requestDeviceHealthAccess(): Promise<boolean> {
  if (!canImportFromHealthApp()) return false
  const Health = await healthPlugin()
  const status = await Health.requestAuthorization({ read: [...READ_TYPES] })
  return status.readAuthorized.length > 0
}

/** 没装 Health Connect 或想改授权时，打开系统的健康连接页面 */
export async function openHealthConnect(): Promise<void> {
  if (!canImportFromHealthApp()) return
  const Health = await healthPlugin()
  await Health.openHealthConnectSettings()
}
