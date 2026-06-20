import Link from 'next/link'
import { getAllPosts } from '@/lib/blog'
import { buildPageMetadata } from '@/lib/seo'
import { SITE_URL } from '@/lib/site'

export const metadata = buildPageMetadata({
  title: 'Blog — Camera to Code Tips, OCR Guides & Product Updates',
  description:
    'CamToCode blog: guides for scanning code from your phone, Scroll Automation for office laptops, AI OCR tips, and comparisons. Free tools at camtocode.com.',
  path: '/blog',
  keywords: [
    'CamToCode blog',
    'camera to code guide',
    'OCR code scanner tips',
    'scroll automation tutorial',
    'scan code office laptop',
    'camtocode.com',
  ],
})

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <div className="ctc-docs">
      <header className="ctc-docs-header">
        <Link href="/" className="ctc-docs-logo">CamToCode</Link>
        <nav className="ctc-docs-nav">
          <Link href="/blog">Blog</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/scroll">Scroll</Link>
          <Link href="/try">Try Free</Link>
          <Link href="/app">App</Link>
        </nav>
      </header>

      <main className="ctc-docs-main">
        <h1>Blog</h1>
        <p className="ctc-docs-lead">
          Guides for scanning code with AI, using Scroll Automation on office laptops, and getting the most from{' '}
          <a href={SITE_URL}>camtocode.com</a>.
        </p>

        <div className="ctc-blog-list">
          {posts.map(post => (
            <article key={post.slug} className="ctc-blog-card">
              <time dateTime={post.date} className="ctc-blog-date">{post.date}</time>
              <h2 style={{ margin: '0.35rem 0' }}>
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </h2>
              <p style={{ margin: '0.5rem 0', opacity: 0.75, lineHeight: 1.55 }}>{post.description}</p>
              <div className="ctc-blog-meta">
                <span>{post.readingMinutes} min read</span>
                {post.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="ctc-blog-tag">{tag}</span>
                ))}
              </div>
              <Link href={`/blog/${post.slug}`} className="ctc-blog-read">Read article →</Link>
            </article>
          ))}
        </div>

        {posts.length === 0 && (
          <p>No posts yet. Add markdown files to <code>frontend/content/blog/</code>.</p>
        )}
      </main>

      <footer className="ctc-docs-footer">
        <Link href="/">Home</Link>
        <Link href="/docs">Docs</Link>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </div>
  )
}
