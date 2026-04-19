'use client'

export interface PlanUsage {
  plan: string
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
  price_usd: number
}

const PLAN_COLORS: Record<string, string> = {
  free:    '#64748b',
  starter: '#0ea5e9',
  pro:     '#8b5cf6',
  admin:   '#f59e0b',
}

const PLAN_LABELS: Record<string, string> = {
  free:    'Free',
  starter: 'Starter',
  pro:     'Pro',
  admin:   'Admin ∞',
}

function Bar({ used, limit, color }: { used: number; limit: number; color: string }) {
  if (!limit) return null
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const warn = pct >= 80
  return (
    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, overflow: 'hidden', marginTop: 2 }}>
      <div style={{
        width: `${pct}%`, height: '100%', borderRadius: 4,
        background: warn ? '#f87171' : color,
        transition: 'width 0.4s',
      }} />
    </div>
  )
}

export default function UsageBadge({ usage, compact = false }: { usage: PlanUsage | null; compact?: boolean }) {
  if (!usage) return null
  const plan  = usage.plan || 'free'
  const color = PLAN_COLORS[plan] || '#64748b'
  const label = PLAN_LABELS[plan] || plan

  if (plan === 'admin') {
    return (
      <div style={{ ...s.wrap, borderColor: color }}>
        <span style={{ ...s.planBadge, background: color }}>{label}</span>
        <span style={s.dim}>Unlimited access</span>
      </div>
    )
  }

  const fixPct = usage.fix_token_budget
    ? Math.round(((usage.haiku_fix_tokens + usage.sonnet_fix_tokens) / usage.fix_token_budget) * 100)
    : 0

  return (
    <div style={{ ...s.wrap, borderColor: color }}>
      <span style={{ ...s.planBadge, background: color }}>{label}</span>

      {/* AI Scans today */}
      <div style={s.row}>
        <span style={s.label}>AI scans today</span>
        <span style={s.val}>{usage.ai_scans_today} / {usage.ai_scans_day_limit}</span>
      </div>
      <Bar used={usage.ai_scans_today} limit={usage.ai_scans_day_limit} color={color} />

      {/* Total scans today */}
      {!compact && (
        <>
          <div style={s.row}>
            <span style={s.label}>Total scans today</span>
            <span style={s.val}>{usage.scans_today} / {usage.scans_day_limit}</span>
          </div>
          <Bar used={usage.scans_today} limit={usage.scans_day_limit} color={color} />
        </>
      )}

      {/* Monthly scans */}
      <div style={s.row}>
        <span style={s.label}>Scans this month</span>
        <span style={s.val}>{usage.scans_month} / {usage.scans_month_limit}</span>
      </div>
      <Bar used={usage.scans_month} limit={usage.scans_month_limit} color={color} />

      {/* AI Fixes */}
      {usage.ai_fix_allowed && (
        <>
          <div style={s.row}>
            <span style={s.label}>AI fixes left</span>
            <span style={s.val}>{usage.ai_fixes_limit - usage.ai_fixes_month} / {usage.ai_fixes_limit}</span>
          </div>
          <Bar used={usage.ai_fixes_month} limit={usage.ai_fixes_limit} color={color} />
        </>
      )}

      {/* Fix token budget */}
      {usage.ai_fix_allowed && usage.fix_token_budget > 0 && !compact && (
        <>
          <div style={s.row}>
            <span style={s.label}>Fix token budget</span>
            <span style={s.val}>{fixPct}% used</span>
          </div>
          <Bar used={usage.haiku_fix_tokens + usage.sonnet_fix_tokens} limit={usage.fix_token_budget} color={color} />
        </>
      )}

      {/* Files saved */}
      {usage.max_files > 0 && !compact && (
        <>
          <div style={s.row}>
            <span style={s.label}>Files saved</span>
            <span style={s.val}>{usage.files_saved} / {usage.max_files}</span>
          </div>
          <Bar used={usage.files_saved} limit={usage.max_files} color={color} />
        </>
      )}

      {/* Plan notes */}
      <div style={s.notes}>
        {!usage.ai_fix_allowed && <span style={s.note}>❌ AI Fix — upgrade to Starter</span>}
        {usage.max_lines_scan < 9999 && <span style={s.note}>✂ Top {usage.max_lines_scan} lines per scan</span>}
        {usage.sonnet_allowed && <span style={s.note}>✅ Sonnet for large files</span>}
      </div>

      {/* Proactive upgrade link for non-pro users */}
      {(plan === 'free' || plan === 'starter') && !compact && (
        <a href="/account" style={s.upgradeLink}>
          {plan === 'free' ? '⚡ Upgrade to Starter — $7/mo →' : '🚀 Upgrade to Pro — $18/mo →'}
        </a>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    background:   'rgba(0,0,0,0.35)',
    border:       '1px solid',
    borderRadius: 10,
    padding:      '0.6rem 0.8rem',
    minWidth:     160,
    fontSize:     '0.72rem',
    color:        '#e2e8f0',
    display:      'flex',
    flexDirection:'column',
    gap:          3,
  },
  planBadge: {
    display:      'inline-block',
    borderRadius: 4,
    padding:      '1px 7px',
    fontWeight:   700,
    fontSize:     '0.7rem',
    color:        '#fff',
    alignSelf:    'flex-start',
    marginBottom: 4,
    textTransform:'uppercase',
    letterSpacing:'0.05em',
  },
  row: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginTop:      4,
  },
  label: { color: 'rgba(255,255,255,0.5)' },
  val:   { fontWeight: 600 },
  dim:   { color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem' },
  notes: { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 },
  note:  { color: 'rgba(255,255,255,0.4)', fontSize: '0.67rem' },
  upgradeLink: {
    display:     'block',
    marginTop:   8,
    padding:     '0.35rem 0.7rem',
    background:  'rgba(99,102,241,0.15)',
    border:      '1px solid rgba(99,102,241,0.3)',
    borderRadius: 7,
    color:       '#818cf8',
    textDecoration: 'none',
    fontSize:    '0.7rem',
    fontWeight:  600,
    textAlign:   'center',
  },
}
