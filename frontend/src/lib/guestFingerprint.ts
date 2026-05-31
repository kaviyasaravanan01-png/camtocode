const STORAGE_KEY = 'ctc_guest_fp'

/** Stable browser fingerprint for guest demo rate limiting (paired with IP on server). */
export function getGuestFingerprint(): string {
  if (typeof window === 'undefined') return ''
  try {
    let fp = localStorage.getItem(STORAGE_KEY)
    if (!fp) {
      fp = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEY, fp)
    }
    return fp
  } catch {
    return 'anonymous'
  }
}
