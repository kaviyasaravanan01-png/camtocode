import GuestTryApp from '@/components/GuestTryApp'
import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata({
  title: 'Try 1 Free AI Code Scan — No Account Required',
  description:
    'Try CamToCode free at camtocode.com/try — one Quick OCR scan from your phone camera. Sign in for copy, save, and full free tier.',
  path: '/try',
})

export default function TryPage() {
  return <GuestTryApp />
}
