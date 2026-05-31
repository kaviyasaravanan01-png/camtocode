import type { Metadata, Viewport } from 'next'
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site'
import './globals.css'

const keywords = [
  'camera to code',
  'photo to code',
  'scan code from screen',
  'OCR code scanner',
  'AI Vision OCR',
  'whiteboard to code',
  'screenshot to python',
  'MCQ scanner',
  'scan and answer',
  'instant answer MCQ',
  'code from photo',
  'developer OCR',
  'CamToCode',
]

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Camera to Code Converter | AI Scan & Answer`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  keywords,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  applicationName: SITE_NAME,
  category: 'technology',
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Point Your Camera at Code`,
    description: SITE_TAGLINE,
    images: [
      {
        url: '/icons/icon.svg',
        width: 512,
        height: 512,
        alt: `${SITE_NAME} logo`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Camera to Code with AI Vision OCR`,
    description: SITE_TAGLINE,
    images: ['/icons/icon.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: SITE_NAME,
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#4f46e5',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_TAGLINE,
      inLanguage: 'en-IN',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web, iOS, Android',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'INR',
        description: 'Free tier with paid upgrades',
      },
      description: SITE_TAGLINE,
      featureList: [
        'AI Vision code OCR',
        'AI Fix syntax repair',
        'Scan and Answer for MCQs',
        'Instant Answer mode',
        'Cloud file history',
      ],
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      email: 'anandanathurelangovan94@gmail.com',
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  )
}
