/** Canonical public site URL — set NEXT_PUBLIC_SITE_URL in Vercel when using camtocode.com */
export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || 'https://camtocode.com').replace(/\/$/, '')

export const SITE_NAME = 'CamToCode'

export const SITE_TAGLINE =
  'Point your camera at code. Get clean code instantly — with AI Fix, Scan & Answer, and Instant MCQ answers.'

export const SHARE_TEXT =
  'CamToCode — scan code from your camera, fix with AI, and save to your cloud. Free to start!'

export function shareUrl(path = '') {
  return `${SITE_URL}${path.startsWith('/') ? path : path ? `/${path}` : ''}`
}

export function whatsAppShareUrl(text?: string, url?: string) {
  const message = `${text || SHARE_TEXT}\n\n${url || SITE_URL}`
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
