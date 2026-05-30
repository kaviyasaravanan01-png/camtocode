'use client'

import { useState } from 'react'
import UsageBadge, { type PlanUsage } from './UsageBadge'
import PayButton from './PayButton'

interface Props {
  usage: PlanUsage | null
  limitMsg?: string
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  starter_sa: 'Starter + S&A',
  pro_sa: 'Pro + S&A',
  scan_answer: 'Scan & Answer',
  admin: 'Admin',
}

export default function UsageAccordion({ usage, limitMsg }: Props) {
  const [open, setOpen] = useState(false)

  if (!usage) return null

  const plan = usage.plan || 'free'
  const label = PLAN_LABELS[plan] || plan
  const summary =
    plan === 'admin'
      ? `${label} · Unlimited`
      : `${label} · AI ${usage.ai_scans_today}/${usage.ai_scans_day_limit} today`

  return (
    <div className="ctc-usage-acc" style={s.wrap}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={s.header}
        aria-expanded={open}
      >
        <span style={s.headerLeft}>
          <span style={s.chevron}>{open ? '▼' : '▶'}</span>
          <span style={s.title}>Plan & usage</span>
          {!open && <span style={s.summary}>{summary}</span>}
        </span>
        {open && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); setOpen(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setOpen(false) } }}
            style={s.closeBtn}
            title="Close"
          >
            ✕
          </span>
        )}
      </button>

      {open && (
        <div style={s.body}>
          <UsageBadge usage={usage} />
          {limitMsg && (
            <div style={s.limitMsg}>⚠️ {limitMsg}</div>
          )}
          {limitMsg && usage.plan === 'free' && (
            <PayButton plan="starter" label="Upgrade to Starter — $7/mo"
              style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem', borderRadius: 7, marginTop: 8 }} />
          )}
          {limitMsg && usage.plan === 'starter' && (
            <PayButton plan="pro" label="Upgrade to Pro — $18/mo"
              style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem', borderRadius: 7, marginTop: 8 }} />
          )}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    margin: '0 0.75rem',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.25)',
    overflow: 'hidden',
  },
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '0.45rem 0.75rem',
    background: 'transparent',
    border: 'none',
    color: '#e2e8f0',
    cursor: 'pointer',
    textAlign: 'left',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  chevron: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', flexShrink: 0 },
  title: { fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' },
  summary: {
    fontSize: '0.72rem',
    color: 'rgba(255,255,255,0.45)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    fontSize: '0.9rem',
    color: 'rgba(255,255,255,0.35)',
    padding: '2px 6px',
    flexShrink: 0,
    cursor: 'pointer',
  },
  body: {
    padding: '0 0.75rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  limitMsg: {
    background: 'rgba(248,113,113,0.15)',
    border: '1px solid #f87171',
    borderRadius: 8,
    padding: '0.45rem 0.9rem',
    fontSize: '0.78rem',
    color: '#fca5a5',
  },
}
