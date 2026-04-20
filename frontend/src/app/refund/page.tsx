import Link from 'next/link'

export const metadata = {
  title: 'Cancellation & Refund Policy — CamToCode',
  description: 'CamToCode cancellation and refund policy for Starter and Pro subscriptions.',
}

export default function RefundPage() {
  const EFFECTIVE = 'April 20, 2026'
  const EMAIL     = 'anandanathurelangovan94@gmail.com'

  return (
    <div style={s.root}>
      <div style={s.inner}>
        <div style={s.nav}>
          <Link href="/" style={s.back}>← Back to Home</Link>
        </div>

        <h1 style={s.h1}>Cancellation &amp; Refund Policy</h1>
        <p style={s.meta}>Effective Date: {EFFECTIVE}</p>

        <p style={s.p}>
          This policy applies to all paid subscriptions (Starter and Pro plans) purchased on
          <strong> CamToCode</strong> via Razorpay. Please read it carefully before making a
          purchase.
        </p>

        <h2 style={s.h2}>1. Subscription Model</h2>
        <p style={s.p}>
          CamToCode subscriptions are <strong>one-time 30-day purchases</strong>. They are
          <strong> not auto-renewed</strong>. You pay once and get access for 30 days from the
          date of payment. There are no recurring charges unless you manually purchase again.
        </p>

        <h2 style={s.h2}>2. Cancellation Policy</h2>
        <p style={s.p}>
          Since subscriptions are not auto-renewed, there is nothing to "cancel" in the
          traditional sense. Your plan simply expires after 30 days and your account reverts
          to the Free tier automatically — no action needed.
        </p>
        <p style={s.p}>
          If you no longer wish to use the Service, you may simply stop using it. No cancellation
          request is required.
        </p>

        <h2 style={s.h2}>3. Refund Policy</h2>
        <p style={s.p}>
          We offer refunds under the following conditions:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>
            <strong>Full refund within 24 hours:</strong> If you request a refund within 24 hours
            of purchase and have used fewer than 5 AI scans, we will issue a full refund.
          </li>
          <li style={s.li}>
            <strong>Technical failure:</strong> If a technical issue on our platform prevented you
            from accessing the paid features you purchased, we will issue a full refund upon
            verification.
          </li>
          <li style={s.li}>
            <strong>Duplicate payment:</strong> If you were charged twice for the same plan, we
            will immediately refund the duplicate charge.
          </li>
        </ul>

        <h2 style={s.h2}>4. Non-Refundable Situations</h2>
        <p style={s.p}>Refunds will <strong>not</strong> be issued in the following cases:</p>
        <ul style={s.ul}>
          <li style={s.li}>More than 24 hours have passed since purchase and the service has been used.</li>
          <li style={s.li}>You changed your mind after actively using the plan features.</li>
          <li style={s.li}>The plan has expired naturally after 30 days.</li>
          <li style={s.li}>Account suspension due to violation of our Terms &amp; Conditions.</li>
          <li style={s.li}>Issues caused by third-party services (internet connectivity, device issues, etc.).</li>
        </ul>

        <h2 style={s.h2}>5. How to Request a Refund</h2>
        <p style={s.p}>
          To request a refund, email us at{' '}
          <a href={`mailto:${EMAIL}?subject=CamToCode Refund Request`} style={s.link}>{EMAIL}</a>{' '}
          with the subject line <strong>"Refund Request"</strong> and include:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Your registered email address.</li>
          <li style={s.li}>Razorpay Payment ID (found in your payment confirmation email).</li>
          <li style={s.li}>Reason for the refund request.</li>
        </ul>
        <p style={s.p}>
          We will review your request and respond within <strong>3–5 business days</strong>.
          Approved refunds will be processed back to the original payment method within
          <strong> 5–7 business days</strong> depending on your bank.
        </p>

        <h2 style={s.h2}>6. Refund Processing</h2>
        <p style={s.p}>
          All refunds are processed through <strong>Razorpay</strong> back to the original
          payment instrument (card, UPI, net banking, or wallet). Razorpay's standard
          refund timelines apply:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>UPI / Wallets: 1–3 business days</li>
          <li style={s.li}>Debit / Credit Cards: 5–7 business days</li>
          <li style={s.li}>Net Banking: 3–5 business days</li>
        </ul>

        <h2 style={s.h2}>7. Plan Downgrade on Refund</h2>
        <p style={s.p}>
          Upon approval of a refund, your account will be immediately downgraded to the Free plan
          and any paid plan access will be revoked.
        </p>

        <h2 style={s.h2}>8. Contact</h2>
        <p style={s.p}>
          For any billing or refund queries, contact us at{' '}
          <a href={`mailto:${EMAIL}`} style={s.link}>{EMAIL}</a>.
          We aim to resolve all queries within 3 business days.
        </p>

        <div style={s.footer}>
          <Link href="/terms" style={s.link}>Terms &amp; Conditions</Link>
          <span style={s.sep}>·</span>
          <Link href="/privacy" style={s.link}>Privacy Policy</Link>
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
