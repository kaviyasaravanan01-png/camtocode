'use client'

import { useCallback, useState } from 'react'
import { SHARE_TEXT, shareUrl, whatsAppShareUrl } from '@/lib/site'

type Props = {
  url?: string
  text?: string
  compact?: boolean
}

export default function ShareButtons({ url, text, compact = false }: Props) {
  const [copied, setCopied] = useState(false)
  const targetUrl = url || shareUrl()
  const shareMessage = text || SHARE_TEXT

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'CamToCode',
          text: shareMessage,
          url: targetUrl,
        })
        return
      } catch {
        /* user cancelled or unsupported */
      }
    }
    await navigator.clipboard.writeText(`${shareMessage}\n\n${targetUrl}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [shareMessage, targetUrl])

  const btnBase: React.CSSProperties = compact
    ? { padding: '0.35rem 0.65rem', fontSize: '0.75rem' }
    : { padding: '0.55rem 1rem', fontSize: '0.85rem' }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
      <button
        type="button"
        onClick={handleNativeShare}
        style={{
          ...btnBase,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#e2e8f0',
          borderRadius: 8,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {copied ? '✓ Link copied!' : '↗ Share CamToCode'}
      </button>
      <a
        href={whatsAppShareUrl(shareMessage, targetUrl)}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...btnBase,
          background: 'rgba(37,211,102,0.15)',
          border: '1px solid rgba(37,211,102,0.4)',
          color: '#4ade80',
          borderRadius: 8,
          fontWeight: 600,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        WhatsApp
      </a>
    </div>
  )
}
