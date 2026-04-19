'use client'
import { useEffect, useState } from 'react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

interface ExportFile {
  name: string
  created_at: string
  size: number
  download_url: string
}

export default function HistoryPage({ userId }: { userId: string }) {
  const [files,   setFiles]   = useState<ExportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const { createClient } = await import('@/lib/supabase')
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
    fetchFiles()
  }, [userId])

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
              <div>
                <p style={s.fileName}>{f.name}</p>
                <p style={s.fileMeta}>
                  {formatDate(f.created_at)} · {formatSize(f.size)}
                </p>
              </div>
            </div>
            <a href={f.download_url} download={f.name} style={s.downloadBtn}>
              ↓ Download
            </a>
          </div>
        ))}
      </div>
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
  backLink: {
    color: '#818cf8',
    textDecoration: 'none',
    fontSize: '0.875rem',
  },
  title: {
    fontWeight: 700,
    fontSize: '1.2rem',
  },
  content: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '1.5rem 1rem',
  },
  msg:    { color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  errMsg: { color: '#fca5a5', textAlign: 'center' },
  empty: {
    textAlign: 'center',
    padding: '4rem 1rem',
    color: 'rgba(255,255,255,0.5)',
  },
  emptyNote: {
    marginTop: 8,
    fontSize: '0.875rem',
  },
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
  },
  icon: { fontSize: '1.5rem', flexShrink: 0 },
  fileName: {
    fontWeight: 600,
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 250,
  },
  fileMeta: { color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: 2 },
  downloadBtn: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    borderRadius: 8,
    padding: '0.4rem 0.9rem',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    flexShrink: 0,
  },
}
