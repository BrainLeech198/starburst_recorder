const HOME_BRAND_DISMISSED_KEY = 'sb_home_brand_hidden'

/** A device-local presentation choice; the value is also included in preference backups. */
export function isHomeBrandDismissed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(HOME_BRAND_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissHomeBrand(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(HOME_BRAND_DISMISSED_KEY, '1')
  } catch {
    // The current view still dismisses the brand even if storage is unavailable.
  }
}
