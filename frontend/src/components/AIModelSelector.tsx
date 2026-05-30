'use client'

export interface AiModelOption {
  key: string
  label: string
  tip: string
  recommended: boolean
  provider: string
}

interface Props {
  models: AiModelOption[]
  selected: string
  geminiAvailable: boolean
  sonnetAllowed: boolean
  tip?: string
  onChange: (key: string) => void
  compact?: boolean
}

const SHORT: Record<string, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  gemini_lite: 'Gemini Lite',
  gemini_flash: 'Gemini Flash',
  gemini: 'Gemini Flash',
}

function isGeminiKey(key: string) {
  return key === 'gemini' || key === 'gemini_lite' || key === 'gemini_flash'
}

export default function AIModelSelector({
  models,
  selected,
  geminiAvailable,
  sonnetAllowed,
  tip,
  onChange,
  compact = false,
}: Props) {
  const active = models.find(m => m.key === selected)
  const displayTip = tip || active?.tip || ''

  const isDisabled = (key: string) => {
    if (key === 'sonnet' && !sonnetAllowed) return 'Pro plan required'
    if (isGeminiKey(key) && !geminiAvailable) return 'Add GOOGLE_API_KEY on server'
    return ''
  }

  return (
    <div className="ctc-model-select" style={compact ? s.wrapCompact : s.wrap}>
      <label style={s.label} htmlFor="ctc-ai-model">
        <span style={s.labelIcon}>🤖</span>
        {!compact && <span>AI Model</span>}
      </label>
      <div style={s.controlCol}>
        <select
          id="ctc-ai-model"
          value={selected}
          onChange={e => onChange(e.target.value)}
          style={s.select}
          title={displayTip}
        >
          {models.map(m => {
            const reason = isDisabled(m.key)
            return (
              <option key={m.key} value={m.key} disabled={!!reason}>
                {SHORT[m.key] || m.label}
                {m.recommended ? ' ★ Recommended' : ''}
                {reason ? ` (${reason})` : ''}
              </option>
            )
          })}
        </select>
        {displayTip && !compact && (
          <span style={s.tip}>
            {active?.recommended && (
              <span style={s.recBadge}>Recommended</span>
            )}
            {displayTip}
          </span>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
    flex: '1 1 140px',
    maxWidth: 220,
  },
  wrapCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flexShrink: 0,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  labelIcon: { fontSize: '0.85rem' },
  controlCol: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  select: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(99,102,241,0.35)',
    borderRadius: 8,
    color: '#e2e8f0',
    padding: '0.3rem 0.45rem',
    fontSize: '0.78rem',
    width: '100%',
    cursor: 'pointer',
  },
  tip: {
    fontSize: '0.65rem',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.35,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    flexWrap: 'wrap',
  },
  recBadge: {
    background: 'rgba(34,197,94,0.2)',
    color: '#4ade80',
    borderRadius: 4,
    padding: '0 5px',
    fontSize: '0.6rem',
    fontWeight: 700,
    flexShrink: 0,
  },
}
