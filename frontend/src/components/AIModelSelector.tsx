'use client'

import { ocrModelLabel } from '@/lib/ocrModels'

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
  onChange: (key: string) => void
}

function isGoogleOcrKey(key: string) {
  return key === 'gemini' || key === 'gemini_lite' || key === 'gemini_flash'
}

export default function AIModelSelector({
  models,
  selected,
  geminiAvailable,
  sonnetAllowed,
  onChange,
}: Props) {
  const isDisabled = (key: string) => {
    if (key === 'sonnet' && !sonnetAllowed) return 'Pro plan required'
    if (isGoogleOcrKey(key) && !geminiAvailable) return 'Not configured'
    return ''
  }

  return (
    <div className="ctc-model-row">
      <label className="ctc-model-label" htmlFor="ctc-ai-model">OCR Engine</label>
      <select
        id="ctc-ai-model"
        className="ctc-model-select-input"
        value={selected}
        onChange={e => onChange(e.target.value)}
      >
        {models.map(m => {
          const reason = isDisabled(m.key)
          return (
            <option key={m.key} value={m.key} disabled={!!reason}>
              {ocrModelLabel(m.key, m.recommended)}
              {reason ? ` (${reason})` : ''}
            </option>
          )
        })}
      </select>
    </div>
  )
}
