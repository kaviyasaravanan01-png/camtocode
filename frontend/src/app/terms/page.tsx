import Link from 'next/link'

export const metadata = {
  title: 'Terms & Conditions — CamToCode',
  description: 'Terms and Conditions for using CamToCode.',
}

export default function TermsPage() {
  const EFFECTIVE = 'April 20, 2026'
  const EMAIL     = 'anandanathurelangovan94@gmail.com'

  return (
    <div style={s.root}>
      <div style={s.inner}>
        <div style={s.nav}>
          <Link href="/" style={s.back}>← Back to Home</Link>
        </div>

        <h1 style={s.h1}>Terms &amp; Conditions</h1>
        <p style={s.meta}>Effective Date: {EFFECTIVE}</p>

        <p style={s.p}>
          Welcome to <strong>CamToCode</strong> ("we", "our", "us"). By accessing or using our
          website and services at <strong>camtocode.com</strong> (the "Service"), you agree to be
          bound by these Terms &amp; Conditions. Please read them carefully before using the Service.
        </p>

        <h2 style={s.h2}>1. Acceptance of Terms</h2>
        <p style={s.p}>
          By creating an account or using the Service in any way, you confirm that you are at least
          18 years of age, have read and understood these Terms, and agree to be legally bound by
          them. If you do not agree, you must not use the Service.
        </p>

        <h2 style={s.h2}>2. Description of Service</h2>
        <p style={s.p}>
          CamToCode is a software-as-a-service (SaaS) platform that uses AI Vision technology
          (Anthropic Claude) to extract, fix, and store code from photographs or camera captures.
          The Service is provided on a subscription basis with the following plans:
        </p>
        <ul style={s.ul}>
          <li style={s.li}><strong>Free</strong> — Limited scans per day, no AI Fix, 10 saved files.</li>
          <li style={s.li}><strong>Starter (₹599/month ≈ $7 USD)</strong> — 200 AI scans/day, 15 AI Fixes/month, 500 saved files.</li>
          <li style={s.li}><strong>Pro (₹1,499/month ≈ $18 USD)</strong> — 500 AI scans/day, 75 AI Fixes/month, 1,000 saved files, Claude Sonnet access.</li>
        </ul>

        <h2 style={s.h2}>3. User Accounts</h2>
        <p style={s.p}>
          You must sign in using Google OAuth to use paid features. You are responsible for
          maintaining the security of your account and all activity that occurs under it. We reserve
          the right to suspend or terminate accounts that violate these Terms.
        </p>

        <h2 style={s.h2}>4. Payments &amp; Billing</h2>
        <p style={s.p}>
          Paid plans are billed in Indian Rupees (INR) through <strong>Razorpay</strong>, a
          third-party payment processor. By purchasing a plan you authorise Razorpay to charge your
          selected payment method. All prices are inclusive of applicable taxes unless stated
          otherwise. Plan access is granted immediately upon successful payment confirmation.
        </p>
        <p style={s.p}>
          Subscriptions are <strong>not auto-renewed</strong>. Each plan is valid for 30 days from
          the date of purchase. You will need to manually renew by purchasing again before or after
          expiry. Upon expiry, your account will automatically be downgraded to the Free plan and
          usage counters will be reset.
        </p>

        <h2 style={s.h2}>5. Intellectual Property</h2>
        <p style={s.p}>
          The Service, including all software, design, and branding, is owned by CamToCode and
          protected by applicable intellectual property laws. The code content you capture and save
          remains your own. By using the Service you grant us no ownership over your content.
        </p>

        <h2 style={s.h2}>6. Acceptable Use</h2>
        <p style={s.p}>You agree not to:</p>
        <ul style={s.ul}>
          <li style={s.li}>Use the Service for any unlawful purpose or to violate any laws.</li>
          <li style={s.li}>Attempt to reverse-engineer, scrape, or circumvent usage limits.</li>
          <li style={s.li}>Share account credentials with others.</li>
          <li style={s.li}>Upload or capture content that infringes on third-party intellectual property.</li>
        </ul>

        <h2 style={s.h2}>7. Limitation of Liability</h2>
        <p style={s.p}>
          The Service is provided "as is" without warranties of any kind. We are not liable for any
          indirect, incidental, or consequential damages arising from your use of the Service,
          including loss of data or code content. Our total liability shall not exceed the amount
          paid by you in the three months preceding the claim.
        </p>

        <h2 style={s.h2}>8. Termination</h2>
        <p style={s.p}>
          We may terminate or suspend your account at any time for violation of these Terms. You
          may stop using the Service at any time. Upon termination, your saved files may be deleted
          after 30 days.
        </p>

        <h2 style={s.h2}>9. Changes to Terms</h2>
        <p style={s.p}>
          We reserve the right to modify these Terms at any time. Changes will be posted on this
          page with an updated effective date. Continued use of the Service after changes
          constitutes acceptance of the revised Terms.
        </p>

        <h2 style={s.h2}>10. Governing Law</h2>
        <p style={s.p}>
          These Terms are governed by the laws of India. Any disputes shall be subject to the
          exclusive jurisdiction of courts in India.
        </p>

        <h2 style={s.h2}>11. Contact Us</h2>
        <p style={s.p}>
          For any questions about these Terms, please contact us at{' '}
          <a href={`mailto:${EMAIL}`} style={s.link}>{EMAIL}</a>.
        </p>

        <div style={s.footer}>
          <Link href="/privacy" style={s.link}>Privacy Policy</Link>
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
