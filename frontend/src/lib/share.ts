import { SHARE_TEXT, SITE_NAME, SITE_URL, whatsAppShareUrl } from '@/lib/site'

export function buildExportShareMessage(filename: string) {
  return `I captured \`${filename}\` with ${SITE_NAME} — point your camera at code and get clean output instantly. Try free at ${SITE_URL}`
}

export function twitterShareUrl(text: string, url = SITE_URL) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
}

export function linkedInShareUrl(url = SITE_URL) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
}

export function facebookShareUrl(url = SITE_URL) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
}

export function telegramShareUrl(text: string, url = SITE_URL) {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
}

export { whatsAppShareUrl, SHARE_TEXT, SITE_URL, SITE_NAME }

export async function nativeShare(opts: { title: string; text: string; url?: string }) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share({
      title: opts.title,
      text: opts.text,
      url: opts.url || SITE_URL,
    })
    return true
  }
  return false
}
