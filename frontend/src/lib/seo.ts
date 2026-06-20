import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const SEO_KEYWORDS = [
  'CamToCode',
  'camtocode.com',
  'camera to code',
  'photo to code',
  'scan code from screen',
  'OCR code scanner',
  'AI Vision OCR',
  'scan python from phone',
  'screenshot to code',
  'code OCR online',
  'MCQ scanner',
  'scan and answer',
  'instant answer MCQ',
  'scroll automation code',
  'office laptop code scan',
  'no install OCR',
  'developer OCR tool',
  'whiteboard to code',
  'AI code fix',
  'free OCR code scanner',
]

type PageMetaInput = {
  title: string
  description: string
  path: string
  keywords?: string[]
  ogType?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
  noIndex?: boolean
}

/** Build consistent Metadata for any public page on camtocode.com */
export function buildPageMetadata(input: PageMetaInput): Metadata {
  const canonical = `${SITE_URL}${input.path.startsWith('/') ? input.path : `/${input.path}`}`
  const keywords = input.keywords ?? SEO_KEYWORDS

  return {
    title: input.title,
    description: input.description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type: input.ogType ?? 'website',
      locale: 'en_IN',
      url: canonical,
      siteName: SITE_NAME,
      title: input.title,
      description: input.description,
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
      images: [{ url: '/icons/icon.svg', width: 512, height: 512, alt: `${SITE_NAME} logo` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: ['/icons/icon.svg'],
    },
    robots: input.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  }
}

export function blogPostingJsonLd(post: {
  title: string
  description: string
  slug: string
  date: string
  author: string
}) {
  const url = `${SITE_URL}/blog/${post.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: post.author, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  }
}
