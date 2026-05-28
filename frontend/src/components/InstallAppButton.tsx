'use client'

import { useCallback, useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Props = {
  variant?: 'landing' | 'compact' | 'app'
}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export default function InstallAppButton({ variant = 'landing' }: Props) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true)
      return
    }
    try {
      if (localStorage.getItem('ctc_install_dismissed') === '1') setDismissed(true)
    } catch { /* ignore */ }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const handleInstall = useCallback(async () => {
    if (isIOS()) {
      setShowIOSHelp(true)
      return
    }
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferredPrompt(null)
      return
    }
    setShowIOSHelp(true)
  }, [deferredPrompt])

  const handleDismiss = () => {
    setDismissed(true)
    try { localStorage.setItem('ctc_install_dismissed', '1') } catch { /* ignore */ }
  }

  if (installed) return null
  if (dismissed && variant === 'app') return null

  const compact = variant === 'compact' || variant === 'app'
  const btnStyle: React.CSSProperties = compact
    ? {
        background: 'rgba(99,102,241,0.2)',
        border: '1px solid rgba(99,102,241,0.45)',
        color: '#c7d2fe',
        borderRadius: 8,
        padding: '0.25rem 0.55rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        cursor: 'pointer',
      }
    : {
        background: 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.35))',
        border: '1px solid rgba(129,140,248,0.5)',
        color: '#e0e7ff',
        borderRadius: 10,
        padding: '0.55rem 1.1rem',
        fontSize: '0.85rem',
        fontWeight: 700,
        cursor: 'pointer',
      }

  return (
    <>
      <button type="button" onClick={handleInstall} style={btnStyle} title="Install CamToCode on your phone">
        📲 {compact ? 'Install App' : 'Install on Phone'}
      </button>
      {variant === 'app' && !dismissed && (
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
            fontSize: '0.7rem', cursor: 'pointer', padding: '0.25rem',
          }}
        >
          ✕
        </button>
      )}

      {showIOSHelp && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => setShowIOSHelp(false)}
        >
          <div
            style={{
              background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16, padding: '1.5rem', maxWidth: 360, width: '100%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.75rem', color: '#f1f5f9', fontSize: '1rem' }}>
              📲 Add CamToCode to Home Screen
            </h3>
            {isIOS() ? (
              <>
                <p style={{ margin: '0 0 0.75rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                  iPhone needs one manual step (Apple rule). Then CamToCode sits on your home screen like an app:
                </p>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                  <li>Tap the <strong>Share</strong> button in Safari (square with arrow)</li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                  <li>Tap <strong>Add</strong> — icon saved on your phone</li>
                </ol>
              </>
            ) : (
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', lineHeight: 1.65 }}>
                In Chrome: menu (⋮) → <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                On desktop Chrome, use the install icon in the address bar. After installing, CamToCode opens full-screen from your home screen.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowIOSHelp(false)}
              style={{
                marginTop: '1rem', width: '100%', padding: '0.6rem',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
