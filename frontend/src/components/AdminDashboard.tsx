'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

interface UserRow {
  id: string
  email: string
  created_at: string
  plan: string
  plan_expires_at: string | null
  scans_today: number
  ai_scans_today: number
  scans_month: number
  ai_fixes_month: number
  haiku_fix_tok: number
  sonnet_fix_tok: number
  files_saved: number
}

interface FileRow {
  name: string
  created_at: string
  size: number
  download_url: string
}

const PLAN_COLOR: Record<string, string> = {
  free: '#64748b', starter: '#0ea5e9', pro: '#8b5cf6', admin: '#f59e0b',
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
  n >= 1_000     ? `${(n / 1_000).toFixed(1)}K`     : String(n)

export default function AdminDashboard({ userEmail }: { userEmail: string }) {
  const [users,        setUsers]        = useState<UserRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [userFiles,    setUserFiles]    = useState<FileRow[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [planChanging, setPlanChanging] = useState<string | null>(null)
  const [search,       setSearch]       = useState('')

  const getToken = async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  const fetchUsers = async () => {
    setLoading(true); setError('')
    const token = await getToken()
    try {
      const r = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setUsers(d.users || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const fetchFiles = async (u: UserRow) => {
    setSelectedUser(u); setFilesLoading(true); setUserFiles([])
    const token = await getToken()
    try {
      const r = await fetch(`${BACKEND_URL}/api/admin/users/${u.id}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setUserFiles(d.files || [])
    } catch { setUserFiles([]) }
    finally { setFilesLoading(false) }
  }

  const changePlan = async (userId: string, plan: string) => {
    setPlanChanging(userId)
    const token = await getToken()
    try {
      const r = await fetch(`${BACKEND_URL}/api/admin/set_plan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, plan }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u))
      if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, plan } : prev)
    } catch (e: any) { alert('Plan change failed: ' + e.message) }
    finally { setPlanChanging(null) }
  }

  useEffect(() => { fetchUsers() }, [])

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/app" style={s.back}>← App</a>
          <h1 style={s.title}>Admin Dashboard</h1>
          <span style={s.dim}>{userEmail}</span>
        </div>
        <button onClick={fetchUsers} style={s.refreshBtn} disabled={loading}>
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {error && <p style={s.err}>Error: {error}</p>}

      <div style={s.body}>
        {/* User list */}
        <div style={s.panel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h2 style={s.panelTitle}>Users ({filtered.length})</h2>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search email…" style={s.searchInput}
            />
          </div>
          {loading
            ? <p style={s.dim}>Loading…</p>
            : filtered.map(u => (
              <div
                key={u.id}
                onClick={() => fetchFiles(u)}
                style={{
                  ...s.userRow,
                  background: selectedUser?.id === u.id
                    ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...s.planChip, background: PLAN_COLOR[u.plan] || '#64748b' }}>
                    {u.plan}
                  </span>
                  <span style={s.email}>{u.email}</span>
                </div>
                <div style={s.stats}>
                  <span title="AI scans today">📸 {u.ai_scans_today}</span>
                  <span title="Scans this month">📅 {u.scans_month}</span>
                  <span title="AI fixes this month">🤖 {u.ai_fixes_month}</span>
                  <span title="Files saved">📁 {u.files_saved}</span>
                  <span title="Haiku+Sonnet fix tokens">🧠 {fmt(u.haiku_fix_tok + u.sonnet_fix_tok)}</span>
                  {u.plan_expires_at && u.plan !== 'admin' && (() => {
                    const days = Math.ceil((new Date(u.plan_expires_at).getTime() - Date.now()) / 86_400_000)
                    return (
                      <span
                        title="Plan expiry"
                        style={{ color: days <= 3 ? '#f87171' : days <= 7 ? '#fb923c' : 'rgba(255,255,255,0.5)' }}
                      >
                        ⏳ {days <= 0 ? 'EXPIRED' : `${days}d`}
                      </span>
                    )
                  })()}
                </div>
                {/* Plan change */}
                <div style={s.planSelect} onClick={e => e.stopPropagation()}>
                  <select
                    value={u.plan}
                    disabled={planChanging === u.id}
                    onChange={e => changePlan(u.id, e.target.value)}
                    style={s.select}
                  >
                    {['free', 'starter', 'pro', 'admin'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
          ))}
        </div>

        {/* Files panel */}
        <div style={s.panel}>
          {selectedUser ? (
            <>
              <h2 style={s.panelTitle}>
                Files — {selectedUser.email}
                <span style={{ ...s.planChip, background: PLAN_COLOR[selectedUser.plan], marginLeft: 8 }}>
                  {selectedUser.plan}
                </span>
                {selectedUser.plan_expires_at && selectedUser.plan !== 'admin' && (
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginLeft: 8, fontWeight: 400 }}>
                    expires {new Date(selectedUser.plan_expires_at).toLocaleDateString()}
                  </span>
                )}
              </h2>
              {/* Usage summary */}
              <div style={s.usageSummary}>
                <div style={s.statBox}>
                  <span style={s.statNum}>{selectedUser.ai_scans_today}</span>
                  <span style={s.statLabel}>AI scans today</span>
                </div>
                <div style={s.statBox}>
                  <span style={s.statNum}>{selectedUser.scans_month}</span>
                  <span style={s.statLabel}>Scans / month</span>
                </div>
                <div style={s.statBox}>
                  <span style={s.statNum}>{selectedUser.ai_fixes_month}</span>
                  <span style={s.statLabel}>AI fixes / month</span>
                </div>
                <div style={s.statBox}>
                  <span style={s.statNum}>{fmt(selectedUser.haiku_fix_tok)}</span>
                  <span style={s.statLabel}>Haiku tokens</span>
                </div>
                <div style={s.statBox}>
                  <span style={s.statNum}>{fmt(selectedUser.sonnet_fix_tok)}</span>
                  <span style={s.statLabel}>Sonnet tokens</span>
                </div>
              </div>
              {filesLoading && <p style={s.dim}>Loading files…</p>}
              {!filesLoading && userFiles.length === 0 && <p style={s.dim}>No files yet.</p>}
              {userFiles.map(f => (
                <div key={f.name} style={s.fileRow}>
                  <div>
                    <p style={s.fileName}>{f.name}</p>
                    <p style={s.fileMeta}>
                      {f.created_at ? new Date(f.created_at).toLocaleString() : '—'}
                      {' · '}{f.size >= 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`}
                    </p>
                  </div>
                  <a href={f.download_url} style={s.dlBtn} target="_blank" rel="noreferrer">↓</a>
                </div>
              ))}
            </>
          ) : (
            <p style={s.dim}>Click a user to view their files.</p>
          )}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:     { minHeight: '100vh', background: '#0f172a', color: '#e2e8f0',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:   { padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  back:     { color: '#818cf8', textDecoration: 'none', fontSize: '0.85rem' },
  title:    { fontWeight: 700, fontSize: '1.15rem', margin: '0 0 0 4px' },
  dim:      { color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem' },
  err:      { color: '#f87171', textAlign: 'center', padding: '1rem' },
  refreshBtn: { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
                padding: '0.35rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' },
  body:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, height: 'calc(100vh - 60px)' },
  panel:    { padding: '1.2rem 1.5rem', overflowY: 'auto',
              borderRight: '1px solid rgba(255,255,255,0.07)' },
  panelTitle: { fontWeight: 700, fontSize: '0.95rem', margin: '0 0 0 0', color: '#f1f5f9' },
  searchInput: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                 borderRadius: 6, padding: '0.25rem 0.6rem', color: '#e2e8f0', fontSize: '0.78rem',
                 outline: 'none', marginLeft: 'auto' },
  userRow:  { padding: '0.7rem 0.9rem', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.2s' },
  planChip: { borderRadius: 4, padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700,
              color: '#fff', textTransform: 'uppercase' as any },
  email:    { fontSize: '0.82rem', fontWeight: 500 },
  stats:    { display: 'flex', gap: 12, marginTop: 6, fontSize: '0.72rem',
              color: 'rgba(255,255,255,0.5)' },
  planSelect: { marginTop: 8 },
  select:   { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
               borderRadius: 6, color: '#e2e8f0', padding: '0.2rem 0.5rem', fontSize: '0.75rem',
               cursor: 'pointer' },
  usageSummary: { display: 'flex', gap: 10, flexWrap: 'wrap' as any, marginBottom: 16, marginTop: 8 },
  statBox:  { background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '0.5rem 0.9rem',
              display: 'flex', flexDirection: 'column' as any, alignItems: 'center', gap: 2 },
  statNum:  { fontWeight: 700, fontSize: '1rem', color: '#f1f5f9' },
  statLabel:{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' },
  fileRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, marginBottom: 8 },
  fileName: { fontWeight: 600, fontSize: '0.82rem', margin: 0 },
  fileMeta: { color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', margin: 0 },
  dlBtn:    { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff',
              borderRadius: 6, padding: '0.3rem 0.7rem', textDecoration: 'none',
              fontWeight: 700, fontSize: '0.82rem' },
}
