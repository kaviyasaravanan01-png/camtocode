'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import PayButton from './PayButton'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'
const SUPPORT_EMAIL = 'anandanathurelangovan94@gmail.com'

const PLAN_COLOR: Record<string, string> = {
  free: '#64748b', starter: '#0ea5e9', pro: '#8b5cf6', admin: '#f59e0b',
}
const PLAN_LABEL: Record<string, string> = {
  free: 'Free', starter: 'Starter', pro: 'Pro', admin: 'Admin',
}
const PLAN_FEATURES: Record<string, string[]> = {
  free:    ['3 AI scans/day', '20 scans/day', '200 scans/month', 'Top 100 lines per scan', '10 saved files', 'No AI Fix'],
  starter: ['200 AI scans/day', '6,000 scans/month', '15 AI fixes/month', 'Top 300 lines per scan', '500 saved files'],
  pro:     ['500 AI scans/day', '15,000 scans/month', '75 AI fixes/month', 'Top 1,000 lines per scan', '1,000 saved files', 'Claude Sonnet for large files'],
  admin:   ['Unlimited everything', 'Claude Sonnet enabled', 'No limits'],
}

interface PlanData {
  plan: string
  plan_started_at: string | null
  plan_expires_at: string | null
  price_usd: number
  scans_today: number
  ai_scans_today: number
  scans_day_limit: number
  ai_scans_day_limit: number
  scans_month: number
  scans_month_limit: number
  ai_fixes_month: number
  ai_fixes_limit: number
  haiku_fix_tokens: number
  sonnet_fix_tokens: number
  fix_token_budget: number
  files_saved: number
  max_files: number
  sonnet_allowed: boolean
  max_lines_scan: number
  save_allowed: boolean
  ai_fix_allowed: boolean
}

interface Payment {
  id: string
  plan: string
  amount_paise: number
  currency: string
  razorpay_order_id: string
  razorpay_payment_id: string
  status: string
  created_at: string
}

function Bar({ used, limit, color }: { used: number; limit: number; color: string }) {
  if (!limit) return null
  const pct  = Math.min(100, Math.round((used / limit) * 100))
  const warn = pct >= 80
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 6, height: 6, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: warn ? '#f87171' : color, transition: 'width 0.4s' }} />
    </div>
  )
}

