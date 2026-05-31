/** User-facing OCR tier names (internal keys unchanged on the backend). */
export const OCR_MODEL_LABELS: Record<string, string> = {
  gemini_lite: 'Quick OCR',
  haiku: 'Standard OCR',
  sonnet: 'Precision OCR',
  gemini_flash: 'Smart OCR',
  gemini: 'Smart OCR',
}

export function ocrModelLabel(key: string, recommended?: boolean): string {
  const base = OCR_MODEL_LABELS[key] || key
  return recommended ? `${base} ★ Recommended` : base
}

export const DEFAULT_OCR_MODEL_KEY = 'gemini_lite'

export const DEFAULT_OCR_MODELS = [
  { key: 'gemini_lite', label: 'Quick OCR', tip: 'Fastest reads — great for clear screenshots and short snippets', recommended: false, provider: 'google' },
  { key: 'haiku', label: 'Standard OCR', tip: 'Recommended — best balance of speed, accuracy & cost', recommended: true, provider: 'anthropic' },
  { key: 'sonnet', label: 'Precision OCR', tip: 'Highest accuracy for large or complex files (Pro plan)', recommended: false, provider: 'anthropic' },
  { key: 'gemini_flash', label: 'Smart OCR', tip: 'Better on glare, angles, and denser code blocks', recommended: false, provider: 'google' },
] as const
