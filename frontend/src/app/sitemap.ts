import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const staticRoutes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[0]['changeFrequency'] }[] = [
    { path: '', priority: 1, changeFrequency: 'weekly' },
    { path: '/try', priority: 0.95, changeFrequency: 'weekly' },
    { path: '/scroll', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/docs', priority: 0.85, changeFrequency: 'monthly' },
    { path: '/blog', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/login', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/refund', priority: 0.3, changeFrequency: 'yearly' },
  ]

  const pages = staticRoutes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))

  const posts = getAllPosts().map(post => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }))

  return [...pages, ...posts]
}
