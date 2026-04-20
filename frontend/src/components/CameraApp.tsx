'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { createClient } from '@/lib/supabase'
import UsageBadge, { type PlanUsage } from './UsageBadge'
import PayButton from './PayButton'

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

const ROI_PRESETS = [
  { label: 'Top ½',    roi: { x1: 0,    y1: 0,    x2: 1,    y2: 0.5  } },
  { label: 'Bottom ½', roi: { x1: 0,    y1: 0.5,  x2: 1,    y2: 1    } },
  { label: 'Left ½',   roi: { x1: 0,    y1: 0,    x2: 0.5,  y2: 1    } },
  { label: 'Right ½',  roi: { x1: 0.5,  y1: 0,    x2: 1,    y2: 1    } },
  { label: 'Code Area',roi: { x1: 0.02, y1: 0.08, x2: 0.98, y2: 0.92 } },
  { label: 'Center',   roi: { x1: 0.05, y1: 0.12, x2: 0.95, y2: 0.88 } },
]

// Handle indices: 0=NW 1=N 2=NE 3=E 4=SE 5=S 6=SW 7=W
const HANDLE_CURSORS = ['nw-resize','n-resize','ne-resize','e-resize','se-resize','s-resize','sw-resize','w-resize']

type ROI = { x1: number; y1: number; x2: number; y2: number }

