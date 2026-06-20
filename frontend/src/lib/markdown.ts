/** Lightweight markdown → HTML for blog posts (no external deps). */

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function markdownToHtml(markdown: string): string {
  const blocks: string[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++
      blocks.push(
        `<pre class="ctc-md-pre"><code${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
      )
      continue
    }

    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)![0].length
      const text = line.replace(/^#+\s*/, '')
      blocks.push(`<h${level}>${inlineFormat(text)}</h${level}>`)
      i++
      continue
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].replace(/^[-*]\s*/, ''))}</li>`)
        i++
      }
      blocks.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].replace(/^\d+\.\s*/, ''))}</li>`)
        i++
      }
      blocks.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    if (line.trim() === '') {
      i++
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !/^#{1,3} /.test(lines[i]) && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i]) && !lines[i].startsWith('```')) {
      para.push(lines[i])
      i++
    }
    blocks.push(`<p>${inlineFormat(para.join(' '))}</p>`)
  }

  return blocks.join('\n')
}

function inlineFormat(text: string): string {
  let s = escapeHtml(text)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
  return s
}
