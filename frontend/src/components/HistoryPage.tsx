'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import AppNavMenu from '@/components/AppNavMenu'
import { loggedInNavItems } from '@/lib/appNav'
import {
  buildExportShareMessage,
  facebookShareUrl,
  linkedInShareUrl,
  nativeShare,
  SITE_URL,
  telegramShareUrl,
  twitterShareUrl,
  whatsAppShareUrl,
} from '@/lib/share'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

function fixSignedUrl(url: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    if (u.pathname.startsWith('/object/sign/')) {
      u.pathname = '/storage/v1' + u.pathname
      return u.toString()
    }
  } catch { /* ignore */ }
  return url
}

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

interface EditState {
  file: ExportFile
  content: string
  filename: string
  saving: boolean
  error: string
}

interface ShareState {
  file: ExportFile
}

export default function HistoryPage({ userId }: { userId: string }) {
  const [files, setFiles] = useState<ExportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [editor, setEditor] = useState<EditState | null>(null)
  const [shareTarget, setShareTarget] = useState<ShareState | null>(null)
  const [actionMsg, setActionMsg] = useState('')

  const getToken = async () => {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token || ''
  }

  const fetchFiles = async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const resp = await fetch(`${BACKEND_URL}/api/exports/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setFiles(data.files || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFiles() }, [userId])

  const loadFileContent = async (f: ExportFile) => {
    const url = fixSignedUrl(f.download_url)
    if (!url) throw new Error('No download URL available')
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text()
  }

  const openViewer = async (f: ExportFile) => {
    setViewer({ file: f, content: null, loading: true, error: '' })
    try {
      const text = await loadFileContent(f)
      setViewer(v => v ? { ...v, content: text, loading: false } : null)
    } catch (e: unknown) {
      setViewer(v => v ? { ...v, loading: false, error: e instanceof Error ? e.message : 'Load failed' } : null)
    }
  }

  const openEditor = async (f: ExportFile) => {
    setEditor({ file: f, content: '', filename: f.name, saving: false, error: '' })
    try {
      const text = await loadFileContent(f)
      setEditor({ file: f, content: text, filename: f.name, saving: false, error: '' })
    } catch (e: unknown) {
      setEditor({ file: f, content: '', filename: f.name, saving: false, error: e instanceof Error ? e.message : 'Load failed' })
    }
  }

  const saveEdit = async () => {
    if (!editor) return
    setEditor(e => e ? { ...e, saving: true, error: '' } : null)
    try {
      const token = await getToken()
      const resp = await fetch(
        `${BACKEND_URL}/api/exports/${userId}/${encodeURIComponent(editor.file.name)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editor.content, new_name: editor.filename }),
        },
      )
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      setEditor(null)
      setActionMsg(`Saved ${data.filename}`)
      await fetchFiles()
      setTimeout(() => setActionMsg(''), 4000)
    } catch (e: unknown) {
      setEditor(ed => ed ? { ...ed, saving: false, error: e instanceof Error ? e.message : 'Save failed' } : null)
    }
  }

  const deleteFile = async (f: ExportFile) => {
    if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return
    try {
      const token = await getToken()
      const resp = await fetch(
        `${BACKEND_URL}/api/exports/${userId}/${encodeURIComponent(f.name)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      )
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      setViewer(v => (v?.file.name === f.name ? null : v))
      setEditor(e => (e?.file.name === f.name ? null : e))
      setShareTarget(s => (s?.file.name === f.name ? null : s))
      setActionMsg(`Deleted ${f.name}`)
      await fetchFiles()
      setTimeout(() => setActionMsg(''), 4000)
    } catch (e: unknown) {
      alert('Delete failed: ' + (e instanceof Error ? e.message : 'Unknown error'))
    }
  }

  const downloadFile = async (f: ExportFile) => {
    const url = fixSignedUrl(f.download_url)
    if (!url) { alert('Download URL not available'); return }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = f.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objUrl)
    } catch (e: unknown) {
      alert('Download failed: ' + (e instanceof Error ? e.message : 'Unknown error'))
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setActionMsg('Copied to clipboard')
      setTimeout(() => setActionMsg(''), 3000)
    } catch { /* ignore */ }
  }

  const handleNativeShare = async (f: ExportFile) => {
    const msg = buildExportShareMessage(f.name)
    try {
      const ok = await nativeShare({ title: f.name, text: msg, url: SITE_URL })
      if (!ok) setShareTarget({ file: f })
    } catch {
      setShareTarget({ file: f })
    }
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

  const handleSignOut = async () => {
    await createClient().auth.signOut()
    window.location.href = '/'
  }

  const shareMessage = shareTarget ? buildExportShareMessage(shareTarget.file.name) : ''

  return (
    <div style={s.root}>
      <div style={s.header}>
        <a href="/app" style={s.backLink}>← Back to App</a>
        <h1 style={s.title}>My Exports</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={fetchFiles} disabled={loading} style={s.refreshBtn}>
            {loading ? '...' : '↻ Refresh'}
          </button>
          <AppNavMenu items={loggedInNavItems(handleSignOut)} />
        </div>
      </div>

      {actionMsg && <p style={s.actionMsg}>{actionMsg}</p>}

      <div style={s.content}>
        {loading && <p style={s.msg}>Loading your exports...</p>}
        {error && <p style={s.errMsg}>Error: {error}</p>}
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
              <button style={s.viewBtn} onClick={() => openViewer(f)} title="View">👁</button>
              <button style={s.editBtn} onClick={() => openEditor(f)} title="Edit">✎</button>
              <button style={s.shareBtn} onClick={() => handleNativeShare(f)} title="Share">⎘</button>
              <button style={s.downloadBtn} onClick={() => downloadFile(f)} title="Download">↓</button>
              <button style={s.deleteBtn} onClick={() => deleteFile(f)} title="Delete">🗑</button>
            </div>
          </div>
        ))}
      </div>

      {viewer && (
        <div style={s.backdrop} onClick={() => setViewer(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
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
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' as const }}>
                {viewer.content && (
                  <button style={s.copyBtn} onClick={() => copyToClipboard(viewer.content!)}>Copy</button>
                )}
                <button style={s.shareBtn} onClick={() => handleNativeShare(viewer.file)}>Share</button>
                <button style={s.editBtn} onClick={() => { setViewer(null); openEditor(viewer.file) }}>Edit</button>
                <button style={s.dlModalBtn} onClick={() => downloadFile(viewer.file)}>↓ Download</button>
                <button style={s.closeBtn} onClick={() => setViewer(null)}>✕</button>
              </div>
            </div>
            <div style={s.codeWrap}>
              {viewer.loading && <p style={s.loadingMsg}>Loading…</p>}
              {viewer.error && <p style={s.errMsg}>Error: {viewer.error}</p>}
              {viewer.content !== null && !viewer.loading && (
                <pre style={s.codeBlock}>{viewer.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {editor && (
        <div style={s.backdrop} onClick={() => !editor.saving && setEditor(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={s.modalTitle}>Edit file</p>
                <input
                  value={editor.filename}
                  onChange={e => setEditor(ed => ed ? { ...ed, filename: e.target.value } : null)}
                  style={s.filenameInput}
                  spellCheck={false}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button style={s.dlModalBtn} onClick={saveEdit} disabled={editor.saving}>
                  {editor.saving ? 'Saving…' : 'Save'}
                </button>
                <button style={s.closeBtn} onClick={() => setEditor(null)} disabled={editor.saving}>✕</button>
              </div>
            </div>
            {editor.error && <p style={{ ...s.errMsg, padding: '0.5rem 1.2rem', margin: 0 }}>{editor.error}</p>}
            <textarea
              value={editor.content}
              onChange={e => setEditor(ed => ed ? { ...ed, content: e.target.value } : null)}
              style={s.editArea}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {shareTarget && (
        <div style={s.backdrop} onClick={() => setShareTarget(null)}>
          <div style={s.shareModal} onClick={e => e.stopPropagation()}>
            <p style={s.shareTitle}>Share {shareTarget.file.name}</p>
            <p style={s.sharePreview}>{shareMessage}</p>
            <div style={s.shareGrid}>
              <a href={whatsAppShareUrl(shareMessage)} target="_blank" rel="noopener noreferrer" style={s.shareLink}>WhatsApp</a>
              <a href={twitterShareUrl(shareMessage)} target="_blank" rel="noopener noreferrer" style={s.shareLink}>X / Twitter</a>
              <a href={linkedInShareUrl()} target="_blank" rel="noopener noreferrer" style={s.shareLink}>LinkedIn</a>
              <a href={facebookShareUrl()} target="_blank" rel="noopener noreferrer" style={s.shareLink}>Facebook</a>
              <a href={telegramShareUrl(shareMessage)} target="_blank" rel="noopener noreferrer" style={s.shareLink}>Telegram</a>
            </div>
            <button style={s.copyBtn} onClick={() => copyToClipboard(shareMessage)}>Copy message</button>
            <button style={s.closeBtn} onClick={() => setShareTarget(null)}>Close</button>
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
    flexWrap: 'wrap' as const,
  },
  backLink: { color: '#818cf8', textDecoration: 'none', fontSize: '0.875rem' },
  title: { fontWeight: 700, fontSize: '1.2rem' },
  content: { maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem' },
  actionMsg: {
    textAlign: 'center',
    color: '#4ade80',
    fontSize: '0.85rem',
    padding: '0.5rem 1rem',
    margin: 0,
  },
  msg: { color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  errMsg: { color: '#fca5a5', textAlign: 'center' },
  loadingMsg: { color: 'rgba(255,255,255,0.4)', padding: '2rem', textAlign: 'center' },
  empty: { textAlign: 'center', padding: '4rem 1rem', color: 'rgba(255,255,255,0.5)' },
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
    flexWrap: 'wrap' as const,
  },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', flex: 1, minWidth: 160 },
  cardActions: { display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' as const },
  icon: { fontSize: '1.5rem', flexShrink: 0 },
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
  viewBtn: btnStyle('rgba(99,102,241,0.2)', '#a5b4fc', 'rgba(99,102,241,0.35)'),
  editBtn: btnStyle('rgba(234,179,8,0.15)', '#fde047', 'rgba(234,179,8,0.35)'),
  shareBtn: btnStyle('rgba(14,165,233,0.15)', '#7dd3fc', 'rgba(14,165,233,0.35)'),
  deleteBtn: btnStyle('rgba(239,68,68,0.15)', '#fca5a5', 'rgba(239,68,68,0.35)'),
  downloadBtn: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    borderRadius: 8,
    padding: '0.4rem 0.65rem',
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
  shareModal: {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  shareTitle: { fontWeight: 700, margin: 0, fontSize: '1rem' },
  sharePreview: {
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 1.5,
    margin: 0,
    padding: '0.65rem',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  shareGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  shareLink: {
    display: 'block',
    textAlign: 'center',
    padding: '0.55rem',
    borderRadius: 8,
    background: 'rgba(99,102,241,0.15)',
    border: '1px solid rgba(99,102,241,0.3)',
    color: '#c7d2fe',
    textDecoration: 'none',
    fontSize: '0.82rem',
    fontWeight: 600,
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.2rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    gap: 12,
    flexWrap: 'wrap' as const,
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
  modalMeta: { color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', margin: 0 },
  filenameInput: {
    width: '100%',
    marginTop: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7,
    color: '#e2e8f0',
    padding: '0.35rem 0.55rem',
    fontSize: '0.85rem',
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
  codeWrap: { flex: 1, overflowY: 'auto', background: '#080c14' },
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
  editArea: {
    flex: 1,
    minHeight: 320,
    margin: 0,
    padding: '1rem 1.2rem',
    background: '#080c14',
    border: 'none',
    color: '#e2e8f0',
    fontSize: '0.82rem',
    lineHeight: 1.7,
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
    resize: 'vertical' as const,
    outline: 'none',
  },
}

function btnStyle(bg: string, color: string, border: string): React.CSSProperties {
  return {
    background: bg,
    color,
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: '0.4rem 0.55rem',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
  }
}
