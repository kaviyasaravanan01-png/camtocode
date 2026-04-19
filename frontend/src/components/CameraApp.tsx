'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { createClient } from '@/lib/supabase'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

const _LANG_EXT: Record<string, string> = {
  python: '.py', javascript: '.js', typescript: '.ts', react: '.tsx',
  nestjs: '.ts', nextjs: '.tsx', java: '.java', cpp: '.cpp', go: '.go',
  rust: '.rs', swift: '.swift', kotlin: '.kt', ruby: '.rb', php: '.php',
  sql: '.sql', css: '.css', html: '.html',
}

const LANGUAGES = [
  '', 'python', 'javascript', 'typescript', 'react', 'nestjs', 'nextjs',
  'java', 'cpp', 'go', 'rust', 'swift', 'kotlin', 'ruby', 'php', 'sql', 'css', 'html',
]

interface QualityData {
  score: number; label: string; glare: boolean; glare_pct: number
  zoom: string; zoom_msg: string; frames: number
  text?: string; language?: string; conf?: number
}
interface ResultData {
  text: string; lang: string; ai_used: boolean
  syntax_ok: boolean; syntax_err?: string; download_url?: string
}
interface StatusData { capturing?: boolean; msg: string; bulk_block?: number; bulk_session?: number }
interface SessionFixedData {
  text?: string; lang?: string; filename?: string
  blocks?: number; session?: number; download_url?: string; error?: string
}