function StatRow({ label, used, limit, color }: { label: string; used: number; limit: number; color: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div style={s.statRow}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={s.statLabel}>{label}</span>
        <span style={{ ...s.statVal, color: pct >= 80 ? '#f87171' : '#f1f5f9' }}>
          {used.toLocaleString()} / {limit ? limit.toLocaleString() : '∞'}
        </span>
      </div>
      <Bar used={used} limit={limit} color={color} />
    </div>
  )
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function nextBilling(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  d.setDate(d.getDate() + 30)
  return fmtDate(d.toISOString())
}

function fmtTokens(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
       : n >= 1_000     ? `${(n / 1_000).toFixed(1)}K`
       : String(n)
}

export default function AccountPage({ userEmail }: { userEmail: string }) {
  const [data,     setData]     = useState<PlanData | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  const fetchAll = async () => {
    setLoading(true); setError('')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''
    try {
      const [planRes, payRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/my_plan`,     { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/api/my_payments`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (!planRes.ok) throw new Error(`HTTP ${planRes.status}`)
      setData(await planRes.json())
      const pd = await payRes.json()
      setPayments(pd.payments || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchAll() }, [])

  const plan    = data?.plan || 'free'
  const color   = PLAN_COLOR[plan] || '#64748b'
  const isAdmin = plan === 'admin'

  // Days until expiry
  const daysLeft = (() => {
    if (!data?.plan_expires_at) return null
    const diff = new Date(data.plan_expires_at).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / 86_400_000))
  })()

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/app" style={s.backLink}>← Back to App</a>
          <h1 style={s.title}>My Account</h1>
          {isAdmin && (
            <a href="/admin" style={{ ...s.backLink, color: '#f59e0b', marginLeft: 8, fontWeight: 700 }}>
              🛡 Admin Dashboard →
            </a>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={s.emailChip}>{userEmail}</span>
          <button onClick={fetchAll} style={s.refreshBtn} disabled={loading}>{loading ? '…' : '↻'}</button>
        </div>
      </div>

      {error && <p style={s.err}>Error: {error}</p>}
      {loading && <p style={{ ...s.dim, padding: '1.5rem' }}>Loading your plan details…</p>}

      {data && (
        <div style={s.body}>

          {/* ── Plan card ─────────────────────────────────────────────── */}
          <section style={{ ...s.card, borderColor: color }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ ...s.planBadge, background: color }}>{PLAN_LABEL[plan] || plan}</span>
                  {data.price_usd > 0 && (
                    <span style={s.pricePill}>${data.price_usd}/month</span>
                  )}
                  {data.price_usd === 0 && plan !== 'admin' && (
                    <span style={s.pricePill}>Free forever</span>
                  )}
                </div>
                {plan !== 'free' && plan !== 'admin' && (
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
                    <div>
                      <p style={s.metaLabel}>Plan started</p>
                      <p style={s.metaVal}>{fmtDate(data.plan_started_at)}</p>
                    </div>
                    <div>
                      <p style={s.metaLabel}>Expires / renew by</p>
                      <p style={{
                        ...s.metaVal,
                        color: daysLeft !== null && daysLeft <= 5 ? '#f87171' : '#f1f5f9',
                      }}>
                        {fmtDate(data.plan_expires_at)}
                        {daysLeft !== null && (
                          <span style={{ fontSize: '0.75rem', marginLeft: 8, color: daysLeft <= 5 ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                            ({daysLeft === 0 ? 'expires today!' : `${daysLeft}d left`})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
                {plan === 'admin' && <p style={{ color: '#f59e0b', fontSize: '0.85rem', marginTop: 6 }}>Unlimited access — internal account</p>}
              </div>

              {/* Quick feature list */}
              <ul style={s.featureList}>
                {(PLAN_FEATURES[plan] || []).map(f => (
                  <li key={f} style={s.featureItem}>
                    <span style={{ color }}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── Usage stats ───────────────────────────────────────────── */}
          {plan !== 'admin' && (
            <section style={s.card}>
              <h2 style={s.sectionTitle}>Usage This Cycle</h2>
              <div style={s.statsGrid}>
                <StatRow label="AI Scans today"     used={data.ai_scans_today}  limit={data.ai_scans_day_limit}  color={color} />
                <StatRow label="Total scans today"  used={data.scans_today}     limit={data.scans_day_limit}     color={color} />
                <StatRow label="Scans this month"   used={data.scans_month}     limit={data.scans_month_limit}   color={color} />
                {data.ai_fix_allowed && (
                  <StatRow label="AI fixes this month" used={data.ai_fixes_month} limit={data.ai_fixes_limit} color={color} />
                )}
                {data.ai_fix_allowed && data.fix_token_budget > 0 && (
                  <StatRow
                    label="Fix tokens used"
                    used={data.haiku_fix_tokens + data.sonnet_fix_tokens}
                    limit={data.fix_token_budget}
                    color={color}
                  />
                )}
                {data.max_files > 0 && (
                  <StatRow label="Files saved" used={data.files_saved} limit={data.max_files} color={color} />
                )}
              </div>

              {/* Token detail */}
              {data.ai_fix_allowed && (
                <div style={s.tokenDetail}>
                  <span style={s.dim}>Haiku tokens: {fmtTokens(data.haiku_fix_tokens)}</span>
                  {data.sonnet_allowed && (
                    <span style={s.dim}>Sonnet tokens: {fmtTokens(data.sonnet_fix_tokens)}</span>
                  )}
                  <span style={s.dim}>Budget: {fmtTokens(data.fix_token_budget)}</span>
                </div>
              )}

              {/* Limits note */}
              <div style={s.limitsNote}>
                <span style={s.noteItem}>✂ Max {data.max_lines_scan.toLocaleString()} lines per scan</span>
                {data.sonnet_allowed && <span style={s.noteItem}>✅ Claude Sonnet enabled for large files</span>}
                {!data.ai_fix_allowed && <span style={{ ...s.noteItem, color: '#f87171' }}>❌ AI Fix not available on Free plan</span>}
              </div>
            </section>
          )}

          {/* ── Upgrade section ───────────────────────────────────────── */}
          {(plan === 'free' || plan === 'starter') && (
            <section style={s.card}>
              <h2 style={s.sectionTitle}>Upgrade Your Plan</h2>
              <p style={s.sectionSub}>
                {plan === 'free'
                  ? 'Unlock AI Fix, more scans, and cloud file storage with Starter or Pro.'
                  : 'Go Pro for 5× more scans, 5× more files, and Claude Sonnet for large files.'}
              </p>
              <div style={s.upgradeGrid}>
                {plan === 'free' && (
                  <div style={{ ...s.upgradeCard, borderColor: PLAN_COLOR.starter }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ ...s.planBadge, background: PLAN_COLOR.starter }}>Starter</span>
                      <span style={s.upgradePrice}>$7<span style={s.perMonth}>/mo</span></span>
                    </div>
                    <ul style={s.featureList}>
                      {PLAN_FEATURES.starter.map(f => <li key={f} style={s.featureItem}><span style={{ color: PLAN_COLOR.starter }}>✓</span> {f}</li>)}
                    </ul>
                    <PayButton plan="starter" label="Upgrade to Starter" />
                  </div>
                )}
                <div style={{ ...s.upgradeCard, borderColor: PLAN_COLOR.pro, boxShadow: `0 0 30px ${PLAN_COLOR.pro}22` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...s.planBadge, background: PLAN_COLOR.pro }}>Pro</span>
                      <span style={{ background: PLAN_COLOR.pro, color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: '0.65rem', fontWeight: 700 }}>Most Popular</span>
                    </div>
                    <span style={s.upgradePrice}>$18<span style={s.perMonth}>/mo</span></span>
                  </div>
                  <ul style={s.featureList}>
                    {PLAN_FEATURES.pro.map(f => <li key={f} style={s.featureItem}><span style={{ color: PLAN_COLOR.pro }}>✓</span> {f}</li>)}
                  </ul>
                  <PayButton plan="pro" label="Upgrade to Pro" />
                </div>
              </div>
            </section>
          )}

          {/* ── Help / Support ────────────────────────────────────────── */}
          <section style={s.card}>
            <h2 style={s.sectionTitle}>Help & Support</h2>
            <p style={s.sectionSub}>
              Have a question, found a bug, or need your plan adjusted manually?
              We typically respond within 24 hours.
            </p>
            <div style={s.helpOptions}>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=CamToCode Support`} style={s.helpBtn}>
                ✉️ Email Support
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=CamToCode Plan Upgrade Request`} style={{ ...s.helpBtn, background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.35)', color: '#818cf8' }}>
                💳 Request Plan Upgrade
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=CamToCode Billing Question`} style={{ ...s.helpBtn, background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#fca5a5' }}>
                🧾 Billing Question
              </a>
            </div>
            <p style={{ ...s.dim, marginTop: 12, textAlign: 'center' }}>
              {SUPPORT_EMAIL}
            </p>
          </section>

          {/* ── Payment history ───────────────────────────────────────── */}
          {payments.length > 0 && (
            <section style={s.card}>
              <h2 style={s.sectionTitle}>Payment History</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {payments.map(p => (
                  <div key={p.id} style={s.payRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ ...s.planBadge, background: PLAN_COLOR[p.plan] || '#64748b' }}>
                        {PLAN_LABEL[p.plan] || p.plan}
                      </span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem', color: '#f1f5f9' }}>
                          ₹{(p.amount_paise / 100).toFixed(0)} — {p.plan.charAt(0).toUpperCase() + p.plan.slice(1)} Plan
                        </p>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
                          {new Date(p.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ ...s.statusChip, background: p.status === 'captured' ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)', color: p.status === 'captured' ? '#4ade80' : '#f87171', border: `1px solid ${p.status === 'captured' ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
                        {p.status}
                      </span>
                      <p style={{ margin: '4px 0 0', fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>
                        {p.razorpay_payment_id}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Quick links ───────────────────────────────────────────── */}
          <div style={s.quickLinks}>
            <a href="/app"     style={s.quickLink}>← Back to App</a>
            <a href="/history" style={s.quickLink}>📁 File History</a>
            <a href="/"        style={s.quickLink}>🏠 Landing Page</a>
          </div>

        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    padding: '1rem 1.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  backLink: { color: '#818cf8', textDecoration: 'none', fontSize: '0.85rem' },
  title: { fontWeight: 700, fontSize: '1.15rem', margin: '0 0 0 8px' },
  emailChip: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: '0.25rem 0.8rem',
    fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.6)',
  },
  err:  { color: '#f87171', padding: '1rem 1.5rem', fontSize: '0.85rem' },
  dim:  { color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' },
  body: {
    maxWidth: 860,
    margin: '0 auto',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '1.4rem 1.6rem',
  },
  planBadge: {
    display: 'inline-block',
    borderRadius: 5,
    padding: '2px 10px',
    fontWeight: 700,
    fontSize: '0.72rem',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  pricePill: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.6)',
  },
  metaLabel: { color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', margin: '0 0 2px' },
  metaVal:   { color: '#f1f5f9', fontWeight: 600, fontSize: '0.9rem', margin: 0 },
  featureList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  featureItem: { fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', display: 'flex', gap: 6 },
  sectionTitle: { fontWeight: 700, fontSize: '1rem', color: '#f1f5f9', marginBottom: 4 },
  sectionSub:   { color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.6 },
  statsGrid: { display: 'flex', flexDirection: 'column', gap: 14 },
  statRow:   { display: 'flex', flexDirection: 'column', gap: 2 },
  statLabel: { color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' },
  statVal:   { fontWeight: 600, fontSize: '0.85rem' },
  tokenDetail: {
    display: 'flex', gap: 20, flexWrap: 'wrap',
    marginTop: 14, paddingTop: 12,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  limitsNote: {
    display: 'flex', gap: 16, flexWrap: 'wrap',
    marginTop: 12, paddingTop: 12,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  noteItem: { color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' },
  upgradeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 },
  upgradeCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid',
    borderRadius: 12,
    padding: '1.2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  upgradePrice: { fontWeight: 800, fontSize: '1.5rem', color: '#f1f5f9' },
  perMonth:     { fontWeight: 400, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' },
  helpOptions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  helpBtn: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '0.55rem 1.1rem',
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  quickLinks: {
    display: 'flex', gap: 16, flexWrap: 'wrap',
    paddingBottom: '1.5rem',
  },
  quickLink: {
    color: '#818cf8',
    textDecoration: 'none',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  refreshBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: '#e2e8f0',
    padding: '0.2rem 0.6rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  payRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: '0.7rem 1rem',
    flexWrap: 'wrap' as any,
    gap: 8,
  },
  statusChip: {
    display: 'inline-block',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'capitalize' as any,
  },
}
