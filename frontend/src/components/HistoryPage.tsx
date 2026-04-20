'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

interface ExportFile {
  name: string
  created_at: string
  size: number
  download_url: string
}

interface ViewerState {
  file: ExportFile
  content: string | null
  loading: boolean
  error: string
}

export default function HistoryPage({ userId }: { userId: string }) {
  const [files,   setFiles]   = useState<ExportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [viewer,  setViewer]  = useState<ViewerState | null>(null)

  const fetchFiles = async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const resp = await fetch(`${BACKEND_URL}/api/exports/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setFiles(data.files || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFiles() }, [userId])

  const openViewer = async (f: ExportFile) => {
    setViewer({ file: f, content: null, loading: true, error: '' })
    try {
      if (!f.download_url) throw new Error('No download URL available')
      const res = await fetch(f.download_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setViewer(v => v ? { ...v, content: text, loading: false } : null)
    } catch (e: any) {
      setViewer(v => v ? { ...v, loading: false, error: e.message } : null)
    }
  }

  const downloadFile = async (f: ExportFile) => {
    if (!f.download_url) { alert('Download URL not available'); return }
    try {
      const res = await fetch(f.download_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = f.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) { alert('Download failed: ' + e.message) }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch { /* ignore */ }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const formatDate = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
  }

  const getLangIcon = (name: string) => {
    const ext = name.split('.').pop()
    const map: Record<string, string> = {
      py: '🐍', js: '🟨', ts: '🔷', tsx: '⚛️',
      java: '☕', go: '🐹', rs: '🦀', cpp: '⚙️',
      sql: '🗄️', css: '🎨', html: '🌐', txt: '📄',
    }
    return map[ext || ''] || '📄'
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <a href="/app" style={s.backLink}>← Back to App</a>
        <h1 style={s.title}>My Exports</h1>
        <button onClick={fetchFiles} disabled={loading} style={s.refreshBtn}>
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      <div style={s.content}>
        {loading && <p style={s.msg}>Loading your exports...</p>}
        {error   && <p style={s.errMsg}>Error: {error}</p>}
        {!loading && !error && files.length === 0 && (
          <div style={s.empty}>
            <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📁</p>
            <p>No exports yet.</p>
            <p style={s.emptyNote}>Use the camera app to capture code, then export a session.</p>
            <a href="/app" style={s.ctaLink}>Go to Camera App</a>
          </div>
        )}
        {files.map(f => (
          <div key={f.name} style={s.card}>
            <div style={s.cardLeft}>
              <span style={s.icon}>{getLangIcon(f.name)}</span>
              <div style={{ overflow: 'hidden' }}>
                <p style={s.fileName}>{f.name}</p>
                <p style={s.fileMeta}>
                  {formatDate(f.created_at)} · {formatSize(f.size)}
                </p>
              </div>
            </div>
            <div style={s.cardActions}>
              <button style={s.viewBtn} onClick={() => openViewer(f)}>
                👁 View
              </button>
              <button style={s.downloadBtn} onClick={() => downloadFile(f)}>
                ↓ Download
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Viewer Modal */}
      {viewer && (
        <div style={s.backdrop} onClick={() => setViewer(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={s.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                <span style={{ fontSize: '1.2rem' }}>{getLangIcon(viewer.file.name)}</span>
                <div style={{ overflow: 'hidden' }}>
                  <p style={s.modalTitle}>{viewer.file.name}</p>
                  <p style={s.modalMeta}>
                    {formatDate(viewer.file.created_at)} · {formatSize(viewer.file.size)}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {viewer.content && (
                  <button
                    style={s.copyBtn}
                    onClick={() => copyToClipboard(viewer.content!)}
                  >
                    Copy
                  </button>
                )}
                <button
                  style={s.dlModalBtn}
                  onClick={() => downloadFile(viewer.file)}
                >
                  ↓ Download
                </button>
                <button style={s.closeBtn} onClick={() => setViewer(null)}>✕</button>
              </div>
            </div>

            {/* Content */}
            <div style={s.codeWrap}>
              {viewer.loading && (
                <p style={{ color: 'rgba(255,255,255,0.4)', padding: '2rem', textAlign: 'center' }}>
                  Loading…
                </p>
              )}
              {viewer.error && (
                <p style={{ color: '#f87171', padding: '2rem', textAlign: 'center' }}>
                  Error: {viewer.error}
                </p>
              )}
              {viewer.content !== null && !viewer.loading && (
                <pre style={s.codeBlock}>{viewer.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#1a1a2e',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    padding: '1rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  backLink: { color: '#818cf8', textDecoration: 'none', fontSize: '0.875rem' },
  title:    { fontWeight: 700, fontSize: '1.2rem' },
  content:  { maxWidth: 640, margin: '0 auto', padding: '1.5rem 1rem' },
  msg:      { color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  errMsg:   { color: '#fca5a5', textAlign: 'center' },
  empty: {
    textAlign: 'center',
    padding: '4rem 1rem',
    color: 'rgba(255,255,255,0.5)',
  },
  emptyNote: { marginTop: 8, fontSize: '0.875rem' },
  ctaLink: {
    display: 'inline-block',
    marginTop: '1.5rem',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    borderRadius: 10,
    padding: '0.6rem 1.5rem',
    textDecoration: 'none',
    fontWeight: 600,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: '0.875rem 1rem',
    marginBottom: '0.75rem',
    gap: 12,
  },
  cardLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    flex: 1,
  },
  cardActions: { display: 'flex', gap: 8, flexShrink: 0 },
  icon:     { fontSize: '1.5rem', flexShrink: 0 },
  fileName: {
    fontWeight: 600,
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 280,
    margin: 0,
  },
  fileMeta: { color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: 2, marginBottom: 0 },
  viewBtn: {
    background: 'rgba(99,102,241,0.2)',
    color: '#a5b4fc',
    border: '1px solid rgba(99,102,241,0.35)',
    borderRadius: 8,
    padding: '0.4rem 0.8rem',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  downloadBtn: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    borderRadius: 8,
    padding: '0.4rem 0.9rem',
    border: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  refreshBtn: {
    marginLeft: 'auto',
    background: 'rgba(255,255,255,0.08)',
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: '0.35rem 0.9rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },

  // Modal
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  modal: {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    width: '100%',
    maxWidth: 820,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.2rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    gap: 12,
  },
  modalTitle: {
    fontWeight: 700,
    fontSize: '0.95rem',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 320,
  },
  modalMeta: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: '0.72rem',
    margin: 0,
  },
  copyBtn: {
    background: 'rgba(255,255,255,0.08)',
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7,
    padding: '0.3rem 0.75rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  dlModalBtn: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '0.3rem 0.75rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.07)',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7,
    padding: '0.3rem 0.6rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  codeWrap: {
    flex: 1,
    overflowY: 'auto',
    background: '#080c14',
  },
  codeBlock: {
    margin: 0,
    padding: '1.2rem 1.4rem',
    fontSize: '0.82rem',
    lineHeight: 1.7,
    color: '#e2e8f0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
  },
}