export default function CameraApp({ userId, userEmail }: { userId: string; userEmail: string }) {
  const supabase = createClient()
  const socketRef   = useRef<Socket | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [socketStatus, setSocketStatus] = useState<'connecting'|'connected'|'error'>('connecting')
  const [debugLog,     setDebugLog]     = useState<string[]>([])
  const [showDebug,    setShowDebug]    = useState(false)
  const [capturing,    setCapturing]    = useState(false)
  const [statusMsg,    setStatusMsg]    = useState('Connecting...')
  const [liveText,     setLiveText]     = useState('')
  const [finalText,    setFinalText]    = useState('')
  const [qualityLabel, setQualityLabel] = useState('')
  const [qualityScore, setQualityScore] = useState(0)
  const [frames,       setFrames]       = useState(0)
  const [lastLang,     setLastLang]     = useState('')
  const [syntaxOk,     setSyntaxOk]     = useState<boolean | null>(null)
  const [syntaxErr,    setSyntaxErr]    = useState('')
  const [lastDownload, setLastDownload] = useState('')
  const [glareWarn,    setGlareWarn]    = useState(false)
  const [zoomMsg,      setZoomMsg]      = useState('')
  const [aiUsed,       setAiUsed]       = useState(false)
  const [videoMode,    setVideoMode]    = useState<'camera'|'screen'>('camera')
  const [fitScreen,    setFitScreen]    = useState(false)
  const [language,     setLanguage]     = useState('')
  const [aiEnabled,    setAiEnabled]    = useState(true)
  const [nightMode,    setNightMode]    = useState(false)
  const [autoCapture,  setAutoCapture]  = useState(false)
  const [autoClear,    setAutoClear]    = useState(false)
  const [llmModel,     setLlmModel]     = useState('haiku')
  const [bulkCapture,  setBulkCapture]  = useState(false)
  const [bulkBlocks,   setBulkBlocks]   = useState(0)
  const [bulkSession,  setBulkSession]  = useState(0)
  const [showExport,   setShowExport]   = useState(false)
  const [exportFilename,setExportFilename] = useState('')
  const [exportModel,  setExportModel]  = useState('haiku')
  const [exporting,    setExporting]    = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveFilename,  setSaveFilename]  = useState('')
  const [saveAiEnabled, setSaveAiEnabled] = useState(true)
  const [saveModel,     setSaveModel]     = useState('haiku')
  const [saving,        setSaving]        = useState(false)
  const [pendingText,   setPendingText]   = useState('')
  const [pendingLang,   setPendingLang]   = useState('')

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString()
    setDebugLog(prev => [`${ts} ${msg}`, ...prev].slice(0, 30))
  }, [])

  // Socket init
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      addLog('Connecting to backend...')
      const sock = io(BACKEND_URL, { transports: ['polling'], query: { token }, timeout: 20000 })
      socketRef.current = sock
      sock.on('connect', () => { setSocketStatus('connected'); setStatusMsg('Ready — press Start'); addLog('Connected: ' + sock.id) })
      sock.on('connect_error', (e) => { setSocketStatus('error'); setStatusMsg('Backend unreachable'); addLog('Error: ' + e.message) })
      sock.on('disconnect', (r) => { setSocketStatus('connecting'); setStatusMsg('Disconnected'); addLog('Disconnected: ' + r) })
      sock.on('init_state', (d: any) => {
        setAiEnabled(d.ai_enabled); setNightMode(d.night_mode)
        setAutoCapture(d.auto_capture); setAutoClear(d.auto_clear_after_export)
        setLlmModel(d.llm_model); setBulkCapture(d.bulk_capture)
        setBulkBlocks(d.bulk_session_blocks); setBulkSession(d.bulk_session_number)
        addLog('State received')
      })
      sock.on('status', (d: StatusData) => {
        setStatusMsg(d.msg); addLog('status: ' + d.msg)
        if (typeof d.capturing === 'boolean') setCapturing(d.capturing)
        if (d.bulk_block  !== undefined) setBulkBlocks(d.bulk_block)
        if (d.bulk_session !== undefined) setBulkSession(d.bulk_session)
      })
      sock.on('quality', (d: QualityData) => {
        setQualityLabel(d.label); setQualityScore(d.score)
        setFrames(d.frames); setGlareWarn(d.glare); setZoomMsg(d.zoom_msg || '')
        if (d.text) { setLiveText(d.text); if (d.language) setLastLang(d.language); addLog('frame ' + d.frames + ' got text') }
        else { addLog('frame ' + d.frames + ' ' + d.label + ' ' + d.score.toFixed(0)) }
      })
      sock.on('result', (d: ResultData) => {
        // Append to existing output so multiple scans accumulate
        setFinalText(prev => prev ? prev + '\n\n' + d.text : d.text)
        setLiveText('')
        setLastLang(d.lang); setAiUsed(d.ai_used)
        setSyntaxOk(d.syntax_ok); setSyntaxErr(d.syntax_err || '')
        if (d.download_url) setLastDownload(d.download_url)
        addLog('result: ' + d.lang + ' ai=' + d.ai_used)
        // Update suggested filename for save modal (don't auto-open)
        const ext = _LANG_EXT[d.lang] || '.txt'
        const ts = new Date().toISOString().slice(0,10).replace(/-/g,'')
        setSaveFilename(prev => prev || `${d.lang || 'code'}_${ts}${ext}`)
        setPendingLang(d.lang)
      })
      sock.on('auto_captured', () => { addLog('auto_captured'); handleStopRef.current?.() })
      sock.on('session_fixed', (d: SessionFixedData) => {
        setExporting(false); setShowExport(false)
        if (d.error) { setStatusMsg('Export error: ' + d.error); return }
        if (d.text) setFinalText(d.text)  // replace with AI-fixed version
        if (d.download_url) setLastDownload(d.download_url)
        setStatusMsg('Exported: ' + d.filename); addLog('exported: ' + d.filename)
      })
      sock.on('result_saved', (d: any) => {
        setSaving(false); setShowSaveModal(false)
        setSaveFilename(''); setPendingLang('')  // reset for next session
        if (d.error) { setStatusMsg('Save error: ' + d.error); addLog('save error: ' + d.error); return }
        if (d.download_url) setLastDownload(d.download_url)
        // Clear output after save — buffer is saved, start fresh
        setFinalText(''); setLiveText('')
        setStatusMsg('Saved: ' + d.filename + ' — output cleared for next session'); addLog('saved: ' + d.filename)
      })
      sock.on('language_set', (d: {language: string}) => setLanguage(d.language === 'auto' ? '' : d.language))
    }
    init()
    return () => { socketRef.current?.disconnect(); stopStream() }
  }, []) // eslint-disable-line

  const startCamera = useCallback(async () => {
    stopStream()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setVideoMode('camera'); addLog('Camera started')
    } catch (e: any) { addLog('Camera error: ' + e.message); setStatusMsg('Camera error: ' + e.message) }
  }, []) // eslint-disable-line

  const startScreenCapture = useCallback(async () => {
    stopStream()
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setVideoMode('screen'); setFitScreen(true); addLog('Screen capture started')
      stream.getVideoTracks()[0].addEventListener('ended', () => { setVideoMode('camera'); startCamera() })
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') addLog('Screen error: ' + e.message)
      startCamera()
    }
  }, []) // eslint-disable-line

  const stopStream = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }
  useEffect(() => { startCamera() }, [startCamera])

  const captureFrame = useCallback(() => {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas || !socketRef.current?.connected) return
    if (!video.videoWidth || !video.videoHeight) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    socketRef.current.emit('frame', { image: canvas.toDataURL('image/jpeg', 0.85) })
  }, [])

  const handleStart = useCallback(() => {
    if (!socketRef.current?.connected) { addLog('Cannot start: not connected'); return }
    addLog('Emitting start')
    socketRef.current.emit('start')
    setCapturing(true); setFrames(0); setLiveText(''); setSyntaxOk(null); setSyntaxErr('')
    intervalRef.current = setInterval(captureFrame, 500)
  }, [captureFrame]) // eslint-disable-line

  const handleStop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setCapturing(false)
    if (socketRef.current?.connected) { addLog('Emitting stop'); socketRef.current.emit('stop') }
  }, [])

  const handleStopRef = useRef(handleStop)
  useEffect(() => { handleStopRef.current = handleStop }, [handleStop])

  const handlePhoto = useCallback(() => {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas || !socketRef.current?.connected) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    addLog('Emitting photo')
    socketRef.current.emit('photo', { image: canvas.toDataURL('image/jpeg', 0.95) })
  }, [])

  const emit = (ev: string, data?: object) => socketRef.current?.emit(ev, data)
  const handleLanguageChange  = (l: string) => { setLanguage(l);    emit('set_language',    { language: l }) }
  const handleAiToggle        = () => { const n = !aiEnabled;   setAiEnabled(n);   emit('set_ai',        { enabled: n }) }
  const handleNightToggle     = () => { const n = !nightMode;   setNightMode(n);   emit('set_night',     { enabled: n }) }
  const handleAutoToggle      = () => { const n = !autoCapture; setAutoCapture(n); emit('set_auto',      { enabled: n }) }
  const handleAutoClearToggle = () => { const n = !autoClear;   setAutoClear(n);   emit('set_auto_clear',{ enabled: n }) }
  const handleModelChange     = (m: string) => { setLlmModel(m);   emit('set_model',       { model: m }) }
  const handleBulkToggle      = () => { const n = !bulkCapture; setBulkCapture(n); emit('set_bulk',      { enabled: n }) }
  const handleResetBulk       = () => { emit('reset_bulk_session'); setBulkBlocks(0) }

  const handleCopy = (text: string) => navigator.clipboard.writeText(text).then(() => setStatusMsg('Copied!'))
  const handleSaveSubmit = (withAi: boolean) => {
    setSaving(true)
    // Don't pass text — backend reads the full accumulated live_buffer.txt
    emit('save_result', { lang: pendingLang, filename: saveFilename, ai_fix: withAi, model: saveModel })
  }
  const handleExportSubmit = () => { setExporting(true); emit('fix_session_file', { filename: exportFilename, ai_fix: true, model: exportModel }) }
  const handleSignOut = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  const qColor = qualityLabel === 'sharp' ? '#22c55e' : qualityLabel === 'ok' ? '#eab308' : qualityLabel === 'blurry' ? '#ef4444' : '#888'
  const dotColor = socketStatus === 'connected' ? '#22c55e' : socketStatus === 'error' ? '#ef4444' : '#eab308'
  const outputText = finalText || liveText

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.logo}>CamToCode</span>
        <div style={s.hRight}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
          <button onClick={() => setShowDebug(d => !d)} style={s.iconBtn} title="Debug log">🪲</button>
          <a href="/history" style={s.historyLink}>History</a>
          <button onClick={() => setShowSettings(v => !v)} style={s.iconBtn}>⚙️</button>
          <button onClick={handleSignOut} style={s.signOutBtn}>Sign Out</button>
        </div>
      </div>

      {/* Debug log — on-screen console for mobile */}
      {showDebug && (
        <div style={s.debugPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: '0.72rem', color: '#a78bfa' }}>
              Debug Log — {socketStatus} — {BACKEND_URL}
            </span>
            <button onClick={() => setDebugLog([])} style={s.smallBtn}>Clear</button>
          </div>
          {debugLog.length === 0
            ? <div style={{ opacity: 0.4, fontSize: '0.68rem' }}>No events yet</div>
            : debugLog.map((l, i) => (
                <div key={i} style={{ fontSize: '0.66rem', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '2px 0', lineHeight: 1.4 }}>
                  {l}
                </div>
              ))
          }
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div style={s.settingsPanel}>
          <div style={s.row}>
            <span>Language</span>
            <select value={language} onChange={e => handleLanguageChange(e.target.value)} style={s.select}>
              <option value="">Auto Detect</option>
              {LANGUAGES.filter(Boolean).map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
            </select>
          </div>
          {([
            ['Claude AI OCR', aiEnabled,   handleAiToggle],
            ['Night Mode',    nightMode,   handleNightToggle],
            ['Auto Capture',  autoCapture, handleAutoToggle],
            ['Auto Clear',    autoClear,   handleAutoClearToggle],
            ['Bulk Capture',  bulkCapture, handleBulkToggle],
          ] as [string, boolean, () => void][]).map(([label, val, fn]) => (
            <div key={label} style={s.row}>
              <span>{label}</span>
              <label style={s.toggle}>
                <input type="checkbox" checked={val} onChange={fn} style={s.toggleInput} />
                <span style={{ ...s.toggleSlider, background: val ? '#4f46e5' : '#374151' }}>
                  <span style={{ ...s.toggleKnob, left: val ? 22 : 3 }} />
                </span>
              </label>
            </div>
          ))}
          <div style={s.row}>
            <span>LLM Model</span>
            <select value={llmModel} onChange={e => handleModelChange(e.target.value)} style={s.select}>
              <option value="haiku">Haiku (Fast)</option>
              <option value="sonnet">Sonnet (Best)</option>
            </select>
          </div>
          {bulkCapture && <>
            <div style={s.row}>
              <span>Session {bulkSession} — {bulkBlocks} blocks</span>
              <button onClick={handleResetBulk} style={s.smallBtn}>Reset</button>
            </div>
            <div style={s.row}>
              <span />
              <button onClick={() => setShowExport(true)} style={s.exportBtn}>Export Session</button>
            </div>
          </>}
        </div>
      )}

      {/* Video toolbar */}
      <div style={s.toolbar}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={videoMode === 'camera' ? startScreenCapture : startCamera} style={s.toolBtn}>
            {videoMode === 'camera' ? '🖥 Screen' : '📷 Camera'}
          </button>
          <button
            onClick={() => setFitScreen(f => !f)}
            style={{ ...s.toolBtn, background: fitScreen ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)' }}
          >
            {fitScreen ? '⊡ Fit' : '⊞ Fill'}
          </button>
        </div>
        {videoMode === 'screen' && <span style={s.modeTag}>🖥 Screen</span>}
      </div>

      {/* Video */}
      <div style={s.camWrap}>
        <video ref={videoRef} playsInline muted style={{ ...s.video, objectFit: fitScreen ? 'contain' : 'cover' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {qualityLabel && (
          <div style={{ ...s.badge, borderColor: qColor, color: qColor }}>
            {qualityLabel.toUpperCase()} {qualityScore.toFixed(0)} | {frames}f
          </div>
        )}
        {glareWarn && <div style={s.glare}>⚠ Glare</div>}
        {zoomMsg   && <div style={s.zoom}>{zoomMsg}</div>}
        {capturing && <div style={s.liveDot}>● LIVE</div>}
      </div>

      {/* Controls */}
      <div style={s.controls}>
        {!capturing ? (
          <>
            <button onClick={handleStart} disabled={socketStatus !== 'connected'}
              style={{ ...s.startBtn, opacity: socketStatus !== 'connected' ? 0.5 : 1 }}>
              ▶ Start
            </button>
            <button onClick={handlePhoto} disabled={socketStatus !== 'connected'}
              style={{ ...s.photoBtn, opacity: socketStatus !== 'connected' ? 0.5 : 1 }}>
              📷 Photo
            </button>
          </>
        ) : (
          <button onClick={handleStop} style={s.stopBtn}>⏹ Stop</button>
        )}
      </div>

      {/* Status */}
      <div style={s.statusBar}>
        <span style={{ flex: 1 }}>{statusMsg}</span>
        {lastLang  && <span style={s.langTag}>{lastLang}{aiUsed ? ' ✨' : ''}</span>}
        {syntaxOk === false && <span style={s.syntaxErr}>⚠ {syntaxErr}</span>}
        {syntaxOk === true  && <span style={s.syntaxOk}>✓ Syntax OK</span>}
      </div>

      {/* Output — always visible */}
      <div style={s.outputWrap}>
        <div style={s.outputHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {capturing && liveText
              ? <><span style={{ color: '#22c55e' }}>⬤</span> Live OCR</>
              : finalText
                ? <>
                    {(() => {
                      const blocks = finalText.split('\n\n').filter(b => b.trim()).length
                      return blocks > 1 ? `${blocks} scans` : 'Result'
                    })()}
                    {aiUsed && <span style={{ color: '#a78bfa', fontSize: '0.7rem' }}>✨ AI</span>}
                  </>
                : 'Output'
            }
            {lastLang && <span style={s.langTag}>{lastLang}</span>}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {outputText && <button onClick={() => handleCopy(outputText)} style={s.smallBtn}>Copy</button>}
            {outputText && <button onClick={() => { setFinalText(''); setLiveText('') }} style={s.smallBtn}>Clear</button>}
            {finalText && !capturing && (
              <button
                onClick={() => setShowSaveModal(true)}
                style={{ ...s.smallBtn, background: 'rgba(99,102,241,0.3)', borderColor: 'rgba(99,102,241,0.5)', color: '#a5b4fc' }}
              >
                💾 Save File
              </button>
            )}
            {lastDownload && (
              <a href={lastDownload} download style={{ textDecoration: 'none' }}>
                <button style={s.smallBtn}>↓ DL</button>
              </a>
            )}
          </div>
        </div>
        <pre style={s.output}>
          {outputText
            || (capturing ? 'Waiting for frames...'
            : socketStatus === 'connected' ? 'Press Start or Photo to capture code'
            : 'Connecting to backend...')}
        </pre>
      </div>

      {/* Save File Modal — opened via 💾 Save File button */}
      {showSaveModal && (
        <div style={s.backdrop} onClick={() => !saving && setShowSaveModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Save Result</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', marginBottom: '1rem' }}>
              Saves all scans captured so far{pendingLang ? ` · ${pendingLang}` : ''}
            </p>
            <input
              type="text"
              placeholder="Filename"
              value={saveFilename}
              onChange={e => setSaveFilename(e.target.value)}
              style={{ ...s.input, width: '100%', marginBottom: '0.75rem', boxSizing: 'border-box' }}
            />
            <div style={s.row}>
              <span style={{ fontSize: '0.85rem' }}>AI Fix with Claude</span>
              <label style={s.toggle}>
                <input type="checkbox" checked={saveAiEnabled} onChange={() => setSaveAiEnabled(v => !v)} style={s.toggleInput} />
                <span style={{ ...s.toggleSlider, background: saveAiEnabled ? '#4f46e5' : '#374151' }}>
                  <span style={{ ...s.toggleKnob, left: saveAiEnabled ? 22 : 3 }} />
                </span>
              </label>
            </div>
            {saveAiEnabled && (
              <div style={{ ...s.row, marginTop: 8 }}>
                <span style={{ fontSize: '0.85rem' }}>Model</span>
                <select value={saveModel} onChange={e => setSaveModel(e.target.value)} style={s.select}>
                  <option value="haiku">Haiku (Fast)</option>
                  <option value="sonnet">Sonnet (Best)</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button onClick={() => setShowSaveModal(false)} style={s.cancelBtn} disabled={saving}>Skip</button>
              <button onClick={() => handleSaveSubmit(saveAiEnabled)} style={s.exportBtn} disabled={saving}>
                {saving ? 'Saving...' : 'Save to History'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <div style={s.backdrop} onClick={() => !exporting && setShowExport(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Export Session</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Session {bulkSession} · {bulkBlocks} blocks
            </p>
            <input type="text" placeholder="Filename (optional)" value={exportFilename}
              onChange={e => setExportFilename(e.target.value)}
              style={{ ...s.input, width: '100%', marginBottom: '0.75rem' }} />
            <div style={s.row}>
              <span>Model</span>
              <select value={exportModel} onChange={e => setExportModel(e.target.value)} style={s.select}>
                <option value="haiku">Haiku (Fast)</option>
                <option value="sonnet">Sonnet (Best)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button onClick={() => setShowExport(false)} style={s.cancelBtn} disabled={exporting}>Cancel</button>
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

const s: Record<string, React.CSSProperties> = {
  root:         { minHeight: '100vh', background: '#1a1a2e', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  logo:         { fontWeight: 800, fontSize: '1.1rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  hRight:       { display: 'flex', alignItems: 'center', gap: 8 },
  historyLink:  { color: '#818cf8', fontSize: '0.8rem', textDecoration: 'none' },
  iconBtn:      { background: 'transparent', border: 'none', fontSize: '1.1rem', padding: '0.25rem', cursor: 'pointer' },
  signOutBtn:   { background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' },
  debugPanel:   { background: '#0a0a1a', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.5rem 0.75rem', maxHeight: 200, overflowY: 'auto' },
  settingsPanel:{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: 10 },
  row:          { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' },
  select:       { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '0.3rem 0.5rem', fontSize: '0.8rem' },
  toggle:       { position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' },
  toggleInput:  { position: 'absolute', opacity: 0, width: 0, height: 0 },
  toggleSlider: { position: 'absolute', inset: 0, borderRadius: 12, transition: 'background 0.3s' },
  toggleKnob:   { position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' },
  toolbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  toolBtn:      { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '0.25rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer' },
  modeTag:      { background: 'rgba(99,102,241,0.25)', color: '#818cf8', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem' },
  camWrap:      { position: 'relative', flex: '1 0 auto', maxHeight: '40vh', background: '#000', overflow: 'hidden' },
  video:        { width: '100%', height: '100%' },
  badge:        { position: 'absolute', top: 8, right: 8, border: '1px solid', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', background: 'rgba(0,0,0,0.65)', fontFamily: 'monospace' },
  glare:        { position: 'absolute', bottom: 8, left: 8, background: 'rgba(234,179,8,0.9)', color: '#000', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 },
  zoom:         { position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.75)', color: '#fbbf24', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem' },
  liveDot:      { position: 'absolute', top: 8, left: 8, background: 'rgba(239,68,68,0.85)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700 },
  controls:     { display: 'flex', gap: 10, padding: '0.6rem 1rem', justifyContent: 'center' },
  startBtn:     { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', padding: '0.7rem 2rem', fontSize: '0.95rem', fontWeight: 700, borderRadius: 50, minWidth: 120, cursor: 'pointer', border: 'none' },
  stopBtn:      { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', padding: '0.7rem 2rem', fontSize: '0.95rem', fontWeight: 700, borderRadius: 50, minWidth: 120, cursor: 'pointer', border: 'none' },
  photoBtn:     { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 50, padding: '0.7rem 1.2rem', fontWeight: 600, cursor: 'pointer' },
  statusBar:    { padding: '0.4rem 1rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.3)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  langTag:      { background: 'rgba(99,102,241,0.25)', color: '#818cf8', borderRadius: 4, padding: '1px 6px', fontSize: '0.72rem' },
  syntaxErr:    { color: '#fca5a5', fontSize: '0.72rem' },
  syntaxOk:     { color: '#86efac', fontSize: '0.72rem' },
  outputWrap:   { margin: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.4)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' },
  outputHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' },
  output:       { padding: '0.6rem 0.75rem', fontSize: '0.78rem', fontFamily: '"JetBrains Mono","Fira Code",Consolas,monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 250, overflowY: 'auto', color: '#e2e8f0', margin: 0 },
  smallBtn:     { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0', borderRadius: 7, padding: '0.2rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' },
  exportBtn:    { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', borderRadius: 8, padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: 'none' },
  cancelBtn:    { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '0.35rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer' },
  input:        { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', padding: '0.55rem 0.75rem', fontSize: '0.875rem', boxSizing: 'border-box' },
  backdrop:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:        { background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400 },
}
