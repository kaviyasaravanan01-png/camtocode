export type ScrollMode = 'timer' | 'keyboard'

export interface ScrollReaderSettings {
  bgColor: string
  textColor: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  lineHeight: number
  fontFamily: string
  showLineNumbers: boolean
  linesPerStep: number
  autoDetectLines: boolean
  scrollMode: ScrollMode
  timerSeconds: number
  padding: number
  zoomPercent: number
}

export const DEFAULT_SCROLL_SETTINGS: ScrollReaderSettings = {
  bgColor: '#0a0a0a',
  textColor: '#f1f5f9',
  fontSize: 15,
  fontWeight: 'normal',
  lineHeight: 1.45,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  showLineNumbers: true,
  linesPerStep: 30,
  autoDetectLines: true,
  scrollMode: 'keyboard',
  timerSeconds: 10,
  padding: 16,
  zoomPercent: 100,
}

const STORAGE_KEY = 'ctc-scroll-reader-settings'

export function loadScrollSettings(): ScrollReaderSettings {
  if (typeof window === 'undefined') return DEFAULT_SCROLL_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SCROLL_SETTINGS
    return { ...DEFAULT_SCROLL_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SCROLL_SETTINGS
  }
}

export function saveScrollSettings(settings: ScrollReaderSettings) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota */
  }
}
