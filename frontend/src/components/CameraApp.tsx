'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { createClient } from '@/lib/supabase'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

const LANGUAGES = [
  '', 'python', 'javascript', 'typescript', 'react', 'nestjs', 'nextjs',
  'java', 'cpp', 'go', 'rust', 'swift', 'kotlin', 'ruby', 'php', 'sql', 'css', 'html',
]

interface QualityData {
  score: number
  label: string
  glare: boolean
  glare_pct: number
  zoom: string
  zoom_msg: string
  frames: number
  text?: string
  language?: string
  conf?: number
  heatmap?: Array<{w: string, c: number}>
}

interface ResultData {
  text: string
  lang: string
  ai_used: boolean
  syntax_ok: boolean
  syntax_err?: string
  download_url?: string
}

interface StatusData {
  capturing?: boolean
  msg: string
  bulk_block?: number
  bulk_session?: number
}

interface SessionFixedData {
  text?: string
  lang?: string
  filename?: string
  blocks?: number
  session?: number
  download_url?: string
  error?: string
}

export default function CameraApp({ userId, userEmail }: { userId: string; userEmail: string }) {
  const supabase = createClient()

  // Socket
  const socketRef  = useRef<Socket | null>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // UI state
  const [capturing,     setCapturing]     = useState(false)
  const [statusMsg,     setStatusMsg]     = useState('Ready')
  const [outputText,    setOutputText]    = useState('')
  const [qualityLabel,  setQualityLabel]  = useState('')
  const [qualityScore,  setQualityScore]  = useState(0)
  const [frames,        setFrames]        = useState(0)
  const [lastLang,      setLastLang]      = useState('')
  const [syntaxOk,      setSyntaxOk]      = useState<boolean | null>(null)
  const [syntaxErr,     setSyntaxErr]     = useState('')
  const [lastDownload,  setLastDownload]  = useState('')

  // Settings
  const [language,      setLanguage]      = useState('')
  const [aiEnabled,     setAiEnabled]     = useState(true)
  const [nightMode,     setNightMode]     = useState(false)
  const [autoCapture,   setAutoCapture]   = useState(false)
  const [autoClear,     setAutoClear]     = useState(false)
  const [llmModel,      setLlmModel]      = useState('haiku')
  const [bulkCapture,   setBulkCapture]   = useState(false)
  const [bulkBlocks,    setBulkBlocks]    = useState(0)
  const [bulkSession,   setBulkSession]   = useState(0)

  // Export modal
  const [showExport,    setShowExport]    = useState(false)
  const [exportFilename,setExportFilename]= useState('')
  const [exportModel,   setExportModel]   = useState('haiku')
  const [exporting,     setExporting]     = useState(false)

  // Settings panel
  const [showSettings,  setShowSettings]  = useState(false)

  // ─── Init socket ─────────────────────────────────────────────────────────
  useEffect(() => {
    const initSocket = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''

      const sock = io(BACKEND_URL, {
        transports: ['polling'],
        query: { token },
      })
      socketRef.current = sock

      sock.on('init_state', (data: any) => {
        setAiEnabled(data.ai_enabled)
        setNightMode(data.night_mode)
        setAutoCapture(data.auto_capture)
        setAutoClear(data.auto_clear_after_export)
        setLlmModel(data.llm_model)
        setBulkCapture(data.bulk_capture)
        setBulkBlocks(data.bulk_session_blocks)
        setBulkSession(data.bulk_session_number)
      })

      sock.on('status', (data: StatusData) => {
        setStatusMsg(data.msg)
        if (typeof data.capturing === 'boolean') setCapturing(data.capturing)
        if (data.bulk_block !== undefined) setBulkBlocks(data.bulk_block)
        if (data.bulk_session !== undefined) setBulkSession(data.bulk_session)
      })

      sock.on('quality', (data: QualityData) => {
        setQualityLabel(data.label)
        setQualityScore(data.score)
        setFrames(data.frames)
        if (data.text) {
          setOutputText(prev => data.text!)
          if (data.language) setLastLang(data.language)
        }
      })

      sock.on('result', (data: ResultData) => {
        setOutputText(data.text)
        setLastLang(data.lang)
        setSyntaxOk(data.syntax_ok)
        setSyntaxErr(data.syntax_err || '')
        if (data.download_url) setLastDownload(data.download_url)
      })

      sock.on('auto_captured', () => {
        handleStop()
      })

      sock.on('session_fixed', (data: SessionFixedData) => {
        setExporting(false)
        setShowExport(false)
        if (data.error) {
          setStatusMsg('Export error: ' + data.error)
          return
        }
        if (data.text) setOutputText(data.text)
        if (data.download_url) setLastDownload(data.download_url)
        setStatusMsg(`Session ${data.session} exported as ${data.filename}`)
      })

      sock.on('language_set', (data: {language: string}) => {
        setLanguage(data.language === 'auto' ? '' : data.language)
      })
    }

    initSocket()

    return () => {
      socketRef.current?.disconnect()
      stopCamera()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Camera init ─────────────────────────────────────────────────────────
  const initCamera = useCallback(async () => {
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
      setStatusMsg('Camera ready — point at code and press Start')
    } catch (e: any) {
      setStatusMsg('Camera error: ' + e.message)
    }
  }, [])

  useEffect(() => {
    initCamera()
  }, [initCamera])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  // ─── Capture helpers ─────────────────────────────────────────────────────
  const captureFrame = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !socketRef.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    socketRef.current.emit('frame', { image: dataUrl })
  }, [])

  const handleStart = useCallback(() => {
    if (!socketRef.current) return
    socketRef.current.emit('start')
    setCapturing(true)
    setFrames(0)
    setSyntaxOk(null)
    setSyntaxErr('')
    intervalRef.current = setInterval(captureFrame, 400)
  }, [captureFrame])

  const handleStop = useCallback(() => {
    if (!socketRef.current) return
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setCapturing(false)
    socketRef.current.emit('stop')
  }, [])

  const handlePhoto = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !socketRef.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
    socketRef.current.emit('photo', { image: dataUrl })
  }, [])

  // ─── Settings emitters ───────────────────────────────────────────────────
  const emit = (event: string, data?: object) => socketRef.current?.emit(event, data)

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    emit('set_language', { language: lang })
  }

  const handleAiToggle = () => {
    const next = !aiEnabled
    setAiEnabled(next)
    emit('set_ai', { enabled: next })
  }

  const handleNightToggle = () => {
    const next = !nightMode
    setNightMode(next)
    emit('set_night', { enabled: next })
  }

  const handleAutoToggle = () => {
    const next = !autoCapture
    setAutoCapture(next)
    emit('set_auto', { enabled: next })
  }

  const handleAutoClearToggle = () => {
    const next = !autoClear
    setAutoClear(next)
    emit('set_auto_clear', { enabled: next })
  }

  const handleModelChange = (model: string) => {
    setLlmModel(model)
    emit('set_model', { model })
  }

  const handleBulkToggle = () => {
    const next = !bulkCapture
    setBulkCapture(next)
    emit('set_bulk', { enabled: next })
  }

  const handleResetBulk = () => {
    emit('reset_bulk_session')
    setBulkBlocks(0)
  }

  // ─── Copy ────────────────────────────────────────────────────────────────
  const handleCopy = () => {
    if (!outputText) return
    navigator.clipboard.writeText(outputText).then(() => setStatusMsg('Copied to clipboard!'))
  }

  // ─── Export ──────────────────────────────────────────────────────────────
  const handleExportSubmit = () => {
    setExporting(true)
    emit('fix_session_file', {
      filename: exportFilename,
      ai_fix:   true,
      model:    exportModel,
    })
  }

  // ─── Sign out ────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  // ─── Quality color ───────────────────────────────────────────────────────
  const qualityColor = qualityLabel === 'sharp' ? '#22c55e'
    : qualityLabel === 'ok'    ? '#eab308'
    : qualityLabel === 'blurry'? '#ef4444'
    : '#888'

  return (
    <div style={s.root}>
      {/* ── Header ─────────────────────────────────── */}
      <div style={s.header}>
        <span style={s.logoText}>CamToCode</span>
        <div style={s.headerRight}>
          <a href="/history" style={s.historyLink}>History</a>
          <button onClick={() => setShowSettings(!showSettings)} style={s.iconBtn}>
            ⚙️
          </button>
          <button onClick={handleSignOut} style={s.signOutBtn}>Sign Out</button>
        </div>
      </div>

      {/* ── Settings Panel ────────────────────────── */}
      {showSettings && (
        <div style={s.settingsPanel}>
          <div style={s.settingsRow}>
            <span>Language</span>
            <select value={language} onChange={e => handleLanguageChange(e.target.value)} style={s.select}>
              <option value="">Auto Detect</option>
              {LANGUAGES.filter(Boolean).map(l => (
                <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </div>
          <div style={s.settingsRow}>
            <span>Claude AI OCR</span>
            <label style={s.toggle}>
              <input type="checkbox" checked={aiEnabled} onChange={handleAiToggle} />
              <span style={s.toggleSlider} />
            </label>
          </div>
          <div style={s.settingsRow}>
            <span>Night Mode</span>
            <label style={s.toggle}>
              <input type="checkbox" checked={nightMode} onChange={handleNightToggle} />
              <span style={s.toggleSlider} />
            </label>
          </div>
          <div style={s.settingsRow}>
            <span>Auto Capture</span>
            <label style={s.toggle}>
              <input type="checkbox" checked={autoCapture} onChange={handleAutoToggle} />
              <span style={s.toggleSlider} />
            </label>
          </div>
          <div style={s.settingsRow}>
            <span>Auto Clear After Export</span>
            <label style={s.toggle}>
              <input type="checkbox" checked={autoClear} onChange={handleAutoClearToggle} />
              <span style={s.toggleSlider} />
            </label>
          </div>
          <div style={s.settingsRow}>
            <span>LLM Model</span>
            <select value={llmModel} onChange={e => handleModelChange(e.target.value)} style={s.select}>
              <option value="haiku">Haiku (Fast)</option>
              <option value="sonnet">Sonnet (Best)</option>
            </select>
          </div>
          <div style={s.settingsRow}>
            <span>Bulk Capture</span>
            <label style={s.toggle}>
              <input type="checkbox" checked={bulkCapture} onChange={handleBulkToggle} />
              <span style={s.toggleSlider} />
            </label>
          </div>
          {bulkCapture && (
            <div style={s.settingsRow}>
              <span>Session {bulkSession} — {bulkBlocks} blocks</span>
              <button onClick={handleResetBulk} style={s.smallBtn}>Reset</button>
            </div>
          )}
          {bulkCapture && (
            <div style={s.settingsRow}>
              <span>&nbsp;</span>
              <button onClick={() => setShowExport(true)} style={s.exportBtn}>
                Export Session
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Camera ────────────────────────────────── */}
      <div style={s.cameraWrap}>
        <video ref={videoRef} playsInline muted style={s.video} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {qualityLabel && (
          <div style={{ ...s.qualityBadge, borderColor: qualityColor, color: qualityColor }}>
            {qualityLabel.toUpperCase()} {qualityScore.toFixed(0)} | {frames} frames
          </div>
        )}
      </div>

      {/* ── Controls ──────────────────────────────── */}
      <div style={s.controls}>
        {!capturing ? (
          <>
            <button onClick={handleStart} style={s.startBtn}>Start</button>
            <button onClick={handlePhoto} style={s.photoBtn}>📷 Photo</button>
          </>
        ) : (
          <button onClick={handleStop} style={s.stopBtn}>Stop</button>
        )}
      </div>

      {/* ── Status ────────────────────────────────── */}
      <div style={s.statusBar}>
        {statusMsg}
        {lastLang && <span style={s.langTag}>{lastLang}</span>}
        {syntaxOk === false && <span style={s.syntaxError}>⚠ {syntaxErr}</span>}
        {syntaxOk === true  && <span style={s.syntaxOk}>✓ Syntax OK</span>}
      </div>

      {/* ── Output ────────────────────────────────── */}
      {outputText && (
        <div style={s.outputWrap}>
          <div style={s.outputHeader}>
            <span>Output</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCopy} style={s.smallBtn}>Copy</button>
              {lastDownload && (
                <a href={lastDownload} download style={s.downloadLink}>
                  <button style={s.smallBtn}>Download</button>
                </a>
              )}
            </div>
          </div>
          <pre style={s.output}>{outputText}</pre>
        </div>
      )}

      {/* ── Export Modal ──────────────────────────── */}
      {showExport && (
        <div style={s.modalBackdrop} onClick={() => !exporting && setShowExport(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Export Session</h3>
            <p style={s.modalNote}>
              Session {bulkSession} · {bulkBlocks} block{bulkBlocks !== 1 ? 's' : ''}
            </p>
            <input
              type="text"
              placeholder="Filename (optional)"
              value={exportFilename}
              onChange={e => setExportFilename(e.target.value)}
              style={{ ...s.input, width: '100%', marginBottom: '0.75rem' }}
            />
            <div style={s.settingsRow}>
              <span>Model</span>
              <select value={exportModel} onChange={e => setExportModel(e.target.value)} style={s.select}>
                <option value="haiku">Haiku (Fast)</option>
                <option value="sonnet">Sonnet (Best quality)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button onClick={() => setShowExport(false)} style={s.cancelBtn} disabled={exporting}>
                Cancel
              </button>
              <button onClick={handleExportSubmit} style={s.exportBtn} disabled={exporting}>
                {exporting ? 'Exporting...' : 'Export & Fix with Claude'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#1a1a2e',
    color: '#e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    background: 'rgba(0,0,0,0.3)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  logoText: {
    fontWeight: 800,
    fontSize: '1.2rem',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  historyLink: { color: '#818cf8', fontSize: '0.875rem' },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '1.2rem',
    padding: '0.3rem',
    cursor: 'pointer',
    borderRadius: '50%',
  },
  signOutBtn: {
    background: 'rgba(239,68,68,0.2)',
    color: '#fca5a5',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    padding: '0.35rem 0.75rem',
    fontSize: '0.8rem',
  },
  settingsPanel: {
    background: 'rgba(0,0,0,0.4)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    padding: '0.75rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  settingsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
  },
  select: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#e2e8f0',
    padding: '0.3rem 0.5rem',
    fontSize: '0.8rem',
  },
  toggle: {
    position: 'relative',
    display: 'inline-block',
    width: 44,
    height: 24,
    cursor: 'pointer',
  },
  toggleSlider: {
    position: 'absolute',
    inset: 0,
    borderRadius: 12,
    background: '#374151',
    transition: '0.3s',
  },
  cameraWrap: {
    position: 'relative',
    flex: '1 0 auto',
    maxHeight: '50vh',
    background: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  qualityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    border: '1px solid',
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: '0.7rem',
    background: 'rgba(0,0,0,0.6)',
    fontFamily: 'monospace',
  },
  controls: {
    display: 'flex',
    gap: 12,
    padding: '0.75rem 1rem',
    justifyContent: 'center',
  },
  startBtn: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    padding: '0.75rem 2.5rem',
    fontSize: '1rem',
    fontWeight: 700,
    borderRadius: 50,
    minWidth: 120,
  },
  stopBtn: {
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
    color: '#fff',
    padding: '0.75rem 2.5rem',
    fontSize: '1rem',
    fontWeight: 700,
    borderRadius: 50,
    minWidth: 120,
  },
  photoBtn: {
    background: 'rgba(255,255,255,0.08)',
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 50,
    padding: '0.75rem 1.5rem',
    fontWeight: 600,
  },
  statusBar: {
    padding: '0.5rem 1rem',
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.6)',
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  langTag: {
    background: 'rgba(99,102,241,0.25)',
    color: '#818cf8',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: '0.75rem',
  },
  syntaxError: { color: '#fca5a5', fontSize: '0.75rem' },
  syntaxOk:    { color: '#86efac', fontSize: '0.75rem' },
  outputWrap: {
    margin: '0.75rem 1rem',
    background: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  outputHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.5)',
  },
  output: {
    padding: '0.75rem',
    fontSize: '0.8rem',
    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: 300,
    overflowY: 'auto',
    color: '#e2e8f0',
  },
  smallBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#e2e8f0',
    borderRadius: 8,
    padding: '0.25rem 0.75rem',
    fontSize: '0.8rem',
  },
  exportBtn: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    borderRadius: 8,
    padding: '0.35rem 0.9rem',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  cancelBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0',
    borderRadius: 8,
    padding: '0.35rem 0.9rem',
    fontSize: '0.8rem',
  },
  downloadLink: { textDecoration: 'none' },
  input: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    padding: '0.6rem 0.75rem',
    fontSize: '0.875rem',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modal: {
    background: '#1e1e3a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: '1.5rem',
    width: '100%',
    maxWidth: 400,
  },
  modalNote: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.8rem',
    marginBottom: '1rem',
  },
}
