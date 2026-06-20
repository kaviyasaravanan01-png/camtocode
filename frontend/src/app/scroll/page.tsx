import ScrollReader from '@/components/ScrollReader'
import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata({
  title: 'Free Scroll Automation — Auto-Scroll Code Files for Camera OCR',
  description:
    'Free browser tool at camtocode.com/scroll — open local code files, auto-scroll sections, keyboard/timer modes. No login, no API. Pair with CamToCode phone scanner.',
  path: '/scroll',
  keywords: [
    'scroll automation code',
    'auto scroll source file',
    'office laptop code scan',
    'camtocode scroll',
    'no install OCR helper',
    'camtocode.com/scroll',
  ],
})

export default function ScrollPage() {
  return <ScrollReader />
}
