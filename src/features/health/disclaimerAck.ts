const ACK_KEY = 'starburst.health.disclaimer.ack'

export function hasAcknowledgedDisclaimer(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === '1'
  } catch {
    // 隐私模式下 localStorage 会抛错，当作已经看过，别每次进来都弹
    return true
  }
}

export function acknowledgeDisclaimer() {
  try {
    localStorage.setItem(ACK_KEY, '1')
  } catch {
    // 记不住就算了，下次再看到一次说明也无妨
  }
}
