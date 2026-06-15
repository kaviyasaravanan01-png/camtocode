'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import AppNavMenu from '@/components/AppNavMenu'
import { guestNavItems } from '@/lib/appNav'
import {
  DEFAULT_SCROLL_SETTINGS,
  loadScrollSettings,
  saveScrollSettings,
  type ScrollReaderSettings,
} from '@/lib/scrollReaderSettings'

function formatLineRange(start: number, end: number, total: number) {
  if (total === 0) return 'No file loaded'
  return `Lines ${start + 1}–${end} of ${total}`
}

export default function ScrollReader() {
  const [settings, setSettings] = useState<ScrollReaderSettings>(DEFAULT_SCROLL_SETTINGS)
  const [lines, setLines] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [startLine, setStartLine] = useState(0)
  const [visibleLines, setVisibleLines] = useState(20)
  const [sessionActive, setSessionActive] = useState(false)
  const [timerPaused, setTimerPaused] = useState(false)
  const [keyboardPaused, setKeyboardPaused] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Open a local file to begin.')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const lineProbeRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSettings(loadScrollSettings())
  }, [])

  const persistSettings = useCallback((next: ScrollReaderSettings) => {
    setSettings(next)
    saveScrollSettings(next)
  }, [])

  const patchSettings = useCallback(
    (patch: Partial<ScrollReaderSettings>) => {
      persistSettings({ ...settings, ...patch })
    },
    [settings, persistSettings]
  )

  const totalLines = lines.length
  const endLine = totalLines === 0 ? 0 : Math.min(startLine + visibleLines, totalLines)
  const linesRemaining = Math.max(0, totalLines - startLine)
  const stepSize = settings.autoDetectLines ? visibleLines : Math.max(1, settings.linesPerStep)

  const measureVisibleLines = useCallback(() => {
    const viewport = viewportRef.current
    const probe = lineProbeRef.current
    if (!viewport || !probe) return
    const lh = probe.offsetHeight
    if (lh <= 0) return
    const innerH = viewport.clientHeight - settings.padding * 2
    const count = Math.max(1, Math.floor(innerH / lh))
    setVisibleLines(count)
  }, [settings.padding])

  const effectiveFontSize = Math.round(settings.fontSize * ((settings.zoomPercent ?? 100) / 100))

  useLayoutEffect(() => {
    measureVisibleLines()
  }, [measureVisibleLines, effectiveFontSize, settings.lineHeight, settings.fontWeight, settings.padding, lines.length])

  useEffect(() => {
    const ro = new ResizeObserver(() => measureVisibleLines())
    if (viewportRef.current) ro.observe(viewportRef.current)
    window.addEventListener('resize', measureVisibleLines)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measureVisibleLines)
    }
  }, [measureVisibleLines])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scrollToLine = useCallback((lineIndex: number) => {
    const clamped = Math.max(0, Math.min(lineIndex, Math.max(0, totalLines - 1)))
    setStartLine(clamped)
  }, [totalLines])

  const advanceSection = useCallback(() => {
    if (totalLines === 0) {
      setStatusMsg('Load a file first.')
      return false
    }
    const remaining = totalLines - startLine
    if (remaining <= 0) {
      setStatusMsg('End of file reached.')
      setSessionActive(false)
      stopTimer()
      return false
    }
    const step = Math.min(stepSize, remaining)
    const next = startLine + step
    if (next >= totalLines) {
      setStatusMsg(`Final section — lines ${startLine + 1}–${totalLines}`)
      setSessionActive(false)
      stopTimer()
      return false
    }
    setStartLine(next)
    const shown = Math.min(visibleLines, totalLines - next)
    setStatusMsg(`Showing lines ${next + 1}–${next + shown}`)
    return true
  }, [totalLines, startLine, stepSize, visibleLines, stopTimer])

  const startTimerLoop = useCallback(() => {
    stopTimer()
    if (settings.scrollMode !== 'timer') return
    setSessionActive(true)
    setTimerPaused(false)
    timerRef.current = setInterval(() => {
      advanceSection()
    }, Math.max(2, settings.timerSeconds) * 1000)
  }, [settings.scrollMode, settings.timerSeconds, advanceSection, stopTimer])

  const handleOpenFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const split = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
      setLines(split)
      setFileName(file.name)
      setStartLine(0)
      setSessionActive(false)
      stopTimer()
      setStatusMsg(`Loaded ${split.length} lines from ${file.name}`)
      requestAnimationFrame(() => {
        scrollToLine(0)
        measureVisibleLines()
      })
    }
    reader.onerror = () => setStatusMsg('Could not read file.')
    reader.readAsText(file)
  }, [scrollToLine, measureVisibleLines, stopTimer])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleOpenFile(file)
    e.target.value = ''
  }

  const terminateSession = useCallback(() => {
    setSessionActive(false)
    setTimerPaused(false)
    stopTimer()
    setStatusMsg('Session stopped.')
  }, [stopTimer])

  const handleStartSession = useCallback(() => {
    if (settings.scrollMode === 'timer') {
      if (!sessionActive) {
        setStatusMsg(`Timer started — every ${settings.timerSeconds}s`)
        startTimerLoop()
      } else if (timerPaused) {
        setTimerPaused(false)
        startTimerLoop()
        setStatusMsg('Timer resumed.')
      }
    } else {
      setSessionActive(true)
      advanceSection()
    }
  }, [settings.scrollMode, settings.timerSeconds, sessionActive, timerPaused, startTimerLoop, advanceSection])

  const handlePause = useCallback(() => {
    if (settings.scrollMode === 'timer') {
      setTimerPaused(true)
      stopTimer()
      setStatusMsg('Timer paused.')
    }
  }, [settings.scrollMode, stopTimer])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      if (settings.scrollMode === 'keyboard') {
        const k = e.key.toLowerCase()
        if (k === 's') {
          e.preventDefault()
          if (keyboardPaused) {
            setStatusMsg('Paused — press P to resume first.')
            return
          }
          if (!sessionActive) setSessionActive(true)
          advanceSection()
        } else if (k === 'p') {
          e.preventDefault()
          setKeyboardPaused(p => {
            const next = !p
            setStatusMsg(next ? 'Paused — press S when ready to advance.' : 'Resumed.')
            return next
          })
        } else if (k === 't') {
          e.preventDefault()
          terminateSession()
          setKeyboardPaused(false)
          scrollToLine(0)
          setStatusMsg('Session terminated — back to top.')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settings.scrollMode, sessionActive, keyboardPaused, advanceSection, handlePause, terminateSession, scrollToLine])

  useEffect(() => () => stopTimer(), [stopTimer])

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = async () => {
    if (!rootRef.current) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await rootRef.current.requestFullscreen()
    }
  }

  const visibleSlice = useMemo(() => {
    if (totalLines === 0) return []
    const windowSize = settings.autoDetectLines ? visibleLines : Math.max(visibleLines, stepSize)
    const end = Math.min(startLine + windowSize, totalLines)
    return lines.slice(startLine, end)
  }, [lines, startLine, visibleLines, totalLines, settings.autoDetectLines, stepSize])

  const adjustZoom = (delta: number) => {
    const next = Math.max(50, Math.min(200, settings.zoomPercent + delta))
    patchSettings({ zoomPercent: next })
    setStatusMsg(`Zoom ${next}%`)
  }

  const lineStyle: React.CSSProperties = {
    fontFamily: settings.fontFamily,
    fontSize: effectiveFontSize,
    fontWeight: settings.fontWeight,
    lineHeight: settings.lineHeight,
    color: settings.textColor,
  }

  const FONT_PRESETS = [
    { label: 'Monospace (default)', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
    { label: 'Consolas', value: 'Consolas, monospace' },
    { label: 'Courier', value: 'Courier New, Courier, monospace' },
    { label: 'System UI', value: 'system-ui, sans-serif' },
  ]

  const navItems = guestNavItems()

  return (
    <div
      ref={rootRef}
      className={`ctc-scroll-reader${isFullscreen ? ' ctc-scroll-reader--fs' : ''}`}
      style={{ background: settings.bgColor, color: settings.textColor }}
    >
      <header className="ctc-scroll-header">
        <div className="ctc-scroll-header-left">
          <Link href="/" className="ctc-scroll-logo">CamToCode</Link>
          <span className="ctc-scroll-badge">Scroll Automation</span>
        </div>
        <div className="ctc-scroll-header-right">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.py,.js,.ts,.tsx,.jsx,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.sql,.json,.yaml,.yml,.md,.html,.css,.xml,.sh,.bat,.vue,.swift,.kt,.scala,.r,.m,.lua,.pl,.tex,.log,.ini,.cfg,.env,.toml"
            className="ctc-scroll-file-input"
            onChange={handleFileInput}
          />
          <button type="button" className="ctc-scroll-btn ctc-scroll-btn--primary" onClick={() => fileInputRef.current?.click()}>
            Open file
          </button>
          {fileName && <span className="ctc-scroll-filename" title={fileName}>{fileName}</span>}
          <div className="ctc-scroll-zoom" title="Zoom for camera capture">
            <button type="button" className="ctc-scroll-btn ctc-scroll-zoom-btn" onClick={() => adjustZoom(-10)} aria-label="Zoom out">−</button>
            <span className="ctc-scroll-zoom-label">{settings.zoomPercent}%</span>
            <button type="button" className="ctc-scroll-btn ctc-scroll-zoom-btn" onClick={() => adjustZoom(10)} aria-label="Zoom in">+</button>
          </div>
          <button type="button" className="ctc-scroll-btn" onClick={() => setShowSettings(v => !v)}>
            {showSettings ? 'Hide settings' : 'Settings'}
          </button>
          <button type="button" className="ctc-scroll-btn" onClick={toggleFullscreen}>
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          <AppNavMenu items={navItems} />
        </div>
      </header>

      {showSettings && (
        <div className="ctc-scroll-settings">
          <div className="ctc-scroll-settings-grid">
            <label>
              Background
              <input type="color" value={settings.bgColor} onChange={e => patchSettings({ bgColor: e.target.value })} />
            </label>
            <label>
              Text color
              <input type="color" value={settings.textColor} onChange={e => patchSettings({ textColor: e.target.value })} />
            </label>
            <label>
              Font size
              <input type="range" min={10} max={28} value={settings.fontSize} onChange={e => patchSettings({ fontSize: Number(e.target.value) })} />
              <span>{settings.fontSize}px ({effectiveFontSize}px with zoom)</span>
            </label>
            <label>
              Zoom
              <input type="range" min={50} max={200} step={5} value={settings.zoomPercent} onChange={e => patchSettings({ zoomPercent: Number(e.target.value) })} />
              <span>{settings.zoomPercent}%</span>
            </label>
            <label>
              Font family
              <select value={settings.fontFamily} onChange={e => patchSettings({ fontFamily: e.target.value })}>
                {FONT_PRESETS.map(f => (
                  <option key={f.label} value={f.value}>{f.label}</option>
                ))}
              </select>
            </label>
            <label>
              Line height
              <input type="range" min={1.1} max={2.2} step={0.05} value={settings.lineHeight} onChange={e => patchSettings({ lineHeight: Number(e.target.value) })} />
              <span>{settings.lineHeight}</span>
            </label>
            <label>
              Padding
              <input type="range" min={0} max={48} value={settings.padding} onChange={e => patchSettings({ padding: Number(e.target.value) })} />
              <span>{settings.padding}px</span>
            </label>
            <label className="ctc-scroll-check">
              <input type="checkbox" checked={settings.fontWeight === 'bold'} onChange={e => patchSettings({ fontWeight: e.target.checked ? 'bold' : 'normal' })} />
              Bold text
            </label>
            <label className="ctc-scroll-check">
              <input type="checkbox" checked={settings.showLineNumbers} onChange={e => patchSettings({ showLineNumbers: e.target.checked })} />
              Show line numbers
            </label>
            <label className="ctc-scroll-check">
              <input type="checkbox" checked={settings.autoDetectLines} onChange={e => patchSettings({ autoDetectLines: e.target.checked })} />
              Auto lines per step (from screen)
            </label>
            {!settings.autoDetectLines && (
              <label>
                Lines per step
                <input type="number" min={1} max={500} value={settings.linesPerStep} onChange={e => patchSettings({ linesPerStep: Math.max(1, Number(e.target.value) || 1) })} />
              </label>
            )}
            <label>
              Scroll mode
              <select value={settings.scrollMode} onChange={e => patchSettings({ scrollMode: e.target.value as 'timer' | 'keyboard' })}>
                <option value="keyboard">Keyboard (S / P / T)</option>
                <option value="timer">Timer (auto)</option>
              </select>
            </label>
            {settings.scrollMode === 'timer' && (
              <label>
                Timer interval (seconds)
                <input type="number" min={2} max={120} value={settings.timerSeconds} onChange={e => patchSettings({ timerSeconds: Math.max(2, Number(e.target.value) || 10) })} />
              </label>
            )}
          </div>
          <p className="ctc-scroll-settings-hint">
            Settings are saved in your browser. No data is sent to any server.
          </p>
        </div>
      )}

      <div className="ctc-scroll-status-bar">
        <span>{formatLineRange(startLine, endLine, totalLines)}</span>
        <span>Step: {stepSize} lines{settings.autoDetectLines ? ' (auto)' : ''}</span>
        <span>{linesRemaining > 0 ? `${linesRemaining} lines left` : '—'}</span>
        <span className="ctc-scroll-status-msg">{statusMsg}</span>
      </div>

      {settings.scrollMode === 'keyboard' && (
        <div className="ctc-scroll-kbd-hint">
          <strong>Keyboard mode:</strong> click this page once, then <kbd>S</kbd> next section · <kbd>P</kbd> pause · <kbd>T</kbd> stop &amp; reset to top
          {sessionActive && <span className="ctc-scroll-session-dot"> Session active</span>}
        </div>
      )}

      <div
        ref={viewportRef}
        className="ctc-scroll-viewport"
        style={{ padding: settings.padding }}
      >
        <div ref={lineProbeRef} className="ctc-scroll-line-probe" style={lineStyle} aria-hidden>
          probe
        </div>
        {totalLines === 0 ? (
          <div className="ctc-scroll-empty">
            <p style={{ fontSize: '2.5rem', marginBottom: 12 }}>📄</p>
            <p>Open a code file from your computer to display it here.</p>
            <p className="ctc-scroll-empty-sub">Use with CamToCode on your phone — see <Link href="/docs">Docs</Link> for the full workflow.</p>
            <button type="button" className="ctc-scroll-btn ctc-scroll-btn--primary" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </button>
          </div>
        ) : (
          <pre className="ctc-scroll-code" style={lineStyle}>
            {visibleSlice.map((line, i) => {
              const lineNo = startLine + i + 1
              return (
                <div key={lineNo} className="ctc-scroll-line">
                  {settings.showLineNumbers && (
                    <span className="ctc-scroll-ln" style={{ color: settings.textColor, opacity: 0.45 }}>
                      {String(lineNo).padStart(String(totalLines).length, ' ')}
                    </span>
                  )}
                  <span className="ctc-scroll-lt">{line || ' '}</span>
                </div>
              )
            })}
          </pre>
        )}
      </div>

      {settings.scrollMode === 'timer' && totalLines > 0 && (
        <footer className="ctc-scroll-footer">
          {!sessionActive ? (
            <button type="button" className="ctc-scroll-btn ctc-scroll-btn--primary" onClick={handleStartSession}>
              ▶ Start timer
            </button>
          ) : (
            <>
              <button type="button" className="ctc-scroll-btn" onClick={handlePause} disabled={timerPaused}>
                ⏸ Pause
              </button>
              <button type="button" className="ctc-scroll-btn" onClick={() => { terminateSession(); scrollToLine(0) }}>
                ■ Stop
              </button>
              <button type="button" className="ctc-scroll-btn" onClick={advanceSection}>
                Skip to next section
              </button>
            </>
          )}
          <span className="ctc-scroll-footer-hint">Auto-advances every {settings.timerSeconds}s · last chunk shows only remaining lines</span>
        </footer>
      )}

      {settings.scrollMode === 'keyboard' && totalLines > 0 && (
        <footer className="ctc-scroll-footer ctc-scroll-footer--kbd">
          <span>Use <kbd>S</kbd> to advance each section after your phone captures the screen. Match step size to your camera crop in CamToCode.</span>
          <Link href="/docs" className="ctc-scroll-docs-link">How to use with CamToCode →</Link>
        </footer>
      )}
    </div>
  )
}