function getVideoBounds(video: HTMLVideoElement, wrap: HTMLElement) {
  const cw = wrap.offsetWidth, ch = wrap.offsetHeight
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw || !vh) return { x: 0, y: 0, w: cw, h: ch }
  const scale = Math.min(cw / vw, ch / vh)
  const w = vw * scale, h = vh * scale
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }

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

  // Core refs
  const socketRef    = useRef<Socket | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const videoRef     = useRef<HTMLVideoElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const camWrapRef   = useRef<HTMLDivElement>(null)
  const roiCanvasRef = useRef<HTMLCanvasElement>(null)

  // ROI interaction refs (avoid stale closures in event handlers)
  const roiRef       = useRef<ROI | null>(null)
  const roiInterRef  = useRef<'idle' | 'draw' | 'move' | 'resize'>('idle')
  const roiDragRef   = useRef<{ px: number; py: number; nx: number; ny: number } | null>(null)
  const roiAtStartRef= useRef<ROI | null>(null)
  const roiHandleRef = useRef<number>(-1)
  const showRoiRef   = useRef(false)

  // UI state
  const [socketStatus, setSocketStatus] = useState<'connecting'|'connected'|'error'>('connecting')
  const [debugLog,     setDebugLog]     = useState<string[]>([])
  const [showDebug,    setShowDebug]    = useState(false)
  const [capturing,    setCapturing]    = useState(false)
  const [statusMsg,    setStatusMsg]    = useState('Connecting...')
  const [liveText,     setLiveText]     = useState('')
  const [finalText,    setFinalText]    = useState('')
  const [scanCount,    setScanCount]    = useState(0)
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
  const [pendingLang,   setPendingLang]   = useState('')
  // ROI state
  const [roi,     setRoi]     = useState<ROI | null>(null)
  const [showRoi, setShowRoi] = useState(false)
  // Plan / usage
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null)
  const [limitMsg,  setLimitMsg]  = useState('')

  // Keep refs in sync with state
  useEffect(() => { roiRef.current = roi }, [roi])
  useEffect(() => { showRoiRef.current = showRoi }, [showRoi])

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString()
    setDebugLog(prev => [`${ts} ${msg}`, ...prev].slice(0, 30))
  }, [])

  // ── ROI canvas drawing ──────────────────────────────────────────────────────
  const drawRoiOverlay = useCallback(() => {
    const canvas = roiCanvasRef.current
    const video  = videoRef.current
    const wrap   = camWrapRef.current
    if (!canvas || !video || !wrap) return
    canvas.width  = wrap.offsetWidth
    canvas.height = wrap.offsetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const r = roiRef.current
    if (!r) return

    const b    = getVideoBounds(video, wrap)
    const rx1  = b.x + r.x1 * b.w
    const ry1  = b.y + r.y1 * b.h
    const rx2  = b.x + r.x2 * b.w
    const ry2  = b.y + r.y2 * b.h
    const rw   = rx2 - rx1
    const rh   = ry2 - ry1

    // Dim outside selection
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.clearRect(rx1, ry1, rw, rh)

    // Border
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth   = 2
    ctx.strokeRect(rx1, ry1, rw, rh)

    // Grid thirds
    ctx.strokeStyle = 'rgba(129,140,248,0.25)'
    ctx.lineWidth   = 1
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(rx1 + rw * i / 3, ry1); ctx.lineTo(rx1 + rw * i / 3, ry2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(rx1, ry1 + rh * i / 3); ctx.lineTo(rx2, ry1 + rh * i / 3); ctx.stroke()
    }

    // Resize handles
    const handles = [
      [rx1, ry1], [rx1 + rw / 2, ry1], [rx2, ry1],
      [rx2, ry1 + rh / 2],
      [rx2, ry2], [rx1 + rw / 2, ry2], [rx1, ry2],
      [rx1, ry1 + rh / 2],
    ]
    for (const [hx, hy] of handles) {
      ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'; ctx.fill()
      ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.5; ctx.stroke()
    }

    // Label
    const label = `${Math.round((r.x2 - r.x1) * 100)}% × ${Math.round((r.y2 - r.y1) * 100)}%`
    ctx.font = 'bold 11px monospace'
    const lx = rx1 + 4
    const ly = ry1 < 18 ? ry1 + rh - 6 : ry1 - 5
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    const tw = ctx.measureText(label).width
    ctx.fillRect(lx - 2, ly - 11, tw + 4, 14)
    ctx.fillStyle = '#c7d2fe'
    ctx.fillText(label, lx, ly)
  }, [])

  // Redraw overlay when roi or showRoi changes
  useEffect(() => {
    if (showRoi) drawRoiOverlay()
    else {
      const canvas = roiCanvasRef.current
      if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height) }
    }
  }, [roi, showRoi, drawRoiOverlay])

  // ── ROI canvas pointer events ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = roiCanvasRef.current
    if (!canvas) return

    function getCanvasPos(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      return { px: e.clientX - rect.left, py: e.clientY - rect.top }
    }

    function canvasToNorm(px: number, py: number): { nx: number; ny: number } {
      const video = videoRef.current, wrap = camWrapRef.current
      if (!video || !wrap) return { nx: 0, ny: 0 }
      const b = getVideoBounds(video, wrap)
      return { nx: clamp01((px - b.x) / b.w), ny: clamp01((py - b.y) / b.h) }
    }

    function getHandles(r: ROI, b: { x: number; y: number; w: number; h: number }) {
      const rx1 = b.x + r.x1 * b.w, ry1 = b.y + r.y1 * b.h
      const rx2 = b.x + r.x2 * b.w, ry2 = b.y + r.y2 * b.h
      return [
        [rx1, ry1], [rx1 + (rx2-rx1)/2, ry1], [rx2, ry1],
        [rx2, ry1 + (ry2-ry1)/2],
        [rx2, ry2], [rx1 + (rx2-rx1)/2, ry2], [rx1, ry2],
        [rx1, ry1 + (ry2-ry1)/2],
      ]
    }

    function hitHandle(px: number, py: number, r: ROI): number {
      const video = videoRef.current, wrap = camWrapRef.current
      if (!video || !wrap) return -1
      const b = getVideoBounds(video, wrap)
      const handles = getHandles(r, b)
      for (let i = 0; i < handles.length; i++) {
        if (Math.hypot(px - handles[i][0], py - handles[i][1]) < 12) return i
      }
      return -1
    }

    function insideRoi(px: number, py: number, r: ROI): boolean {
      const video = videoRef.current, wrap = camWrapRef.current
      if (!video || !wrap) return false
      const b = getVideoBounds(video, wrap)
      return px >= b.x + r.x1 * b.w && px <= b.x + r.x2 * b.w &&
             py >= b.y + r.y1 * b.h && py <= b.y + r.y2 * b.h
    }

    function onPointerDown(e: PointerEvent) {
      if (!showRoiRef.current) return
      canvas!.setPointerCapture(e.pointerId)
      const { px, py } = getCanvasPos(e)
      const r = roiRef.current

      if (r) {
        const h = hitHandle(px, py, r)
        if (h !== -1) {
          roiInterRef.current  = 'resize'
          roiHandleRef.current = h
          roiDragRef.current   = { px, py, ...canvasToNorm(px, py) }
          roiAtStartRef.current = { ...r }
          canvas!.style.cursor = HANDLE_CURSORS[h]
          return
        }
        if (insideRoi(px, py, r)) {
          roiInterRef.current  = 'move'
          roiDragRef.current   = { px, py, ...canvasToNorm(px, py) }
          roiAtStartRef.current = { ...r }
          canvas!.style.cursor = 'move'
          return
        }
      }
      // Start new draw
      const norm = canvasToNorm(px, py)
      roiInterRef.current   = 'draw'
      roiDragRef.current    = { px, py, nx: norm.nx, ny: norm.ny }
      roiAtStartRef.current = null
      const newRoi = { x1: norm.nx, y1: norm.ny, x2: norm.nx, y2: norm.ny }
      roiRef.current = newRoi
      setRoi(newRoi)
    }

    function onPointerMove(e: PointerEvent) {
      if (!showRoiRef.current) return
      const { px, py } = getCanvasPos(e)
      const inter = roiInterRef.current
      const drag  = roiDragRef.current
      const start = roiAtStartRef.current

      // Update cursor when idle
      if (inter === 'idle') {
        const r = roiRef.current
        if (r) {
          const h = hitHandle(px, py, r)
          if (h !== -1) { canvas!.style.cursor = HANDLE_CURSORS[h]; return }
          if (insideRoi(px, py, r)) { canvas!.style.cursor = 'move'; return }
        }
        canvas!.style.cursor = 'crosshair'
        return
      }

      if (!drag) return
      const norm = canvasToNorm(px, py)

      if (inter === 'draw') {
        const newRoi: ROI = {
          x1: Math.min(drag.nx, norm.nx), y1: Math.min(drag.ny, norm.ny),
          x2: Math.max(drag.nx, norm.nx), y2: Math.max(drag.ny, norm.ny),
        }
        roiRef.current = newRoi
        setRoi(newRoi)
        drawRoiOverlay()
        return
      }

      if (inter === 'move' && start) {
        const dx = norm.nx - drag.nx, dy = norm.ny - drag.ny
        const newRoi: ROI = {
          x1: clamp01(start.x1 + dx), y1: clamp01(start.y1 + dy),
          x2: clamp01(start.x2 + dx), y2: clamp01(start.y2 + dy),
        }
        roiRef.current = newRoi
        setRoi(newRoi)
        drawRoiOverlay()
        return
      }

      if (inter === 'resize' && start) {
        const h = roiHandleRef.current
        const r = { ...start }
        if (h === 0) { r.x1 = norm.nx; r.y1 = norm.ny }
        else if (h === 1) { r.y1 = norm.ny }
        else if (h === 2) { r.x2 = norm.nx; r.y1 = norm.ny }
        else if (h === 3) { r.x2 = norm.nx }
        else if (h === 4) { r.x2 = norm.nx; r.y2 = norm.ny }
        else if (h === 5) { r.y2 = norm.ny }
        else if (h === 6) { r.x1 = norm.nx; r.y2 = norm.ny }
        else if (h === 7) { r.x1 = norm.nx }
        const newRoi: ROI = {
          x1: clamp01(Math.min(r.x1, r.x2)), y1: clamp01(Math.min(r.y1, r.y2)),
          x2: clamp01(Math.max(r.x1, r.x2)), y2: clamp01(Math.max(r.y1, r.y2)),
        }
        roiRef.current = newRoi
        setRoi(newRoi)
        drawRoiOverlay()
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (!showRoiRef.current) return
      const inter = roiInterRef.current
      roiInterRef.current = 'idle'
      roiDragRef.current  = null
      canvas!.style.cursor = 'crosshair'

      // Discard tiny accidental draws
      if (inter === 'draw') {
        const r = roiRef.current
        if (r && (r.x2 - r.x1) < 0.02 && (r.y2 - r.y1) < 0.02) {
          roiRef.current = null
          setRoi(null)
          const ctx = canvas!.getContext('2d')
          ctx?.clearRect(0, 0, canvas!.width, canvas!.height)
        }
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup',   onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup',   onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [drawRoiOverlay])

  // Resize observer — redraw ROI when container resizes
  useEffect(() => {
    const wrap = camWrapRef.current
    if (!wrap) return
    const obs = new ResizeObserver(() => { if (showRoiRef.current) drawRoiOverlay() })
    obs.observe(wrap)
    return () => obs.disconnect()
  }, [drawRoiOverlay])

  // ── Socket init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      addLog('Connecting to backend...')
      const sock = io(BACKEND_URL, { transports: ['polling'], query: { token }, timeout: 20000 })
      socketRef.current = sock

      sock.on('connect',       () => { setSocketStatus('connected'); setStatusMsg('Ready — press Start'); addLog('Connected: ' + sock.id) })
      sock.on('connect_error', (e) => { setSocketStatus('error');     setStatusMsg('Backend unreachable'); addLog('Error: ' + e.message) })
      sock.on('disconnect',    (r) => { setSocketStatus('connecting'); setStatusMsg('Disconnected');       addLog('Disconnected: ' + r) })

      sock.on('init_state', (d: any) => {
        setAiEnabled(d.ai_enabled); setNightMode(d.night_mode)
        setAutoCapture(d.auto_capture); setAutoClear(d.auto_clear_after_export)
        setLlmModel(d.llm_model); setBulkCapture(d.bulk_capture)
        setBulkBlocks(d.bulk_session_blocks); setBulkSession(d.bulk_session_number)
        if (d.plan_usage) setPlanUsage(d.plan_usage)
        addLog('State received')
      })

      sock.on('status', (d: StatusData) => {
        setStatusMsg(d.msg); addLog('status: ' + d.msg)
        if (typeof d.capturing === 'boolean') setCapturing(d.capturing)
        if (d.bulk_block  !== undefined) setBulkBlocks(d.bulk_block)
        if (d.bulk_session !== undefined) setBulkSession(d.bulk_session)
        if ((d as any).limit_hit) setLimitMsg(d.msg)
        if ((d as any).plan_usage) setPlanUsage((d as any).plan_usage)
      })

      sock.on('quality', (d: QualityData) => {
        setQualityLabel(d.label); setQualityScore(d.score)
        setFrames(d.frames); setGlareWarn(d.glare); setZoomMsg(d.zoom_msg || '')
        if (d.text) { setLiveText(d.text); if (d.language) setLastLang(d.language); addLog('frame ' + d.frames + ' text') }
        else        { addLog('frame ' + d.frames + ' ' + d.label + ' ' + d.score.toFixed(0)) }
      })

      sock.on('result', (d: ResultData) => {
        setFinalText(prev => prev ? prev + '\n\n' + d.text : d.text)
        setScanCount(prev => prev + 1)
        setLiveText(''); setLimitMsg('')
        setLastLang(d.lang); setAiUsed(d.ai_used)
        setSyntaxOk(d.syntax_ok); setSyntaxErr(d.syntax_err || '')
        if (d.download_url) setLastDownload(d.download_url)
        if ((d as any).plan_usage) setPlanUsage((d as any).plan_usage)
        addLog('result: ' + d.lang + ' ai=' + d.ai_used)
        const ext = _LANG_EXT[d.lang] || '.txt'
        const ts  = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        setSaveFilename(prev => prev || `${d.lang || 'code'}_${ts}${ext}`)
        setPendingLang(d.lang)
      })

      sock.on('auto_captured', () => {
        addLog('auto_captured')
        // Only stop once to avoid duplicate processing
        if (intervalRef.current) handleStopRef.current?.()
      })

      sock.on('session_fixed', (d: SessionFixedData) => {
        setExporting(false); setShowExport(false)
        if (d.error) { setStatusMsg('Export error: ' + d.error); return }
        if (d.text) setFinalText(d.text)
        if (d.download_url) setLastDownload(d.download_url)
        setStatusMsg('Exported: ' + d.filename); addLog('exported: ' + d.filename)
      })

      sock.on('result_saved', (d: any) => {
        setSaving(false); setShowSaveModal(false)
        setSaveFilename(''); setPendingLang('')
        if (d.error) { setStatusMsg('Save error: ' + d.error); addLog('save error: ' + d.error); return }
        if (d.download_url) setLastDownload(d.download_url)
        if (d.plan_usage) setPlanUsage(d.plan_usage)
        setFinalText(''); setLiveText(''); setScanCount(0)
        setStatusMsg('Saved: ' + d.filename + ' — ready for next session'); addLog('saved: ' + d.filename)
      })

      sock.on('plan_usage', (d: PlanUsage) => setPlanUsage(d))

      sock.on('language_set', (d: { language: string }) => setLanguage(d.language === 'auto' ? '' : d.language))
    }
    init()
    return () => { socketRef.current?.disconnect(); stopStream() }
  }, []) // eslint-disable-line

  // ── Camera / screen capture ──────────────────────────────────────────────────
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

  // ── Frame capture with optional ROI crop ────────────────────────────────────
  const captureFrame = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || !socketRef.current?.connected) return
    if (!video.videoWidth || !video.videoHeight) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const r = roiRef.current
    if (r) {
      const sx = Math.round(r.x1 * video.videoWidth),  sy = Math.round(r.y1 * video.videoHeight)
      const sw = Math.round((r.x2 - r.x1) * video.videoWidth)
      const sh = Math.round((r.y2 - r.y1) * video.videoHeight)
      if (sw < 10 || sh < 10) return
      canvas.width = sw; canvas.height = sh
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
    } else {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
    }
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

  // Photo with optional ROI crop
  const handlePhoto = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || !socketRef.current?.connected) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const r = roiRef.current
    if (r) {
      const sx = Math.round(r.x1 * video.videoWidth),  sy = Math.round(r.y1 * video.videoHeight)
      const sw = Math.round((r.x2 - r.x1) * video.videoWidth)
      const sh = Math.round((r.y2 - r.y1) * video.videoHeight)
      if (sw < 10 || sh < 10) return
      canvas.width = sw; canvas.height = sh
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
    } else {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
    }
    addLog('Emitting photo' + (r ? ' (cropped)' : ''))
    socketRef.current.emit('photo', { image: canvas.toDataURL('image/jpeg', 0.95) })
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const emit = (ev: string, data?: object) => socketRef.current?.emit(ev, data)
  const handleLanguageChange  = (l: string) => { setLanguage(l);    emit('set_language',    { language: l }) }
  const handleAiToggle        = () => { const n = !aiEnabled;   setAiEnabled(n);   emit('set_ai',        { enabled: n }) }
  const handleNightToggle     = () => { const n = !nightMode;   setNightMode(n);   emit('set_night',     { enabled: n }) }
  const handleAutoToggle      = () => { const n = !autoCapture; setAutoCapture(n); emit('set_auto',      { enabled: n }) }
  const handleAutoClearToggle = () => { const n = !autoClear;   setAutoClear(n);   emit('set_auto_clear',{ enabled: n }) }
  const handleModelChange     = (m: string) => { setLlmModel(m); emit('set_model', { model: m }) }
  const handleBulkToggle      = () => { const n = !bulkCapture; setBulkCapture(n); emit('set_bulk', { enabled: n }) }
  const handleResetBulk       = () => { emit('reset_bulk_session'); setBulkBlocks(0) }

  const handleCopy = (text: string) => navigator.clipboard.writeText(text).then(() => setStatusMsg('Copied!'))
  const handleSaveSubmit = (withAi: boolean) => {
    setSaving(true)
    emit('save_result', { lang: pendingLang, filename: saveFilename, ai_fix: withAi, model: saveModel })
  }
  const handleExportSubmit = () => { setExporting(true); emit('fix_session_file', { filename: exportFilename, ai_fix: true, model: exportModel }) }
  const handleSignOut = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  const applyRoiPreset = (r: ROI) => { roiRef.current = r; setRoi(r) }
  const clearRoi = () => { roiRef.current = null; setRoi(null) }
  const toggleRoiMode = () => {
    const next = !showRoi
    setShowRoi(next)
    showRoiRef.current = next
    if (!next) clearRoi()
  }

  // Derived
  const qColor      = qualityLabel === 'sharp' ? '#22c55e' : qualityLabel === 'ok' ? '#eab308' : qualityLabel === 'blurry' ? '#ef4444' : '#888'
  const dotColor    = socketStatus === 'connected' ? '#22c55e' : socketStatus === 'error' ? '#ef4444' : '#eab308'
  const outputText  = finalText || liveText
  // Force contain when ROI is active so full frame is visible
  const videoFit    = (showRoi || fitScreen) ? 'contain' : 'cover'

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.logo}>CamToCode</span>
        <div style={s.hRight}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
          <button onClick={() => setShowDebug(d => !d)} style={s.iconBtn} title="Debug log">🪲</button>
          <a href="/history" style={s.historyLink}>History</a>
          <a href="/account" style={s.historyLink}>Account</a>
          {planUsage?.plan === 'admin' && (
            <a href="/admin" style={{ ...s.historyLink, color: '#f59e0b' }}>Admin</a>
          )}
          <button onClick={() => setShowSettings(v => !v)} style={s.iconBtn}>⚙️</button>
          <button onClick={handleSignOut} style={s.signOutBtn}>Sign Out</button>
        </div>
      </div>

      {/* Plan usage badge */}
      {planUsage && (
        <div style={{ padding: '0.5rem 1rem', display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <UsageBadge usage={planUsage} compact />
          {limitMsg && (
            <div style={{
              background: 'rgba(248,113,113,0.15)', border: '1px solid #f87171',
              borderRadius: 8, padding: '0.45rem 0.9rem', fontSize: '0.78rem', color: '#fca5a5',
              maxWidth: 420, alignSelf: 'center',
            }}>
              ⚠️ {limitMsg}
            </div>
          )}
          {/* Upgrade nudge for free/starter plans hitting limits */}
          {limitMsg && planUsage?.plan === 'free' && (
            <PayButton plan="starter" label="Upgrade to Starter — $7/mo"
              style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem', borderRadius: 7 }} />
          )}
          {limitMsg && planUsage?.plan === 'starter' && (
            <PayButton plan="pro" label="Upgrade to Pro — $18/mo"
              style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem', borderRadius: 7 }} />
          )}
        </div>
      )}

      {/* Debug log */}
      {showDebug && (
        <div style={s.debugPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: '0.72rem', color: '#a78bfa' }}>
              Debug — {socketStatus} — {BACKEND_URL}
            </span>
            <button onClick={() => setDebugLog([])} style={s.smallBtn}>Clear</button>
          </div>
          {debugLog.length === 0
            ? <div style={{ opacity: 0.4, fontSize: '0.68rem' }}>No events yet</div>
            : debugLog.map((l, i) => (
                <div key={i} style={{ fontSize: '0.66rem', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '2px 0', lineHeight: 1.4 }}>{l}</div>
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={videoMode === 'camera' ? startScreenCapture : startCamera} style={s.toolBtn}>
            {videoMode === 'camera' ? '🖥 Screen' : '📷 Camera'}
          </button>
          <button
            onClick={() => setFitScreen(f => !f)}
            style={{ ...s.toolBtn, background: fitScreen ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)' }}
          >
            {fitScreen ? '⊡ Fit' : '⊞ Fill'}
          </button>
          <button
            onClick={toggleRoiMode}
            style={{ ...s.toolBtn, background: showRoi ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)', borderColor: showRoi ? '#6366f1' : undefined, color: showRoi ? '#a5b4fc' : undefined }}
          >
            {showRoi ? (roi ? '✂ Region ✓' : '✂ Draw Region') : '✂ Region'}
          </button>
        </div>
        {videoMode === 'screen' && <span style={s.modeTag}>🖥 Screen</span>}
      </div>

      {/* ROI preset bar — shown when region mode is active */}
      {showRoi && (
        <div style={s.roiBar}>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>Presets:</span>
          {ROI_PRESETS.map(p => (
            <button key={p.label} onClick={() => applyRoiPreset(p.roi)} style={s.roiPresetBtn}>{p.label}</button>
          ))}
          {roi && (
            <button onClick={clearRoi} style={{ ...s.roiPresetBtn, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}>✕ Clear</button>
          )}
        </div>
      )}

      {/* Video container */}
      <div ref={camWrapRef} style={s.camWrap}>
        <video ref={videoRef} playsInline muted style={{ ...s.video, objectFit: videoFit as any }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {/* ROI selection canvas — always mounted, only interactive when showRoi */}
        <canvas
          ref={roiCanvasRef}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            cursor: showRoi ? 'crosshair' : 'default',
            touchAction: 'none',
            pointerEvents: showRoi ? 'auto' : 'none',
            zIndex: 10,
          }}
        />
        {qualityLabel && (
          <div style={{ ...s.badge, borderColor: qColor, color: qColor, zIndex: 11 }}>
            {qualityLabel.toUpperCase()} {qualityScore.toFixed(0)} | {frames}f
            {roi && ` | ROI`}
          </div>
        )}
        {glareWarn && <div style={{ ...s.glare, zIndex: 11 }}>⚠ Glare</div>}
        {zoomMsg   && <div style={{ ...s.zoom, zIndex: 11 }}>{zoomMsg}</div>}
        {capturing && <div style={{ ...s.liveDot, zIndex: 11 }}>● LIVE</div>}
        {showRoi && !roi && (
          <div style={s.roiHint}>Drag to select region</div>
        )}
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

      {/* Status bar */}
      <div style={s.statusBar}>
        <span style={{ flex: 1 }}>{statusMsg}</span>
        {lastLang && <span style={s.langTag}>{lastLang}{aiUsed ? ' ✨' : ''}</span>}
        {roi && <span style={{ ...s.langTag, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
          ROI {Math.round((roi.x2-roi.x1)*100)}%×{Math.round((roi.y2-roi.y1)*100)}%
        </span>}
        {syntaxOk === false && <span style={s.syntaxErr}>⚠ {syntaxErr}</span>}
        {syntaxOk === true  && <span style={s.syntaxOk}>✓ Syntax OK</span>}
      </div>

      {/* Output */}
      <div style={s.outputWrap}>
        <div style={s.outputHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {capturing && liveText
              ? <><span style={{ color: '#22c55e' }}>⬤</span> Live OCR</>
              : scanCount > 0
                ? <>{scanCount > 1 ? `${scanCount} scans` : 'Result'}{aiUsed && <span style={{ color: '#a78bfa', fontSize: '0.7rem' }}>✨ AI</span>}</>
                : 'Output'
            }
            {lastLang && <span style={s.langTag}>{lastLang}</span>}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {outputText && <button onClick={() => handleCopy(outputText)} style={s.smallBtn}>Copy</button>}
            {outputText && <button onClick={() => { setFinalText(''); setLiveText(''); setScanCount(0) }} style={s.smallBtn}>Clear</button>}
            {scanCount > 0 && !capturing && (
              <button
                onClick={() => { setSaveAiEnabled(planUsage?.ai_fix_allowed === true); setShowSaveModal(true) }}
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
            : socketStatus === 'connected' ? 'Press Start or 📷 Photo to capture code'
            : 'Connecting to backend...')}
        </pre>
      </div>

      {/* Save File Modal */}
      {showSaveModal && (
        <div style={s.backdrop} onClick={() => !saving && setShowSaveModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Save to History</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', marginBottom: '1rem' }}>
              {scanCount} scan{scanCount !== 1 ? 's' : ''} accumulated{pendingLang ? ` · ${pendingLang}` : ''}
            </p>
            <input
              type="text" placeholder="Filename"
              value={saveFilename} onChange={e => setSaveFilename(e.target.value)}
              style={{ ...s.input, width: '100%', marginBottom: '0.75rem', boxSizing: 'border-box' }}
            />
            <div style={s.row}>
              <span style={{ fontSize: '0.85rem', color: planUsage?.ai_fix_allowed === false ? 'rgba(255,255,255,0.35)' : undefined }}>
                AI Fix with Claude
                {planUsage?.ai_fix_allowed === false && (
                  <span style={{ fontSize: '0.72rem', color: '#f59e0b', marginLeft: 8 }}>
                    — <a href="/account" style={{ color: '#818cf8', textDecoration: 'none' }}>Upgrade to unlock</a>
                  </span>
                )}
              </span>
              <label
                style={{ ...s.toggle, opacity: planUsage?.ai_fix_allowed === false ? 0.4 : 1, cursor: planUsage?.ai_fix_allowed === false ? 'not-allowed' : 'pointer' }}
                title={planUsage?.ai_fix_allowed === false ? 'Upgrade to Starter or Pro to use AI Fix' : undefined}
              >
                <input
                  type="checkbox"
                  checked={saveAiEnabled}
                  disabled={planUsage?.ai_fix_allowed === false}
                  onChange={() => setSaveAiEnabled(v => !v)}
                  style={s.toggleInput}
                />
                <span style={{ ...s.toggleSlider, background: saveAiEnabled && planUsage?.ai_fix_allowed !== false ? '#4f46e5' : '#374151' }}>
                  <span style={{ ...s.toggleKnob, left: saveAiEnabled && planUsage?.ai_fix_allowed !== false ? 22 : 3 }} />
                </span>
              </label>
            </div>
            {saveAiEnabled && planUsage?.ai_fix_allowed !== false && (
              <div style={{ ...s.row, marginTop: 8 }}>
                <span style={{ fontSize: '0.85rem' }}>Model</span>
                <select value={saveModel} onChange={e => setSaveModel(e.target.value)} style={s.select}>
                  <option value="haiku">Haiku (Fast)</option>
                  <option value="sonnet">Sonnet (Best)</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button onClick={() => setShowSaveModal(false)} style={s.cancelBtn} disabled={saving}>Cancel</button>
              <button
                onClick={() => handleSaveSubmit(false)}
                style={{ ...s.cancelBtn, color: '#e2e8f0' }}
                disabled={saving}
              >
                Save as-is
              </button>
              <button onClick={() => handleSaveSubmit(saveAiEnabled && planUsage?.ai_fix_allowed !== false)} style={s.exportBtn} disabled={saving}>
                {saving ? 'Saving...' : (saveAiEnabled && planUsage?.ai_fix_allowed !== false) ? '✨ Fix & Save' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Export Modal */}
      {showExport && (
        <div style={s.backdrop} onClick={() => !exporting && setShowExport(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Export Bulk Session</h3>
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
  toolbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 8 },
  toolBtn:      { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '0.25rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer' },
  modeTag:      { background: 'rgba(99,102,241,0.25)', color: '#818cf8', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', whiteSpace: 'nowrap' },
  roiBar:       { display: 'flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.75rem', background: 'rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(99,102,241,0.2)', flexWrap: 'wrap' },
  roiPresetBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#c7d2fe', borderRadius: 6, padding: '0.15rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer' },
  roiHint:      { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', pointerEvents: 'none', zIndex: 12 },
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
  output:       { padding: '0.6rem 0.75rem', fontSize: '0.78rem', fontFamily: '"JetBrains Mono","Fira Code",Consolas,monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 260, overflowY: 'auto', color: '#e2e8f0', margin: 0 },
  smallBtn:     { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0', borderRadius: 7, padding: '0.2rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' },
  exportBtn:    { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', borderRadius: 8, padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: 'none' },
  cancelBtn:    { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '0.35rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer' },
  input:        { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', padding: '0.55rem 0.75rem', fontSize: '0.875rem', boxSizing: 'border-box' },
  backdrop:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:        { background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400 },
}
