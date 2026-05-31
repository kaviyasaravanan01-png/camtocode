'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { io, Socket } from 'socket.io-client'
import { getGuestFingerprint } from '@/lib/guestFingerprint'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'
const LOGIN_URL = '/login?redirect=/app'

export default function GuestTryApp() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [statusMsg, setStatusMsg] = useState('Connecting...')
  const [capturing, setCapturing] = useState(false)
  const [processingScan, setProcessingScan] = useState(false)
  const [outputText, setOutputText] = useState('')
  const [lastLang, setLastLang] = useState('')
  const [scansRemaining, setScansRemaining] = useState(1)
  const [demoBlocked, setDemoBlocked] = useState(false)
  const [demoComplete, setDemoComplete] = useState(false)

  const canScan = scansRemaining > 0 && !demoBlocked && !demoComplete && socketStatus === 'connected' && !processingScan

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const startCamera = useCallback(async () => {
    stopStream()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Camera error'
      setStatusMsg('Camera error: ' + msg)
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopStream()
  }, [startCamera])

  useEffect(() => {
    const fp = getGuestFingerprint()
    const sock = io(BACKEND_URL, {
      transports: ['polling'],
      query: { guest: '1', guest_fp: fp },
      timeout: 20000,
    })
    socketRef.current = sock

    sock.on('connect', () => {
      setSocketStatus('connected')
      setStatusMsg('Ready — 1 free demo scan with Quick OCR')
    })
    sock.on('connect_error', () => {
      setSocketStatus('error')
      setStatusMsg('Backend unreachable')
    })
    sock.on('disconnect', () => {
      setSocketStatus('connecting')
      setProcessingScan(false)
    })

    sock.on('init_state', (d: { guest_scans_remaining?: number; guest_demo_blocked?: boolean }) => {
      if (typeof d.guest_scans_remaining === 'number') setScansRemaining(d.guest_scans_remaining)
      if (d.guest_demo_blocked) {
        setDemoBlocked(true)
        setDemoComplete(true)
        setStatusMsg('Demo already used on this device — sign in for your free account')
      }
    })

    sock.on('guest_state', (d: { scans_remaining?: number; demo_used?: boolean; quota_blocked?: boolean }) => {
      if (typeof d.scans_remaining === 'number') setScansRemaining(d.scans_remaining)
      if (d.demo_used || d.quota_blocked) {
        setDemoComplete(true)
        setDemoBlocked(true)
      }
    })

    sock.on('guest_error', (d: { msg?: string }) => {
      if (d.msg) setStatusMsg(d.msg)
    })

    sock.on('status', (d: { msg?: string; capturing?: boolean; processing?: boolean; guest_limit?: boolean }) => {
      if (d.msg) setStatusMsg(d.msg)
      if (typeof d.capturing === 'boolean') setCapturing(d.capturing)
      if (typeof d.processing === 'boolean') setProcessingScan(d.processing)
      if (d.guest_limit) {
        setDemoComplete(true)
        setScansRemaining(0)
      }
    })

    sock.on('quality', (d: { text?: string; language?: string }) => {
      if (d.text) {
        setOutputText(d.text)
        if (d.language) setLastLang(d.language)
      }
    })

    sock.on('result', (d: { text?: string; lang?: string; guest_demo?: boolean }) => {
      setProcessingScan(false)
      setCapturing(false)
      if (d.text) setOutputText(d.text)
      if (d.lang) setLastLang(d.lang)
      if (d.guest_demo) {
        setDemoComplete(true)
        setScansRemaining(0)
      }
    })

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      sock.disconnect()
    }
  }, [])

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !socketRef.current?.connected) return
    if (!video.videoWidth || !video.videoHeight) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    socketRef.current.emit('frame', { image: canvas.toDataURL('image/jpeg', 0.85) })
  }, [])

  const handleStart = () => {
    if (!canScan || !socketRef.current?.connected) return
    socketRef.current.emit('start')
    setCapturing(true)
    setOutputText('')
    intervalRef.current = setInterval(captureFrame, 500)
  }

  const handleStop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setCapturing(false)
    setProcessingScan(true)
    socketRef.current?.emit('stop')
  }

  const handlePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!canScan || !video || !canvas || !socketRef.current?.connected) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    setProcessingScan(true)
    setOutputText('')
    socketRef.current.emit('photo', { image: canvas.toDataURL('image/jpeg', 0.95) })
  }

  return (
    <div className="ctc-guest-app" style={s.root}>
      <header style={s.header}>
        <Link href="/" style={s.logo}>CamToCode</Link>
        <div style={s.headerRight}>
          <span style={{ ...s.dot, background: socketStatus === 'connected' ? '#22c55e' : socketStatus === 'error' ? '#ef4444' : '#eab308' }} />
          <Link href={LOGIN_URL} style={s.signInBtn}>Sign in →</Link>
        </div>
      </header>

      <div style={s.banner}>
        <span style={s.bannerTag}>Demo</span>
        <span>
          {demoComplete || demoBlocked
            ? 'Demo used — sign in for copy, save & your free tier (3 AI scans/day)'
            : `${scansRemaining} free scan · Quick OCR only · No save or copy until you sign in`}
        </span>
      </div>

      <div className="ctc-guest-cam-wrap" style={s.camWrap}>
        <video ref={videoRef} playsInline muted style={s.video} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {capturing && <div style={s.liveDot}>● LIVE</div>}
        {processingScan && (
          <div className="ctc-guest-processing">
            <span style={{ fontSize: '1.4rem' }}>⏳</span>
            <span>{statusMsg || 'Processing with Quick OCR...'}</span>
          </div>
        )}
      </div>

      <div style={s.controls}>
        {!capturing ? (
          <>
            <button
              type="button"
              onClick={handleStart}
              disabled={!canScan}
              className="ctc-start-btn"
              style={{ ...s.startBtn, opacity: canScan ? 1 : 0.45 }}
            >
              ▶ Start
            </button>
            <button
              type="button"
              onClick={handlePhoto}
              disabled={!canScan}
              style={{ ...s.photoBtn, opacity: canScan ? 1 : 0.45 }}
            >
              📷 Photo
            </button>
          </>
        ) : (
          <button type="button" onClick={handleStop} className="ctc-stop-btn" style={s.stopBtn}>⏹ Stop</button>
        )}
      </div>

      <p style={s.statusBar}>{statusMsg}</p>

      <div style={s.outputWrap}>
        <div style={s.outputHeader}>
          <span>
            Output {lastLang ? `· ${lastLang}` : ''}
            {demoComplete && outputText ? ' · preview only' : ''}
          </span>
        </div>
        <div className="ctc-guest-output-lock">
          <pre className="ctc-output-pre ctc-guest-output" style={s.output}>
            {outputText
              || (processingScan ? statusMsg || 'Processing...'
              : demoBlocked && !outputText ? 'Demo limit reached on this device. Sign in to continue.'
              : demoComplete && !outputText ? 'Demo complete. Sign in to scan again with your free account.'
              : socketStatus === 'connected' ? 'Point at code and press ▶ Start or 📷 Photo'
              : 'Connecting...')}
          </pre>
          {outputText && (
            <div className="ctc-guest-output-cta">
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#e2e8f0' }}>
                Sign in to copy, save, and unlock your free tier
              </p>
              <Link href={LOGIN_URL} style={s.ctaPrimary}>Sign in free →</Link>
            </div>
          )}
        </div>
      </div>

      <div style={s.footer}>
        <Link href="/" style={s.footerLink}>← Back to home</Link>
        <span style={s.footerNote}>After sign-in you start fresh with the Free plan</span>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100dvh', background: '#1a1a2e', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.75rem', background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  logo: { fontWeight: 800, fontSize: '1rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textDecoration: 'none' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  signInBtn: { color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, padding: '0.3rem 0.65rem', background: 'rgba(99,102,241,0.12)' },
  banner: { display: 'flex', alignItems: 'center', gap: 8, padding: '0.45rem 0.75rem', background: 'rgba(234,179,8,0.1)', borderBottom: '1px solid rgba(234,179,8,0.25)', fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', flexWrap: 'wrap' },
  bannerTag: { background: 'rgba(234,179,8,0.2)', color: '#fde047', borderRadius: 5, padding: '2px 7px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' },
  camWrap: { position: 'relative', width: '100%', height: 'clamp(220px, 38vh, 360px)', background: '#000', flexShrink: 0 },
  video: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  liveDot: { position: 'absolute', top: 8, left: 8, background: 'rgba(239,68,68,0.85)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700, zIndex: 11 },
  controls: { display: 'flex', gap: 10, padding: '0.55rem 0.75rem', justifyContent: 'center', flexWrap: 'wrap' },
  startBtn: { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', padding: '0.55rem 1.2rem', fontSize: '0.88rem', fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer' },
  stopBtn: { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', padding: '0.55rem 1.2rem', fontSize: '0.88rem', fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer' },
  photoBtn: { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  statusBar: { padding: '0.35rem 0.75rem', fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)', margin: 0 },
  outputWrap: { margin: '0 0.75rem 0.75rem', background: 'rgba(0,0,0,0.4)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  outputHeader: { padding: '0.45rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.76rem', color: 'rgba(255,255,255,0.45)' },
  output: { padding: '0.65rem 0.75rem', fontSize: '0.78rem', fontFamily: '"JetBrains Mono","Fira Code",Consolas,monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 'min(32vh, 280px)', overflowY: 'auto', color: '#e2e8f0', margin: 0 },
  ctaPrimary: { display: 'inline-block', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', textDecoration: 'none', borderRadius: 10, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700 },
  footer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' },
  footerLink: { color: '#818cf8', fontSize: '0.78rem', textDecoration: 'none' },
  footerNote: { fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' },
}
