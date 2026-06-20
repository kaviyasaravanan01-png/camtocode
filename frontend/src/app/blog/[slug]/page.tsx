import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAllSlugs, getPostBySlug } from '@/lib/blog'
import { markdownToHtml } from '@/lib/markdown'
import { blogPostingJsonLd, buildPageMetadata } from '@/lib/seo'
import { SITE_URL } from '@/lib/site'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return getAllSlugs().map(slug => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}
  return buildPageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${slug}`,
    keywords: [...post.tags, 'CamToCode', 'camtocode.com'],
    ogType: 'article',
    publishedTime: post.date,
  })
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const html = markdownToHtml(post.content)
  const jsonLd = blogPostingJsonLd(post)

  return (
    <div className="ctc-docs">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="ctc-docs-header">
        <Link href="/" className="ctc-docs-logo">CamToCode</Link>
        <nav className="ctc-docs-nav">
          <Link href="/blog">Blog</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/try">Try Free</Link>
        </nav>
      </header>

      <main className="ctc-docs-main ctc-blog-article">
        <p><Link href="/blog" style={{ color: '#818cf8', fontSize: '0.85rem' }}>← All posts</Link></p>
        <article>
          <header>
            <time dateTime={post.date}>{post.date}</time>
            <h1>{post.title}</h1>
            <p className="ctc-docs-lead" style={{ marginBottom: '1.5rem' }}>{post.description}</p>
            <div className="ctc-blog-meta">
              <span>{post.readingMinutes} min read</span>
              <span>By {post.author}</span>
            </div>
          </header>
          <div className="ctc-blog-body" dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        <div className="ctc-docs-cta" style={{ marginTop: '2.5rem' }}>
          <Link href="/try" className="ctc-docs-btn ctc-docs-btn--primary">Try 1 Free Scan</Link>
          <Link href="/scroll" className="ctc-docs-btn">Scroll Automation</Link>
          <Link href="/app" className="ctc-docs-btn">Open App</Link>
        </div>
      </main>

      <footer className="ctc-docs-footer">
        <Link href="/">camtocode.com</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </footer>
    </div>
  )
}
