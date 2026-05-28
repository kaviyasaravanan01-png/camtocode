import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/login', '/app', '/account', '/history', '/terms', '/privacy', '/refund']
  const now = new Date()
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/app' ? 0.9 : 0.6,
  }))
}
