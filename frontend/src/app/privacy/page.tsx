import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — CamToCode',
  description: 'Privacy Policy for CamToCode — how we collect, use, and protect your data.',
}

export default function PrivacyPage() {
  const EFFECTIVE = 'April 20, 2026'
  const EMAIL     = 'anandanathurelangovan94@gmail.com'

  return (
    <div style={s.root}>
      <div style={s.inner}>
        <div style={s.nav}>
          <Link href="/" style={s.back}>← Back to Home</Link>
        </div>

        <h1 style={s.h1}>Privacy Policy</h1>
        <p style={s.meta}>Effective Date: {EFFECTIVE}</p>

        <p style={s.p}>
          CamToCode ("we", "our", "us") is committed to protecting your privacy. This Privacy
          Policy explains what information we collect, how we use it, and your rights regarding
          your personal data when you use our Service at <strong>camtocode.com</strong>.
        </p>

        <h2 style={s.h2}>1. Information We Collect</h2>
        <p style={s.p}><strong>Account Information:</strong> When you sign in via Google OAuth,
          we receive your email address and Google profile ID. We do not receive your Google
          password.</p>
        <p style={s.p}><strong>Usage Data:</strong> We track the number of scans, AI Fix requests,
          and files saved per user in order to enforce plan limits. This data is stored in our
          database (Supabase).</p>
        <p style={s.p}><strong>Uploaded Content:</strong> Photos you capture and the resulting code
          files you save are stored in Supabase Storage under your unique user ID. This content
          is private and not accessible by other users.</p>
        <p style={s.p}><strong>Payment Information:</strong> Payments are processed by Razorpay.
          We do not store your card details. We receive and store only the payment confirmation
          (order ID, payment ID, plan, and amount) for billing records.</p>
        <p style={s.p}><strong>Log Data:</strong> Our servers may log IP addresses, browser type,
          and timestamps for security and debugging purposes.</p>

        <h2 style={s.h2}>2. How We Use Your Information</h2>
        <ul style={s.ul}>
          <li style={s.li}>To provide and operate the Service.</li>
          <li style={s.li}>To enforce subscription plan limits and track usage.</li>
          <li style={s.li}>To process payments and maintain billing history.</li>
          <li style={s.li}>To send transactional emails related to your account (if applicable).</li>
          <li style={s.li}>To improve the Service and troubleshoot issues.</li>
        </ul>
        <p style={s.p}>
          We do not sell, rent, or share your personal information with third parties for
          marketing purposes.
        </p>

        <h2 style={s.h2}>3. Data Storage &amp; Security</h2>
        <p style={s.p}>
          Your data is stored on <strong>Supabase</strong> (hosted on AWS) with row-level security
          enabled. Only you can access your own files. We use HTTPS for all data in transit.
          Our backend is hosted on <strong>Railway</strong> and our frontend on <strong>Vercel</strong>.
        </p>

        <h2 style={s.h2}>4. Third-Party Services</h2>
        <p style={s.p}>We use the following third-party services:</p>
        <ul style={s.ul}>
          <li style={s.li}><strong>Supabase</strong> — Authentication and data storage.</li>
          <li style={s.li}><strong>Anthropic Claude</strong> — AI Vision OCR and AI Fix processing. Images and code are sent to Anthropic's API for processing and are subject to <a href="https://www.anthropic.com/legal/privacy" style={s.link} target="_blank" rel="noreferrer">Anthropic's Privacy Policy</a>.</li>
          <li style={s.li}><strong>Razorpay</strong> — Payment processing. Subject to <a href="https://razorpay.com/privacy/" style={s.link} target="_blank" rel="noreferrer">Razorpay's Privacy Policy</a>.</li>
          <li style={s.li}><strong>Google</strong> — OAuth sign-in. Subject to <a href="https://policies.google.com/privacy" style={s.link} target="_blank" rel="noreferrer">Google's Privacy Policy</a>.</li>
        </ul>

        <h2 style={s.h2}>5. Data Retention</h2>
        <p style={s.p}>
          Your account and saved files are retained as long as your account is active. If you
          stop using the Service or your account is terminated, your files may be deleted after
          30 days. Payment records are retained for 7 years as required by applicable financial
          regulations.
        </p>

        <h2 style={s.h2}>6. Your Rights</h2>
        <p style={s.p}>You have the right to:</p>
        <ul style={s.ul}>
          <li style={s.li}>Access the personal data we hold about you.</li>
          <li style={s.li}>Request deletion of your account and associated data.</li>
          <li style={s.li}>Opt out of any non-essential communications.</li>
        </ul>
        <p style={s.p}>
          To exercise these rights, email us at{' '}
          <a href={`mailto:${EMAIL}`} style={s.link}>{EMAIL}</a>.
        </p>

        <h2 style={s.h2}>7. Cookies</h2>
        <p style={s.p}>
          We use session cookies for authentication (via Supabase Auth). We do not use
          third-party advertising or tracking cookies.
        </p>

        <h2 style={s.h2}>8. Children's Privacy</h2>
        <p style={s.p}>
          The Service is not intended for children under 13. We do not knowingly collect
          personal data from children. If you believe a child has provided us data, please
          contact us and we will delete it promptly.
        </p>

        <h2 style={s.h2}>9. Changes to This Policy</h2>
        <p style={s.p}>
          We may update this Privacy Policy from time to time. Changes will be posted on this
          page with a new effective date. Your continued use of the Service constitutes acceptance
          of the updated policy.
        </p>

        <h2 style={s.h2}>10. Contact</h2>
        <p style={s.p}>
          For privacy-related queries, contact us at{' '}
          <a href={`mailto:${EMAIL}`} style={s.link}>{EMAIL}</a>.
        </p>

        <div style={s.footer}>
          <Link href="/terms" style={s.link}>Terms &amp; Conditions</Link>
          <span style={s.sep}>·</span>
          <Link href="/refund" style={s.link}>Cancellation &amp; Refund Policy</Link>
          <span style={s.sep}>·</span>
          <Link href="/" style={s.link}>Home</Link>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#080c14',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  inner: {
    maxWidth: 780,
    margin: '0 auto',
    padding: '3rem 1.5rem 5rem',
  },
  nav: { marginBottom: '2rem' },
  back: { color: '#818cf8', textDecoration: 'none', fontSize: '0.88rem' },
  h1: {
    fontWeight: 800,
    fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
    color: '#f1f5f9',
    marginBottom: '0.4rem',
  },
  meta: { color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem', marginBottom: '2rem' },
  h2: {
    fontWeight: 700,
    fontSize: '1.05rem',
    color: '#f1f5f9',
    marginTop: '2rem',
    marginBottom: '0.5rem',
  },
  p: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '0.92rem',
    lineHeight: 1.75,
    marginBottom: '0.75rem',
  },
  ul: { paddingLeft: '1.5rem', marginBottom: '0.75rem' },
  li: { color: 'rgba(255,255,255,0.6)', fontSize: '0.92rem', lineHeight: 1.75, marginBottom: '0.3rem' },
  link: { color: '#818cf8', textDecoration: 'none' },
  footer: {
    marginTop: '3rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap' as any,
    fontSize: '0.85rem',
  },
  sep: { color: 'rgba(255,255,255,0.2)' },
}
