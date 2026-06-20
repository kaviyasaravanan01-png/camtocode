import fs from 'fs'
import path from 'path'

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  date: string
  author: string
  tags: string[]
  published: boolean
}

export interface BlogPost extends BlogPostMeta {
  content: string
  readingMinutes: number
}

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    meta[key] = val
  }
  return { meta, body: match[2] }
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map(t => t.trim()).filter(Boolean)
}

function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

function parseFile(slug: string, raw: string): BlogPost | null {
  const { meta, body } = parseFrontmatter(raw)
  const published = meta.published !== 'false'
  if (!meta.title) return null
  return {
    slug,
    title: meta.title,
    description: meta.description || meta.title,
    date: meta.date || new Date().toISOString().slice(0, 10),
    author: meta.author || 'CamToCode',
    tags: parseTags(meta.tags),
    published,
    content: body.trim(),
    readingMinutes: readingMinutes(body),
  }
}

export function getAllPosts(includeDrafts = false): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return []
  return fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const slug = f.replace(/\.md$/, '')
      const raw = fs.readFileSync(path.join(BLOG_DIR, f), 'utf-8')
      return parseFile(slug, raw)
    })
    .filter((p): p is BlogPost => !!p && (includeDrafts || p.published))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getPostBySlug(slug: string): BlogPost | null {
  const file = path.join(BLOG_DIR, `${slug}.md`)
  if (!fs.existsSync(file)) return null
  const post = parseFile(slug, fs.readFileSync(file, 'utf-8'))
  if (!post || !post.published) return null
  return post
}

export function getAllSlugs(): string[] {
  return getAllPosts().map(p => p.slug)
}
