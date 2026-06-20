'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { createClient } from '@/lib/supabase'
import UsageAccordion from './UsageAccordion'
import AIModelSelector, { type AiModelOption } from './AIModelSelector'
import { DEFAULT_OCR_MODEL_KEY, DEFAULT_OCR_MODELS, ocrModelLabel } from '@/lib/ocrModels'
import { type PlanUsage } from './UsageBadge'
import InstallAppButton from './InstallAppButton'
import AppNavMenu from './AppNavMenu'
import { loggedInNavItems } from '@/lib/appNav'

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
interface StatusData { capturing?: boolean; processing?: boolean; msg: string; bulk_block?: number; bulk_session?: number }
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
  const [showQualityTip, setShowQualityTip] = useState(() => {
    try { return localStorage.getItem('ctc_quality_tip_dismissed') !== '1' } catch { return true }
  })
  const [debugLog,     setDebugLog]     = useState<string[]>([])
  const [showDebug,    setShowDebug]    = useState(false)
  const [capturing,    setCapturing]    = useState(false)
  const [processingScan, setProcessingScan] = useState(false)
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
  const [llmModel,     setLlmModel]     = useState(DEFAULT_OCR_MODEL_KEY)
  const [aiModels,     setAiModels]     = useState<AiModelOption[]>([])
  const [geminiAvailable, setGeminiAvailable] = useState(false)
  const [modelTip,     setModelTip]     = useState('Fastest reads — great for clear screenshots and short snippets')
  const [modelLabel,   setModelLabel]   = useState('Quick OCR')
  const [fallbackNotice, setFallbackNotice] = useState('')
  const [modeDetailsOpen, setModeDetailsOpen] = useState(false)
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
  // Scan & Answer state
  const [saMode,          setSaMode]          = useState(false)
  const [saScanCount,     setSaScanCount]     = useState(0)
  const [saLineCount,     setSaLineCount]     = useState(0)
  const [saMaxLines,      setSaMaxLines]      = useState(0)
  const [saAnswering,     setSaAnswering]     = useState(false)
  const [saStreamText,    setSaStreamText]    = useState('')
  const [saAnswerText,    setSaAnswerText]    = useState('')
  const [saAnswerFilename,setSaAnswerFilename]= useState('')
  const [saAnswerUrl,     setSaAnswerUrl]     = useState('')
  const [saError,         setSaError]         = useState('')
  const [saStatusMsg,     setSaStatusMsg]     = useState('')
  const [saAppending,     setSaAppending]     = useState(false)
  const [showSaAnswer,    setShowSaAnswer]    = useState(false)
  const [saAnswerSource,  setSaAnswerSource]  = useState<'accumulated' | 'instant'>('accumulated')
  const [instantMode,     setInstantMode]     = useState(false)
  const saModeRef = useRef(false)
  const instantModeRef = useRef(false)
  const saAnsweringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto re-capture state
  const [autoRecapture,         setAutoRecapture]         = useState(false)
  const [recaptureInterval,     setRecaptureInterval]     = useState(5)
  const [recaptureCountdown,    setRecaptureCountdown]    = useState(0)
  const [recaptureTotal,        setRecaptureTotal]        = useState(5)
  const [recapturePaused,       setRecapturePaused]       = useState(false)
  const [recaptureSessionActive, setRecaptureSessionActive] = useState(false)
  const [recaptureSeparator,    setRecaptureSeparator]    = useState(false)
  const recaptureRemainingRef   = useRef(0)
  const recapturePausedRef      = useRef(false)
  const recaptureSeparatorRef   = useRef(false)
  const outputWrapRef           = useRef<HTMLDivElement>(null)
  const cameraEnlargedRef         = useRef(false)
  const [cameraEnlarged,         setCameraEnlarged]         = useState(false)

  // ROI state
  const [roi,     setRoi]     = useState<ROI | null>(null)
  const [showRoi, setShowRoi] = useState(false)
  // Plan / usage
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null)
  const [limitMsg,  setLimitMsg]  = useState('')

  // Keep refs in sync with state
  useEffect(() => { roiRef.current = roi }, [roi])
  useEffect(() => { showRoiRef.current = showRoi }, [showRoi])
  useEffect(() => { recaptureSeparatorRef.current = recaptureSeparator }, [recaptureSeparator])
  useEffect(() => { recapturePausedRef.current = recapturePaused }, [recapturePaused])
  useEffect(() => { cameraEnlargedRef.current = cameraEnlarged }, [cameraEnlarged])
  useEffect(() => { saModeRef.current = saMode }, [saMode])
  useEffect(() => { instantModeRef.current = instantMode }, [instantMode])

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString()
    setDebugLog(prev => [`${ts} ${msg}`, ...prev].slice(0, 30))
  }, [])

  const scrollToOutput = useCallback(() => {
    setTimeout(() => {
      outputWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 350)
  }, [])

  const closeFocusMode = useCallback(() => {
    setCameraEnlarged(false)
    cameraEnlargedRef.current = false
  }, [])

  const clearSaAnsweringTimeout = useCallback(() => {
    if (saAnsweringTimeoutRef.current) {
      clearTimeout(saAnsweringTimeoutRef.current)
      saAnsweringTimeoutRef.current = null
    }
  }, [])

  const beginSaAnswering = useCallback((statusMsg: string) => {
    setSaAnswering(true)
    setSaError('')
    setSaStreamText('')
    setSaStatusMsg(statusMsg)
    clearSaAnsweringTimeout()
    saAnsweringTimeoutRef.current = setTimeout(() => {
      setSaAnswering(false)
      setSaError('Answer timed out after 2 minutes. Please try again.')
      addLog('S&A timeout')
    }, 120_000)
  }, [addLog, clearSaAnsweringTimeout])

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
      sock.on('disconnect',    (r) => {
        setSocketStatus('connecting'); setStatusMsg('Disconnected'); addLog('Disconnected: ' + r)
        setProcessingScan(false); setSaAppending(false)
        clearSaAnsweringTimeout(); setSaAnswering(false)
      })

      sock.on('init_state', (d: any) => {
        setAiEnabled(d.ai_enabled); setNightMode(d.night_mode)
        setAutoCapture(d.auto_capture); setAutoClear(d.auto_clear_after_export)
        setLlmModel(d.llm_model || DEFAULT_OCR_MODEL_KEY); setBulkCapture(d.bulk_capture)
        setBulkBlocks(d.bulk_session_blocks); setBulkSession(d.bulk_session_number)
        if (Array.isArray(d.ai_models)) setAiModels(d.ai_models)
        if (d.gemini_available !== undefined) setGeminiAvailable(d.gemini_available)
        const initModel = (d.ai_models as AiModelOption[] | undefined)?.find(m => m.key === (d.llm_model || DEFAULT_OCR_MODEL_KEY))
        if (initModel) {
          setModelTip(initModel.tip)
          setModelLabel(initModel.label)
        }
        if (d.auto_recapture_enabled !== undefined) setAutoRecapture(d.auto_recapture_enabled)
        if (d.auto_recapture_interval !== undefined) setRecaptureInterval(d.auto_recapture_interval)
        if (d.auto_recapture_separator !== undefined) {
          setRecaptureSeparator(d.auto_recapture_separator)
          recaptureSeparatorRef.current = d.auto_recapture_separator
        }
        if (d.instant_answer_mode !== undefined) setInstantMode(d.instant_answer_mode)
        if (d.plan_usage) setPlanUsage(d.plan_usage)
        addLog('State received')
      })

      sock.on('status', (d: StatusData) => {
        setStatusMsg(d.msg); addLog('status: ' + d.msg)
        if (typeof d.capturing === 'boolean') setCapturing(d.capturing)
        if (typeof d.processing === 'boolean') setProcessingScan(d.processing)
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
        setProcessingScan(false)
        setFinalText(prev => {
          if (!prev) return d.text
          const sep = recaptureSeparatorRef.current ? '\n\n────────────────────────\n\n' : '\n\n'
          return prev + sep + d.text
        })
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
        // Stay in enlarge during auto-recapture — user exits manually via ✕ Close
        // Auto-append to Scan & Answer buffer when in S&A mode
        if (saModeRef.current && !instantModeRef.current && d.text) {
          setSaAppending(true)
          sock.emit('sa_append', { text: d.text })
        }
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

      sock.on('sa_updated', (d: any) => {
        setSaAppending(false)
        setSaScanCount(d.scan_count)
        setSaLineCount(d.line_count)
        setSaMaxLines(d.max_lines)
        addLog(`S&A: ${d.scan_count} scans, ${d.line_count}/${d.max_lines} lines`)
      })
      sock.on('sa_error', (d: any) => {
        setSaError(d.msg)
        setSaAppending(false)
        setProcessingScan(false)
        clearSaAnsweringTimeout()
        setSaAnswering(false)
        addLog('S&A error: ' + d.msg)
      })
      sock.on('sa_status', (d: any) => {
        setSaStatusMsg(d.msg)
        setStatusMsg(d.msg)
        addLog('S&A status: ' + d.msg)
      })
      sock.on('sa_token', (d: any) => {
        setSaStreamText(prev => prev + d.token)
      })
      sock.on('sa_done', (d: any) => {
        clearSaAnsweringTimeout()
        setSaAnswering(false)
        setProcessingScan(false)
        setSaStatusMsg('')
        setSaScanCount(0)
        setSaLineCount(0)
        setSaAnswerText(d.answer)
        setSaAnswerFilename(d.filename)
        setSaAnswerUrl(d.download_url || '')
        setSaAnswerSource(d.source === 'instant' ? 'instant' : 'accumulated')
        setSaStreamText('')
        setShowSaAnswer(true)
        setStatusMsg('Answer ready: ' + d.filename)
        addLog('S&A done: ' + d.filename)
        if (d.plan_usage) setPlanUsage(d.plan_usage)
        else sock.emit('get_plan_usage')
      })
      sock.on('sa_cleared', () => {
        setSaScanCount(0)
        setSaLineCount(0)
        setSaError('')
        addLog('S&A session cleared')
      })

      sock.on('recapture_countdown', (d: { remaining: number; total: number }) => {
        if (recapturePausedRef.current) return
        setRecapturePaused(false)
        setRecaptureCountdown(d.remaining)
        setRecaptureTotal(d.total)
        recaptureRemainingRef.current = d.remaining
      })

      sock.on('recapture_paused', (d: { remaining: number; total: number }) => {
        recapturePausedRef.current = true
        setRecapturePaused(true)
        setRecaptureCountdown(d.remaining)
        setRecaptureTotal(d.total)
        recaptureRemainingRef.current = d.remaining
        addLog('recapture paused at ' + d.remaining)
      })

      sock.on('recapture_resumed', () => {
        recapturePausedRef.current = false
        setRecapturePaused(false)
        addLog('recapture resumed')
      })

      sock.on('recapture_trigger', () => {
        if (!cameraEnlargedRef.current) {
          sock.emit('pause_recapture', { remaining: recaptureRemainingRef.current || 0 })
          addLog('recapture ignored — focus mode closed')
          return
        }
        recapturePausedRef.current = false
        setRecaptureSessionActive(true)
        setRecaptureCountdown(0)
        setRecapturePaused(false)
        sock.emit('recapture_start_signal')
        handleStartRef.current?.()
      })

      sock.on('recapture_cancelled', () => {
        recapturePausedRef.current = false
        setRecaptureCountdown(0)
        setRecapturePaused(false)
        setRecaptureSessionActive(false)
        setAutoRecapture(false)
      })

      sock.on('auto_recapture_state', (d: { enabled: boolean }) => {
        setAutoRecapture(d.enabled)
        if (!d.enabled) {
          setRecaptureCountdown(0)
          setRecapturePaused(false)
        }
      })

      sock.on('instant_answer_state', (d: { enabled: boolean }) => {
        setInstantMode(d.enabled)
        instantModeRef.current = d.enabled
      })

      sock.on('language_set', (d: { language: string }) => setLanguage(d.language === 'auto' ? '' : d.language))

      sock.on('model_set', (d: { model: string; label: string; tip: string; recommended?: boolean }) => {
        setLlmModel(d.model)
        setModelLabel(d.label)
        setModelTip(d.tip || '')
        setStatusMsg(`AI model: ${d.label}`)
        addLog('model: ' + d.label)
      })
      sock.on('model_error', (d: { msg: string }) => {
        setStatusMsg(d.msg)
        addLog('model error: ' + d.msg)
      })
      sock.on('model_fallback', (d: { msg: string; from_model?: string; to_model?: string; to_label?: string }) => {
        setFallbackNotice(d.msg)
        setStatusMsg(d.msg)
        addLog('model fallback: ' + d.msg)
        setTimeout(() => setFallbackNotice(''), 12_000)
      })
    }
    init()
    return () => {
      clearSaAnsweringTimeout()
      socketRef.current?.disconnect()
      stopStream()
    }
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
    setProcessingScan(true)
    if (instantModeRef.current) beginSaAnswering('Reading question and generating answer...')
    if (socketRef.current?.connected) { addLog('Emitting stop'); socketRef.current.emit('stop') }
  }, [beginSaAnswering])

  const handleStopRef = useRef(handleStop)
  useEffect(() => { handleStopRef.current = handleStop }, [handleStop])

  const handleStartRef = useRef(handleStart)
  useEffect(() => { handleStartRef.current = handleStart }, [handleStart])

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
    if (instantModeRef.current) beginSaAnswering('Reading question and generating answer...')
    socketRef.current.emit('photo', { image: canvas.toDataURL('image/jpeg', 0.95) })
  }, [beginSaAnswering])

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

  const scanMode: 'code' | 'sa' | 'instant' = instantMode ? 'instant' : saMode ? 'sa' : 'code'
  const scanModeInfo = {
    code: {
      icon: '📄',
      title: 'Code Scan',
      color: '#818cf8',
      bg: 'rgba(99,102,241,0.12)',
      border: 'rgba(99,102,241,0.35)',
      desc: 'Capture code from your screen or camera — press ▶ Start or 📷 Photo',
    },
    sa: {
      icon: '🧠',
      title: 'Scan & Answer',
      color: '#34d399',
      bg: 'rgba(16,185,129,0.1)',
      border: 'rgba(16,185,129,0.35)',
      desc: 'Scan multiple sections from large files, then tap Stop & Answer for a full AI response',
    },
    instant: {
      icon: '⚡',
      title: 'Instant Answer',
      color: '#fde047',
      bg: 'rgba(234,179,8,0.1)',
      border: 'rgba(234,179,8,0.35)',
      desc: 'Point at a question or MCQ, then capture once for an instant answer',
    },
  }[scanMode]
  const defaultAiModels: AiModelOption[] = [...DEFAULT_OCR_MODELS]
  const isGoogleOcrKey = (k: string) => k === 'gemini' || k === 'gemini_lite' || k === 'gemini_flash'

  const handleAutoRecaptureToggle = () => {
    const n = !autoRecapture
    setAutoRecapture(n)
    emit('set_auto_recapture', { enabled: n })
    if (!n) { setRecaptureCountdown(0); setRecapturePaused(false); setRecaptureSessionActive(false) }
  }
  const handleRecaptureIntervalChange = (v: number) => {
    setRecaptureInterval(v)
    emit('set_recapture_interval', { interval: v })
  }
  const handleRecaptureSeparatorToggle = () => {
    const n = !recaptureSeparator
    setRecaptureSeparator(n)
    recaptureSeparatorRef.current = n
    emit('set_recapture_separator', { enabled: n })
  }
  const handlePauseRecapture = () => {
    const remaining = recaptureRemainingRef.current || recaptureCountdown || recaptureInterval
    recapturePausedRef.current = true
    setRecapturePaused(true)
    setRecaptureCountdown(remaining)
    emit('pause_recapture', { remaining })
  }
  const handleResumeRecapture = () => {
    const remaining = recaptureRemainingRef.current || recaptureCountdown || recaptureInterval
    recapturePausedRef.current = false
    setRecapturePaused(false)
    emit('resume_recapture', { remaining })
  }
  const handleStopRecaptureSession = () => {
    emit('set_auto_recapture', { enabled: false })
    setAutoRecapture(false)
    recapturePausedRef.current = false
    setRecaptureCountdown(0)
    setRecapturePaused(false)
    setRecaptureSessionActive(false)
  }
  const capturingRef = useRef(false)
  useEffect(() => { capturingRef.current = capturing }, [capturing])

  const stopCaptureInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setCapturing(false)
  }, [])

  const pauseRecaptureOnBackend = useCallback(() => {
    const remaining = recaptureRemainingRef.current || recaptureCountdown || recaptureInterval
    recapturePausedRef.current = true
    setRecapturePaused(true)
    if (recaptureCountdown > 0 || recaptureSessionActive) {
      setRecaptureCountdown(0)
      setRecaptureSessionActive(false)
    }
    emit('pause_recapture', { remaining })
  }, [recaptureCountdown, recaptureSessionActive, recaptureInterval, emit])

  const closeFocusModeWithScroll = () => {
    stopCaptureInterval()
    if (capturingRef.current && socketRef.current?.connected) {
      socketRef.current.emit('stop')
      setProcessingScan(true)
    }
    pauseRecaptureOnBackend()
    closeFocusMode()
    if (scanCount > 0 || finalText || liveText) scrollToOutput()
  }
  const toggleCameraEnlarged = () => {
    setCameraEnlarged(v => {
      const next = !v
      cameraEnlargedRef.current = next
      return next
    })
  }

  const handleSaModeToggle = () => {
    const next = !saMode
    if (next && instantMode) {
      setInstantMode(false)
      instantModeRef.current = false
      emit('set_instant_answer', { enabled: false })
    }
    setSaMode(next)
    saModeRef.current = next
    if (!next) {
      emit('sa_clear')
      setSaScanCount(0); setSaLineCount(0); setSaError('')
    }
  }
  const handleInstantModeToggle = () => {
    const next = !instantMode
    if (next && saMode) {
      setSaMode(false)
      saModeRef.current = false
      emit('sa_clear')
      setSaScanCount(0); setSaLineCount(0); setSaError('')
    }
    setInstantMode(next)
    instantModeRef.current = next
    emit('set_instant_answer', { enabled: next })
    if (!next) setSaError('')
  }
  const handleStopAndAnswer = () => {
    if (saAnswering) return
    beginSaAnswering('Analyzing content and generating answer...')
    emit('sa_stop_and_answer')
  }
  const handleSaClear = () => {
    emit('sa_clear')
    setSaScanCount(0); setSaLineCount(0); setSaError('')
  }

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
    <div className={`ctc-app${cameraEnlarged ? ' ctc-app--focus' : ''}`} style={s.root}>
      {/* Header */}
      <div className="ctc-header ctc-hide-in-focus" style={s.header}>
        <span className="ctc-logo" style={s.logo}>CamToCode</span>
        <div className="ctc-header-nav" style={s.hRight}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
          <button onClick={() => setShowDebug(d => !d)} style={s.iconBtn} title="Debug">🪲</button>
          <span className="ctc-install-wrap"><InstallAppButton variant="compact" /></span>
          <button
            onClick={() => setShowSettings(v => !v)}
            style={{
              ...s.iconBtn,
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: '0.8rem', color: showSettings ? '#818cf8' : '#cbd5e1',
              background: showSettings ? 'rgba(99,102,241,0.15)' : 'transparent',
              border: showSettings ? '1px solid rgba(99,102,241,0.35)' : '1px solid transparent',
              borderRadius: 8, padding: '0.25rem 0.45rem',
            }}
            title="Settings"
          >
            <span style={{ fontSize: '1rem' }}>⚙️</span>
          </button>
          <AppNavMenu items={loggedInNavItems(handleSignOut)} />
        </div>
      </div>

      {/* Plan usage — collapsible accordion */}
      <div className="ctc-hide-in-focus"><UsageAccordion usage={planUsage} limitMsg={limitMsg || undefined} /></div>

      {/* Legacy inline limit nudge removed — handled inside UsageAccordion */}

      {/* Debug log */}
      {showDebug && (
        <div className="ctc-hide-in-focus" style={s.debugPanel}>
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
        <div className="ctc-hide-in-focus" style={s.settingsPanel}>
          {/* Settings header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>Settings</span>
            <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}>✕</button>
          </div>
          <div style={s.row}>
            <span>Language</span>
            <select value={language} onChange={e => handleLanguageChange(e.target.value)} style={s.select}>
              <option value="">Auto Detect</option>
              {LANGUAGES.filter(Boolean).map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
            </select>
          </div>
          {([
            ['AI Vision OCR', aiEnabled,   handleAiToggle],
            ['Night Mode',    nightMode,   handleNightToggle],
            ['Auto Capture',  autoCapture, handleAutoToggle],
            ['Auto Clear',       autoClear,         handleAutoClearToggle],
            ['Scan Separator',   recaptureSeparator, handleRecaptureSeparatorToggle],
            ['Bulk Capture',     bulkCapture,        handleBulkToggle],
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

          {/* Auto Re-capture — Starter/Pro only */}
          {(() => {
            const allowed = planUsage?.plan === 'starter' || planUsage?.plan === 'pro' || planUsage?.plan === 'admin'
            return (
              <div key="auto-recapture" style={s.row}>
                <span style={{ color: allowed ? undefined : 'rgba(255,255,255,0.35)' }}>
                  Auto Re-capture
                  {!allowed && (
                    <span style={{
                      marginLeft: 6,
                      fontSize: '0.65rem',
                      background: 'rgba(251,191,36,0.15)',
                      color: '#fbbf24',
                      borderRadius: 4,
                      padding: '1px 5px',
                    }}>Starter+</span>
                  )}
                </span>
                <label
                  style={{ ...s.toggle, opacity: allowed ? 1 : 0.4, cursor: allowed ? 'pointer' : 'not-allowed' }}
                  title={allowed ? undefined : 'Upgrade to Starter or Pro plan to use Auto Re-capture'}
                >
                  <input type="checkbox" checked={autoRecapture} onChange={allowed ? handleAutoRecaptureToggle : undefined} disabled={!allowed} style={s.toggleInput} />
                  <span style={{ ...s.toggleSlider, background: autoRecapture && allowed ? '#4f46e5' : '#374151' }}>
                    <span style={{ ...s.toggleKnob, left: autoRecapture && allowed ? 22 : 3 }} />
                  </span>
                </label>
              </div>
            )
          })()}
          {autoRecapture && (
            <div style={s.row}>
              <span>Re-capture interval</span>
              <select value={recaptureInterval} onChange={e => handleRecaptureIntervalChange(Number(e.target.value))} style={s.select}>
                {[3, 5, 8, 10, 12, 15, 20].map(v => <option key={v} value={v}>{v}s</option>)}
              </select>
            </div>
          )}
          <div style={s.row}>
            <span>OCR Engine</span>
            <select value={llmModel} onChange={e => handleModelChange(e.target.value)} style={s.select}>
              {(aiModels.length ? aiModels : defaultAiModels).map(m => {
                const sonnetBlocked = m.key === 'sonnet' && !planUsage?.sonnet_allowed
                const googleBlocked = isGoogleOcrKey(m.key) && !geminiAvailable
                return (
                  <option key={m.key} value={m.key} disabled={sonnetBlocked || googleBlocked}>
                    {ocrModelLabel(m.key, m.recommended)}
                    {sonnetBlocked ? ' (Pro)' : googleBlocked ? ' (not configured)' : ''}
                  </option>
                )
              })}
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

      {/* Video toolbar + AI model row */}
      <div className="ctc-toolbar-block ctc-hide-in-focus">
        <div className="ctc-toolbar" style={s.toolbar}>
          <button onClick={videoMode === 'camera' ? startScreenCapture : startCamera} style={s.toolBtn}>
            {videoMode === 'camera' ? '🖥 Screen' : '📷 Cam'}
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
            {showRoi ? (roi ? '✂ ✓' : '✂ Draw') : '✂ Region'}
          </button>
          {videoMode === 'screen' && <span style={s.modeTag}>🖥</span>}
        </div>
        <AIModelSelector
          models={aiModels.length ? aiModels : defaultAiModels}
          selected={llmModel}
          geminiAvailable={geminiAvailable}
          sonnetAllowed={planUsage?.sonnet_allowed === true || planUsage?.plan === 'admin'}
          onChange={handleModelChange}
        />
      </div>

      {/* ROI preset bar — shown when region mode is active */}
      {showRoi && (
        <div className="ctc-hide-in-focus" style={s.roiBar}>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>Presets:</span>
          {ROI_PRESETS.map(p => (
            <button key={p.label} onClick={() => applyRoiPreset(p.roi)} style={s.roiPresetBtn}>{p.label}</button>
          ))}
          {roi && (
            <button onClick={clearRoi} style={{ ...s.roiPresetBtn, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}>✕ Clear</button>
          )}
        </div>
      )}

      {/* Quality tip banner — shown once, dismissible */}
      {showQualityTip && (
        <div className="ctc-hide-in-focus" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))',
          border: '1px solid rgba(99,102,241,0.35)',
          borderRadius: 10,
          padding: '0.65rem 0.9rem',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>💡</span>
          <div style={{ flex: 1, fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.55 }}>
            <strong style={{ color: '#c7d2fe' }}>Get cleaner scans</strong> — avoid VS Code or any IDE when scanning code.
            IDEs add <strong style={{ color: '#fbbf24' }}>line numbers, gutter icons, and syntax highlights</strong> that confuse OCR.
            Instead, open your file in a plain viewer:{' '}
            <code style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 4, padding: '1px 6px', fontSize: '0.78rem', color: '#6ee7b7' }}>cat filename.py</code>
            {' '}in terminal, or Notepad / TextEdit for plain text — no line numbers, pure code.
          </div>
          <button
            onClick={() => {
              setShowQualityTip(false)
              try { localStorage.setItem('ctc_quality_tip_dismissed', '1') } catch {}
            }}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
              cursor: 'pointer', fontSize: '1rem', lineHeight: 1, flexShrink: 0, padding: '0 2px',
            }}
            title="Dismiss"
          >✕</button>
        </div>
      )}

      {/* AI fallback notification */}
      {fallbackNotice && (
        <div className="ctc-hide-in-focus" style={{
          margin: '0 0.75rem',
          background: 'rgba(251,191,36,0.12)',
          border: '1px solid rgba(251,191,36,0.4)',
          borderRadius: 10,
          padding: '0.5rem 0.85rem',
          fontSize: '0.78rem',
          color: '#fde68a',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <span>⚠️</span>
          <span>{fallbackNotice}</span>
        </div>
      )}

      {/* Scan mode — compact accordion */}
      <div className="ctc-mode-acc ctc-hide-in-focus" style={{ borderColor: scanModeInfo.border, background: scanModeInfo.bg }}>
        <button
          type="button"
          className="ctc-mode-acc-head"
          onClick={() => setModeDetailsOpen(v => !v)}
          aria-expanded={modeDetailsOpen}
        >
          <span style={{ color: scanModeInfo.color, fontWeight: 700 }}>
            Mode: {scanModeInfo.title}
          </span>
          <span className="ctc-mode-acc-arrow">{modeDetailsOpen ? '▼' : '▶'}</span>
        </button>
        {modeDetailsOpen && (
          <div className="ctc-mode-acc-body">
            <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
              {scanModeInfo.desc}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              AI: {modelLabel}
            </div>
            <button
              type="button"
              onClick={() => setModeDetailsOpen(false)}
              className="ctc-mode-acc-close"
              title="Close"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Focus / scan zone — camera + controls + recapture (fullscreen when enlarged) */}
      <div className={`ctc-scan-zone${cameraEnlarged ? ' ctc-scan-zone--enlarged' : ''}`}>
        {cameraEnlarged && (
          <div className="ctc-focus-bar">
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Focus Mode</span>
            <button type="button" className="ctc-focus-close" onClick={closeFocusModeWithScroll}>
              ✕ Close
            </button>
          </div>
        )}

      {/* Video container */}
      <div ref={camWrapRef} className="ctc-cam-wrap" style={s.camWrap}>
        {!cameraEnlarged && (
          <button type="button" className="ctc-enlarge-btn" onClick={toggleCameraEnlarged} title="Enlarge camera to full screen">
            ⛶ Enlarge
          </button>
        )}
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
        {processingScan && !capturing && !cameraEnlarged && (
          <div style={{ ...s.liveDot, zIndex: 11, background: 'rgba(99,102,241,0.85)', borderColor: 'rgba(99,102,241,0.5)' }}>
            ⏳ Processing
          </div>
        )}
        {showRoi && !roi && (
          <div style={s.roiHint}>Drag to select region</div>
        )}
        {cameraEnlarged && processingScan && !saAnswering && (
          <div className="ctc-focus-overlay">
            <div className="ctc-focus-overlay-inner">
              <span style={{ fontSize: '1.5rem' }}>⏳</span>
              <span>{statusMsg || 'Processing scan...'}</span>
              {(recaptureSessionActive || autoRecapture) && (
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>Auto re-capture session active</span>
              )}
            </div>
          </div>
        )}
        {cameraEnlarged && saAnswering && (
          <div className="ctc-focus-overlay">
            <div className="ctc-focus-overlay-inner">
              <span style={{ fontSize: '1.5rem' }}>{instantMode ? '⚡' : '🧠'}</span>
              <span>{saStatusMsg || (instantMode ? 'Generating instant answer...' : 'Generating answer...')}</span>
              {saStreamText && (
                <div className="ctc-focus-stream">{saStreamText.slice(-400)}</div>
              )}
            </div>
          </div>
        )}
        {cameraEnlarged && showSaAnswer && saAnswerText && (
          <div className="ctc-focus-answer">
            <div className="ctc-focus-answer-head">
              <span style={{ fontWeight: 700, color: saAnswerSource === 'instant' ? '#fde047' : '#34d399' }}>
                {saAnswerSource === 'instant' ? '⚡ Instant Answer' : '🧠 Scan & Answer'}
              </span>
              <button type="button" className="ctc-focus-answer-close" onClick={() => setShowSaAnswer(false)}>✕</button>
            </div>
            <div className="ctc-focus-answer-body">{saAnswerText}</div>
            <div className="ctc-focus-answer-actions">
              <button type="button" className="ctc-focus-answer-btn" onClick={() => navigator.clipboard.writeText(saAnswerText).then(() => setStatusMsg('Answer copied!'))}>
                Copy
              </button>
              {saAnswerUrl && (
                <a href={saAnswerUrl} download={saAnswerFilename} style={{ textDecoration: 'none' }}>
                  <button type="button" className="ctc-focus-answer-btn">Download</button>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom dock — controls + recapture (always visible in focus mode) */}
      <div className="ctc-focus-dock">
      {/* Auto Re-capture Countdown Banner — unified (running or paused) */}
      {(recaptureCountdown > 0 || recapturePaused) && autoRecapture && (
        <div className="ctc-recapture-banner" style={{
          background: recapturePaused ? 'rgba(251,191,36,0.12)' : 'rgba(99,102,241,0.15)',
          border: recapturePaused ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(99,102,241,0.4)',
          borderRadius: 10,
          padding: '0.4rem 0.65rem',
          margin: cameraEnlarged ? '0.35rem 0.5rem 0' : '0.25rem 0.65rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap' as const,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.68rem', color: recapturePaused ? '#fbbf24' : 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {recapturePaused ? '⏸ Paused' : 'Auto-capture in'}
            </span>
            <span className="ctc-recapture-count" style={{
              fontSize: '1.25rem',
              fontWeight: 900,
              color: recapturePaused ? '#fbbf24' : '#818cf8',
              lineHeight: 1,
              minWidth: 24,
              textAlign: 'center',
            }}>
              {recaptureCountdown}
            </span>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>s</span>
            {recaptureSessionActive && !recapturePaused && (
              <span style={{ fontSize: '0.62rem', background: 'rgba(34,197,94,0.15)', color: '#4ade80', borderRadius: 4, padding: '1px 5px' }}>
                Running
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {recapturePaused ? (
              <button onClick={handleResumeRecapture} style={{
                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                color: '#4ade80', borderRadius: 6, padding: '0.25rem 0.55rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
              }}>▶ Resume</button>
            ) : (
              <button onClick={handlePauseRecapture} style={{
                background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
                color: '#fbbf24', borderRadius: 6, padding: '0.25rem 0.55rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
              }}>⏸ Pause</button>
            )}
            <button onClick={handleStopRecaptureSession} style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              color: '#f87171', borderRadius: 6, padding: '0.25rem 0.55rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
            }}>■ Stop</button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="ctc-controls" style={s.controls}>
        {!capturing ? (
          <>
            <button onClick={() => {
              if (recaptureCountdown > 0 || recapturePaused) {
                emit('pause_recapture')
                setRecaptureCountdown(0)
                setRecapturePaused(false)
              }
              setRecaptureSessionActive(false)
              if (!saMode) setFinalText('')
              handleStart()
            }} disabled={socketStatus !== 'connected'}
              className="ctc-start-btn"
              style={{ ...s.startBtn, opacity: socketStatus !== 'connected' ? 0.5 : 1 }}>
              ▶ Start
            </button>
            <button onClick={handlePhoto} disabled={socketStatus !== 'connected'}
              className="ctc-ctrl-btn"
              style={{ ...s.photoBtn, opacity: socketStatus !== 'connected' ? 0.5 : 1 }}>
              📷 Photo
            </button>
          </>
        ) : (
          <button onClick={handleStop} className="ctc-stop-btn" style={s.stopBtn}>⏹ Stop</button>
        )}
        {/* Scan & Answer mode toggle */}
        <button
          onClick={handleSaModeToggle}
          className="ctc-ctrl-btn"
          style={{
            ...s.photoBtn,
            background: saMode ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)',
            borderColor: saMode ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.15)',
            color: saMode ? '#34d399' : '#e2e8f0',
            fontWeight: saMode ? 700 : 500,
            boxShadow: saMode ? '0 0 0 1px rgba(16,185,129,0.35)' : undefined,
          }}
          title="Scan & Answer — accumulate scans, then get one AI answer"
        >
          🧠 S&A{saMode ? ' ✓' : ''}
        </button>
        <button
          onClick={handleInstantModeToggle}
          className="ctc-ctrl-btn"
          style={{
            ...s.photoBtn,
            background: instantMode ? 'rgba(234,179,8,0.22)' : 'rgba(255,255,255,0.08)',
            borderColor: instantMode ? 'rgba(234,179,8,0.55)' : 'rgba(255,255,255,0.15)',
            color: instantMode ? '#fde047' : '#e2e8f0',
            fontWeight: instantMode ? 700 : 500,
            boxShadow: instantMode ? '0 0 0 1px rgba(234,179,8,0.35)' : undefined,
          }}
          title="Instant Answer — one capture, immediate AI answer"
        >
          ⚡ Instant{instantMode ? ' ✓' : ''}
        </button>
      </div>
      </div>{/* end ctc-focus-dock */}
      </div>{/* end ctc-scan-zone */}

      {/* Instant Answer panel — hidden in focus mode */}
      {instantMode && (
        <div className="ctc-hide-in-focus" style={{
          margin: '0 0.65rem',
          background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.3)',
          borderRadius: 12,
          padding: '0.65rem 0.85rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: '0.78rem', color: '#fde047', fontWeight: 700 }}>⚡ Instant Answer active</span>
            {saAnswering && (
              <span style={{ fontSize: '0.72rem', color: '#fde047' }}>⏳ {saStatusMsg || 'Answering...'}</span>
            )}
          </div>
          {saError && instantMode && (
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#fca5a5' }}>⚠ {saError}</div>
          )}
        </div>
      )}

      {/* Scan & Answer panel — hidden in focus mode */}
      {saMode && !instantMode && (
        <div className="ctc-hide-in-focus" style={{
          margin: '0 0.65rem',
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 12,
          padding: '0.65rem 0.85rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700 }}>🧠 Scan & Answer</span>
              {saScanCount > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '1px 8px' }}>
                  {saScanCount} scan{saScanCount !== 1 ? 's' : ''} · {saLineCount}/{saMaxLines || (planUsage?.scan_answer_max_lines ?? '?')} lines
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {saScanCount > 0 && !saAnswering && (
                <button onClick={handleSaClear} style={{
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  color: '#e2e8f0', borderRadius: 7, padding: '0.25rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer',
                }}>Clear</button>
              )}
              <button
                onClick={handleStopAndAnswer}
                disabled={saScanCount === 0 || saAnswering}
                style={{
                  background: saScanCount === 0 || saAnswering ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg,#10b981,#059669)',
                  border: 'none', color: '#fff', borderRadius: 8,
                  padding: '0.3rem 0.75rem', fontSize: '0.78rem', fontWeight: 700,
                  cursor: saScanCount === 0 || saAnswering ? 'not-allowed' : 'pointer',
                  opacity: saScanCount === 0 ? 0.5 : 1,
                }}
              >
                {saAnswering ? '⏳ Answering...' : '✅ Stop & Answer'}
              </button>
            </div>
          </div>
          {saError && (
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#fca5a5' }}>⚠ {saError}</div>
          )}
        </div>
      )}

      <div className="ctc-hide-in-focus" style={s.statusBar}>
        <span style={{ flex: 1 }}>{statusMsg}</span>
        {lastLang && <span style={s.langTag}>{lastLang}{aiUsed ? ' ✨' : ''}</span>}
        {roi && <span style={{ ...s.langTag, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
          ROI {Math.round((roi.x2-roi.x1)*100)}%×{Math.round((roi.y2-roi.y1)*100)}%
        </span>}
        {syntaxOk === false && <span style={s.syntaxErr}>⚠ {syntaxErr}</span>}
        {syntaxOk === true  && <span style={s.syntaxOk}>✓ Syntax OK</span>}
      </div>

      {/* Output */}
      <div ref={outputWrapRef} className="ctc-output-wrap" style={s.outputWrap}>
        <div style={{ ...s.outputHeader, position: 'sticky', top: 0, background: 'rgba(10,10,20,0.95)', zIndex: 2 }}>
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
        <pre className="ctc-output-pre" style={s.output}>
          {outputText
            || (processingScan ? statusMsg || 'Processing scan...'
            : capturing ? 'Waiting for frames...'
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
                AI Fix
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
                  <option value="gemini_lite" disabled={!geminiAvailable}>{ocrModelLabel('gemini_lite')}</option>
                  <option value="haiku">{ocrModelLabel('haiku', true)}</option>
                  <option value="sonnet" disabled={!planUsage?.sonnet_allowed}>{ocrModelLabel('sonnet')} (Pro)</option>
                  <option value="gemini_flash" disabled={!geminiAvailable}>{ocrModelLabel('gemini_flash')}</option>
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

      {/* Scan & Answer Result Modal — only when not in focus/enlarge mode */}
      {showSaAnswer && !cameraEnlarged && (
        <div style={s.backdrop} onClick={() => setShowSaAnswer(false)}>
          <div style={{ ...s.modal, maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: saAnswerSource === 'instant' ? '#fde047' : '#34d399' }}>
                {saAnswerSource === 'instant' ? '⚡ Instant Answer' : '🧠 Scan & Answer Result'}
              </h3>
              <button onClick={() => setShowSaAnswer(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', margin: '0 0 0.75rem' }}>
              {saAnswerFilename}
            </p>
            <div style={{
              flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.4)', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.07)', padding: '0.75rem',
              fontSize: '0.8rem', fontFamily: '"JetBrains Mono","Fira Code",Consolas,monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e2e8f0',
              maxHeight: '55vh',
            }}>
              {saAnswerText || 'No answer generated.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigator.clipboard.writeText(saAnswerText).then(() => setStatusMsg('Answer copied!'))}
                style={s.smallBtn}
              >Copy Answer</button>
              {saAnswerUrl && (
                <a href={saAnswerUrl} download={saAnswerFilename} style={{ textDecoration: 'none' }}>
                  <button style={{ ...s.smallBtn, color: '#34d399', borderColor: 'rgba(16,185,129,0.4)' }}>↓ Download</button>
                </a>
              )}
              <button onClick={() => { setShowSaAnswer(false); setSaMode(false); saModeRef.current = false; emit('sa_clear'); setSaScanCount(0); setSaLineCount(0) }}
                style={{ ...s.cancelBtn, marginLeft: 'auto' }}>Done</button>
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
                <option value="gemini_lite" disabled={!geminiAvailable}>{ocrModelLabel('gemini_lite')}</option>
                <option value="haiku">{ocrModelLabel('haiku', true)}</option>
                <option value="sonnet" disabled={!planUsage?.sonnet_allowed}>{ocrModelLabel('sonnet')} (Pro)</option>
                <option value="gemini_flash" disabled={!geminiAvailable}>{ocrModelLabel('gemini_flash')}</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button onClick={() => setShowExport(false)} style={s.cancelBtn} disabled={exporting}>Cancel</button>
              <button onClick={handleExportSubmit} style={s.exportBtn} disabled={exporting}>
                {exporting ? 'Exporting...' : 'Export & Fix with AI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { minHeight: '100vh', background: '#1a1a2e', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', overflowX: 'hidden', maxWidth: '100vw' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.65rem', background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.08)', gap: 6, flexWrap: 'wrap' },
  logo:         { fontWeight: 800, fontSize: '1rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', flexShrink: 0 },
  hRight:       { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 auto', minWidth: 0 },
  historyLink:  { color: '#818cf8', fontSize: '0.72rem', textDecoration: 'none', whiteSpace: 'nowrap' },
  iconBtn:      { background: 'transparent', border: 'none', fontSize: '1rem', padding: '0.2rem', cursor: 'pointer', flexShrink: 0 },
  signOutBtn:   { background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, padding: '0.22rem 0.5rem', fontSize: '0.68rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  debugPanel:   { background: '#0a0a1a', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.5rem 0.75rem', maxHeight: 200, overflowY: 'auto' },
  settingsPanel:{ background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.6rem 0.85rem', display: 'flex', flexDirection: 'column', gap: 8 },
  row:          { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', gap: 8, minHeight: 32 },
  select:       { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', padding: '0.3rem 0.5rem', fontSize: '0.8rem', minWidth: 0, maxWidth: '55%', flexShrink: 0 },
  toggle:       { position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' },
  toggleInput:  { position: 'absolute', opacity: 0, width: 0, height: 0 },
  toggleSlider: { position: 'absolute', inset: 0, borderRadius: 12, transition: 'background 0.3s' },
  toggleKnob:   { position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' },
  toolbar:      { display: 'flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.65rem', background: 'rgba(0,0,0,0.2)', flexWrap: 'wrap' },
  toolBtn:      { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 7, padding: '0.22rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  modeTag:      { background: 'rgba(99,102,241,0.25)', color: '#818cf8', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', whiteSpace: 'nowrap' },
  roiBar:       { display: 'flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.75rem', background: 'rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(99,102,241,0.2)', flexWrap: 'wrap' },
  roiPresetBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#c7d2fe', borderRadius: 6, padding: '0.15rem 0.55rem', fontSize: '0.72rem', cursor: 'pointer' },
  roiHint:      { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', pointerEvents: 'none', zIndex: 12 },
  camWrap:      { position: 'relative', width: '100%', height: 'clamp(180px, 32vh, 280px)', minHeight: 0, flex: '0 0 auto', background: '#000', overflow: 'hidden' },
  video:        { width: '100%', height: '100%', display: 'block', objectFit: 'contain' },
  badge:        { position: 'absolute', top: 8, right: 8, border: '1px solid', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', background: 'rgba(0,0,0,0.65)', fontFamily: 'monospace' },
  glare:        { position: 'absolute', bottom: 8, left: 8, background: 'rgba(234,179,8,0.9)', color: '#000', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 },
  zoom:         { position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.75)', color: '#fbbf24', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem' },
  liveDot:      { position: 'absolute', top: 8, left: 8, background: 'rgba(239,68,68,0.85)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700 },
  controls:     { display: 'flex', gap: 8, padding: '0.45rem 0.75rem', justifyContent: 'center', flexWrap: 'wrap' },
  startBtn:     { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700, borderRadius: 10, minWidth: 96, cursor: 'pointer', border: 'none' },
  stopBtn:      { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700, borderRadius: 10, minWidth: 96, cursor: 'pointer', border: 'none' },
  photoBtn:     { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '0.5rem 0.85rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' },
  statusBar:    { padding: '0.4rem 1rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.3)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  langTag:      { background: 'rgba(99,102,241,0.25)', color: '#818cf8', borderRadius: 4, padding: '1px 6px', fontSize: '0.72rem' },
  syntaxErr:    { color: '#fca5a5', fontSize: '0.72rem' },
  syntaxOk:     { color: '#86efac', fontSize: '0.72rem' },
  outputWrap:   { margin: '0.5rem 0.75rem 0.75rem', background: 'rgba(0,0,0,0.4)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' },
  outputHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' },
  output:       { padding: '0.6rem 0.75rem', fontSize: '0.78rem', fontFamily: '"JetBrains Mono","Fira Code",Consolas,monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 'min(38vh, 320px)', overflowY: 'auto', color: '#e2e8f0', margin: 0 },
  smallBtn:     { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0', borderRadius: 7, padding: '0.2rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' },
  exportBtn:    { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', borderRadius: 8, padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: 'none' },
  cancelBtn:    { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 8, padding: '0.35rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer' },
  input:        { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', padding: '0.55rem 0.75rem', fontSize: '0.875rem', boxSizing: 'border-box' },
  backdrop:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:        { background: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400 },
}
