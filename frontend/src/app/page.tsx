'use client'
import Link from 'next/link'
import PayButton from '@/components/PayButton'

// ─── Pricing data ────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    color: '#64748b',
    features: [
      '3 AI Vision scans / day',
      '20 total scans / day',
      '200 scans / month',
      'Top 100 lines per scan',
      '10 saved files',
      'Tesseract fallback OCR',
      'No AI Fix (upgrade to unlock)',
    ],
    cta: 'Get Started Free',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$7',
    period: 'per month',
    color: '#0ea5e9',
    features: [
      '200 AI Vision scans / day',
      '6,000 scans / month',
      '15 AI Fix requests / month',
      'Top 300 lines per scan',
      '500 saved files',
      '120K fix token budget',
      'Files split into parts if large',
    ],
    cta: 'Start Starter',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$18',
    period: 'per month',
    color: '#8b5cf6',
    features: [
      '500 AI Vision scans / day',
      '15,000 scans / month',
      '75 AI Fix requests / month',
      'Top 1,000 lines per scan',
      '1,000 saved files',
      '900K fix token budget',
      'Claude Sonnet for large files',
      'Large files auto-merged into one',
    ],
    cta: 'Go Pro',
    highlight: true,
  },
]

const ADD_ONS = [
  { label: '+1,000 extra scans',  price: '$4'  },
  { label: '+5,000 extra scans',  price: '$12' },
  { label: '+20 AI fixes',        price: '$3'  },
  { label: '+100 AI fixes',       price: '$10' },
  { label: '+1M fix tokens',      price: '$3'  },
  { label: '+5M fix tokens',      price: '$9'  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Open the Camera',
    desc: 'Open CamToCode on any device — phone, tablet, or desktop. No installation required.',
  },
  {
    step: '02',
    title: 'Point at Your Code',
    desc: 'Aim your camera at a whiteboard, textbook, monitor, or any printed code. Tap Scan.',
  },
  {
    step: '03',
    title: 'Claude Reads It',
    desc: 'Claude Vision AI extracts every character accurately — handles messy handwriting, glare, and off-angles.',
  },
  {
    step: '04',
    title: 'AI Fix & Save',
    desc: 'Optionally run AI Fix to auto-correct syntax errors, then save the clean file to your cloud storage.',
  },
]

const FEATURES = [
  {
    icon: '📸',
    title: 'Camera-First Capture',
    desc: 'Capture from a live camera or upload a photo. Supports single shot, auto-burst, and bulk import.',
  },
  {
    icon: '🤖',
    title: 'Claude Vision OCR',
    desc: 'Powered by Anthropic Claude — far more accurate than traditional Tesseract OCR, especially for dense code.',
  },
  {
    icon: '🔧',
    title: 'AI Fix (One Click)',
    desc: 'Detects and repairs syntax errors, indentation issues, and misread characters automatically.',
  },
  {
    icon: '📂',
    title: 'Cloud File History',
    desc: 'Every saved file is stored in your personal cloud bucket. Download anytime from the History page.',
  },
  {
    icon: '⚡',
    title: 'Real-Time Streaming',
    desc: 'Results stream token-by-token as Claude processes. No waiting for a full round-trip.',
  },
  {
    icon: '🔒',
    title: 'Secure & Private',
    desc: 'Files stored under your user ID in isolated Supabase Storage. No one else can see your code.',
  },
  {
    icon: '🌍',
    title: 'Works Everywhere',
    desc: 'Progressive Web App — works on iOS, Android, and desktop browsers. No app store needed.',
  },
  {
    icon: '🧠',
    title: 'Sonnet for Complex Files',
    desc: 'Pro plan automatically routes large, complex files to Claude Sonnet for higher accuracy.',
  },
]

const FAQ = [
  {
    q: 'What programming languages does it support?',
    a: 'Any language visible in a photo — Python, JavaScript, Java, C++, Go, Rust, and more. Claude reads code character-by-character regardless of language.',
  },
  {
    q: 'What is the difference between a "scan" and an "AI scan"?',
    a: 'An AI scan uses Claude Vision (more accurate, costs tokens). A regular scan falls back to Tesseract OCR (offline, fast, less accurate). Both count toward your daily scan limit.',
  },
  {
    q: 'What is AI Fix?',
    a: 'After scanning, AI Fix sends the raw extracted code back to Claude to repair syntax errors, fix indentation, and correct misread characters — producing clean, runnable code.',
  },
  {
    q: 'Can I use CamToCode on my phone?',
    a: 'Yes. Open the URL in Safari or Chrome on iPhone/Android. Tap "Add to Home Screen" for a native-like app experience.',
  },
  {
    q: 'What happens when I hit my plan limit?',
    a: 'You will see a clear message explaining which limit was reached. Your existing saved files are never affected. Upgrade or wait for the limit to reset.',
  },
  {
    q: 'When will Razorpay / payment be available?',
    a: 'Razorpay payments are live now for Starter ($7/mo) and Pro ($18/mo) plans. Click "Upgrade" on any plan card or visit your Account page after signing in. International payments via Stripe are coming soon.',
  },
  {
    q: 'Is my data safe?',
    a: 'All files are stored in Supabase Storage under your unique user ID with row-level security and encryption. No one else can access your files.',
  },
]

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav style={s.nav}>
      <a href="/" style={s.navLogo}>CamToCode</a>
      <div style={s.navLinks}>
        <a href="#features" style={s.navLink}>Features</a>
        <a href="#how-it-works" style={s.navLink}>How It Works</a>
        <a href="#pricing" style={s.navLink}>Pricing</a>
        <a href="#faq" style={s.navLink}>FAQ</a>
        <a href="#help" style={s.navLink}>Help</a>
      </div>
      <div style={s.navActions}>
        <Link href="/login" style={s.signInBtn}>Sign In</Link>
        <Link href="/login" style={s.getStartedBtn}>Get Started Free</Link>
      </div>
    </nav>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={s.root}>
      <Nav />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={s.hero}>
        <div style={s.heroBadge}>Powered by Claude Vision AI</div>
        <h1 style={s.heroTitle}>
          Point your camera at code.<br />
          <span style={s.heroGradient}>Get clean code instantly.</span>
        </h1>
        <p style={s.heroSub}>
          CamToCode uses Anthropic's Claude Vision to extract code from any photo —
          whiteboards, textbooks, monitors, handwritten notes. One tap to scan,
          one click to fix, one button to save.
        </p>
        <div style={s.heroCtas}>
          <Link href="/login" style={s.ctaPrimary}>Start for Free →</Link>
          <a href="#how-it-works" style={s.ctaSecondary}>See How It Works</a>
        </div>
        <div style={s.heroStats}>
          <div style={s.heroStat}><span style={s.heroStatNum}>Claude</span><span style={s.heroStatLabel}>Vision AI</span></div>
          <div style={s.heroStatDivider} />
          <div style={s.heroStat}><span style={s.heroStatNum}>Any Language</span><span style={s.heroStatLabel}>Supported</span></div>
          <div style={s.heroStatDivider} />
          <div style={s.heroStat}><span style={s.heroStatNum}>Real-Time</span><span style={s.heroStatLabel}>Streaming</span></div>
          <div style={s.heroStatDivider} />
          <div style={s.heroStat}><span style={s.heroStatNum}>Worldwide</span><span style={s.heroStatLabel}>Access</span></div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" style={s.section}>
        <div style={s.sectionInner}>
          <p style={s.sectionTag}>Simple Process</p>
          <h2 style={s.sectionTitle}>How CamToCode Works</h2>
          <p style={s.sectionSub}>From camera to clean code in under 10 seconds.</p>
          <div style={s.stepsGrid}>
            {HOW_IT_WORKS.map(item => (
              <div key={item.step} style={s.stepCard}>
                <span style={s.stepNum}>{item.step}</span>
                <h3 style={s.stepTitle}>{item.title}</h3>
                <p style={s.stepDesc}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" style={{ ...s.section, background: 'rgba(255,255,255,0.02)' }}>
        <div style={s.sectionInner}>
          <p style={s.sectionTag}>Everything You Need</p>
          <h2 style={s.sectionTitle}>Features Built for Developers</h2>
          <p style={s.sectionSub}>
            A complete toolkit for capturing, fixing, and storing code from any source.
          </p>
          <div style={s.featGrid}>
            {FEATURES.map(f => (
              <div key={f.title} style={s.featCard}>
                <span style={s.featIcon}>{f.icon}</span>
                <h3 style={s.featTitle}>{f.title}</h3>
                <p style={s.featDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use Cases ─────────────────────────────────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <p style={s.sectionTag}>Who Is It For</p>
          <h2 style={s.sectionTitle}>Perfect For Every Developer</h2>
          <div style={s.useCaseGrid}>
            {[
              { icon: '🎓', title: 'Students', desc: 'Capture code from slides, textbooks, or a professor\'s whiteboard instantly without retyping.' },
              { icon: '🏢', title: 'Engineers', desc: 'Digitize legacy code from printed manuals, post-its, or someone\'s monitor without error.' },
              { icon: '📚', title: 'Educators', desc: 'Quickly digitize example code from books to share with students as runnable files.' },
              { icon: '🔬', title: 'Researchers', desc: 'Extract code from journal papers, conference slides, or lab whiteboards effortlessly.' },
            ].map(u => (
              <div key={u.title} style={s.useCaseCard}>
                <span style={{ fontSize: '2rem' }}>{u.icon}</span>
                <h3 style={s.useCaseTitle}>{u.title}</h3>
                <p style={s.useCaseDesc}>{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ ...s.section, background: 'rgba(255,255,255,0.02)' }}>
        <div style={s.sectionInner}>
          <p style={s.sectionTag}>Simple Pricing</p>
          <h2 style={s.sectionTitle}>Plans for Every Need</h2>
          <p style={s.sectionSub}>
            All prices in USD. Cancel anytime. No hidden fees.
          </p>
          <div style={s.plansGrid}>
            {PLANS.map(plan => (
              <div
                key={plan.name}
                style={{
                  ...s.planCard,
                  borderColor: plan.highlight ? plan.color : 'rgba(255,255,255,0.1)',
                  boxShadow: plan.highlight ? `0 0 40px ${plan.color}33` : undefined,
                }}
              >
                {plan.highlight && (
                  <div style={{ ...s.popularBadge, background: plan.color }}>Most Popular</div>
                )}
                <div style={{ ...s.planChip, background: plan.color }}>{plan.name}</div>
                <div style={s.planPrice}>
                  <span style={s.planPriceNum}>{plan.price}</span>
                  <span style={s.planPricePeriod}>/{plan.period}</span>
                </div>
                <ul style={s.planFeatures}>
                  {plan.features.map(f => (
                    <li key={f} style={s.planFeature}>
                      <span style={{ color: plan.color, marginRight: 8 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                {plan.name === 'Free' ? (
                  <Link href="/login" style={{ ...s.planCta, background: 'rgba(255,255,255,0.08)', textDecoration: 'none' }}>
                    {plan.cta}
                  </Link>
                ) : (
                  <PayButton
                    plan={plan.name.toLowerCase() as 'starter' | 'pro'}
                    label={plan.cta}
                    style={{ background: plan.highlight ? `linear-gradient(135deg,${plan.color},${plan.color}cc)` : undefined }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Add-ons */}
          <div style={s.addonsWrap}>
            <h3 style={s.addonsTitle}>Add-On Packs (coming soon)</h3>
            <p style={s.addonsSub}>Need more? Top up without upgrading your plan.</p>
            <div style={s.addonsGrid}>
              {ADD_ONS.map(a => (
                <div key={a.label} style={s.addonCard}>
                  <span style={s.addonLabel}>{a.label}</span>
                  <span style={s.addonPrice}>{a.price}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section id="faq" style={s.section}>
        <div style={s.sectionInner}>
          <p style={s.sectionTag}>FAQ</p>
          <h2 style={s.sectionTitle}>Frequently Asked Questions</h2>
          <div style={s.faqGrid}>
            {FAQ.map(item => (
              <div key={item.q} style={s.faqCard}>
                <h3 style={s.faqQ}>{item.q}</h3>
                <p style={s.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Help & Support ────────────────────────────────────────────────── */}
      <section style={s.section} id="help">
        <div style={s.sectionInner}>
          <p style={s.sectionTag}>We're Here to Help</p>
          <h2 style={s.sectionTitle}>Help & Support</h2>
          <p style={s.sectionSub}>
            Questions about your plan, billing, or how the app works?
            Send us an email — we typically respond within 24 hours.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a
              href="mailto:anandanathurelangovan94@gmail.com?subject=CamToCode Support"
              style={s.helpCardBtn}
            >
              ✉️ General Support
            </a>
            <a
              href="mailto:anandanathurelangovan94@gmail.com?subject=CamToCode Plan Upgrade"
              style={{ ...s.helpCardBtn, background: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.3)', color: '#818cf8' }}
            >
              💳 Plan / Billing
            </a>
            <a
              href="mailto:anandanathurelangovan94@gmail.com?subject=CamToCode Bug Report"
              style={{ ...s.helpCardBtn, background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)', color: '#fca5a5' }}
            >
              🐛 Bug Report
            </a>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', marginTop: 20 }}>
            anandanathurelangovan94@gmail.com
          </p>
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────────────────── */}
      <section style={s.ctaBanner}>
        <div style={s.ctaBannerInner}>
          <h2 style={s.ctaBannerTitle}>Ready to stop retyping code?</h2>
          <p style={s.ctaBannerSub}>
            Join developers who use CamToCode to digitize code in seconds — for free.
          </p>
          <Link href="/login" style={s.ctaBannerBtn}>Get Started Free — No Card Required</Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <div style={s.footerBrand}>
            <span style={s.footerLogo}>CamToCode</span>
            <p style={s.footerTagline}>
              Point your camera at code. Get clean code instantly.
            </p>
          </div>
          <div style={s.footerLinks}>
            <div style={s.footerCol}>
              <span style={s.footerColTitle}>Product</span>
              <a href="#features" style={s.footerLink}>Features</a>
              <a href="#how-it-works" style={s.footerLink}>How It Works</a>
              <a href="#pricing" style={s.footerLink}>Pricing</a>
            </div>
            <div style={s.footerCol}>
              <span style={s.footerColTitle}>Account</span>
              <Link href="/login" style={s.footerLink}>Sign In</Link>
              <Link href="/login" style={s.footerLink}>Sign Up</Link>
              <Link href="/app" style={s.footerLink}>Open App</Link>
            </div>
            <div style={s.footerCol}>
              <span style={s.footerColTitle}>Legal</span>
              <Link href="/terms"   style={s.footerLink}>Terms &amp; Conditions</Link>
              <Link href="/privacy" style={s.footerLink}>Privacy Policy</Link>
              <Link href="/refund"  style={s.footerLink}>Refund Policy</Link>
            </div>
            <div style={s.footerCol}>
              <span style={s.footerColTitle}>Support</span>
              <a href="#help" style={s.footerLink}>FAQ</a>
              <a href="mailto:anandanathurelangovan94@gmail.com" style={s.footerLink}>Contact Us</a>
            </div>
          </div>
        </div>
        <div style={s.footerBottom}>
          <span style={s.footerCopy}>© {new Date().getFullYear()} CamToCode. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as any }}>
            <Link href="/terms"   style={s.footerCopy}>Terms</Link>
            <Link href="/privacy" style={s.footerCopy}>Privacy</Link>
            <Link href="/refund"  style={s.footerCopy}>Refund Policy</Link>
            <span style={s.footerCopy}>Powered by Anthropic Claude</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#080c14',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif',
    overflowX: 'hidden',
  },

  // Nav
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.9rem 2rem',
    background: 'rgba(8,12,20,0.85)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    gap: 16,
  },
  navLogo: {
    fontWeight: 800,
    fontSize: '1.2rem',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textDecoration: 'none',
    flexShrink: 0,
  },
  navLinks: {
    display: 'flex',
    gap: 28,
    alignItems: 'center',
  },
  navLink: {
    color: 'rgba(255,255,255,0.55)',
    textDecoration: 'none',
    fontSize: '0.88rem',
    fontWeight: 500,
    transition: 'color 0.2s',
  },
  navActions: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexShrink: 0,
  },
  signInBtn: {
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: '0.88rem',
    fontWeight: 500,
    padding: '0.4rem 0.9rem',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
  },
  getStartedBtn: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    textDecoration: 'none',
    fontSize: '0.85rem',
    fontWeight: 600,
    padding: '0.45rem 1rem',
    borderRadius: 8,
  },

  // Hero
  hero: {
    textAlign: 'center',
    padding: '5rem 2rem 4rem',
    maxWidth: 820,
    margin: '0 auto',
  },
  heroBadge: {
    display: 'inline-block',
    background: 'rgba(99,102,241,0.15)',
    border: '1px solid rgba(99,102,241,0.35)',
    color: '#818cf8',
    borderRadius: 20,
    padding: '0.3rem 1rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    marginBottom: '1.5rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 'clamp(2rem, 5vw, 3.4rem)',
    fontWeight: 800,
    lineHeight: 1.15,
    marginBottom: '1.2rem',
    color: '#f1f5f9',
  },
  heroGradient: {
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  heroSub: {
    fontSize: '1.05rem',
    color: 'rgba(255,255,255,0.55)',
    maxWidth: 620,
    margin: '0 auto 2rem',
    lineHeight: 1.75,
  },
  heroCtas: {
    display: 'flex',
    justifyContent: 'center',
    gap: 14,
    flexWrap: 'wrap',
    marginBottom: '3rem',
  },
  ctaPrimary: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    padding: '0.8rem 2rem',
    borderRadius: 10,
    fontWeight: 700,
    textDecoration: 'none',
    fontSize: '1rem',
  },
  ctaSecondary: {
    border: '1px solid rgba(255,255,255,0.18)',
    color: 'rgba(255,255,255,0.75)',
    padding: '0.8rem 2rem',
    borderRadius: 10,
    fontWeight: 600,
    textDecoration: 'none',
    fontSize: '1rem',
  },
  heroStats: {
    display: 'flex',
    justifyContent: 'center',
    gap: 0,
    flexWrap: 'wrap',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: '2rem',
  },
  heroStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 2rem',
    gap: 4,
  },
  heroStatNum: {
    fontWeight: 700,
    fontSize: '1rem',
    color: '#f1f5f9',
  },
  heroStatLabel: {
    fontSize: '0.72rem',
    color: 'rgba(255,255,255,0.4)',
  },
  heroStatDivider: {
    width: 1,
    background: 'rgba(255,255,255,0.08)',
    alignSelf: 'stretch',
  },

  // Sections
  section: {
    padding: '5rem 2rem',
  },
  sectionInner: {
    maxWidth: 1100,
    margin: '0 auto',
    textAlign: 'center',
  },
  sectionTag: {
    display: 'inline-block',
    background: 'rgba(99,102,241,0.12)',
    color: '#818cf8',
    borderRadius: 20,
    padding: '0.25rem 0.9rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.8rem',
  },
  sectionTitle: {
    fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
    fontWeight: 800,
    color: '#f1f5f9',
    marginBottom: '0.75rem',
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.98rem',
    marginBottom: '3rem',
    maxWidth: 580,
    margin: '0 auto 3rem',
    lineHeight: 1.65,
  },

  // Steps
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 24,
    textAlign: 'left',
  },
  stepCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '1.6rem',
  },
  stepNum: {
    display: 'block',
    fontWeight: 800,
    fontSize: '2rem',
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: '0.7rem',
  },
  stepTitle: {
    fontWeight: 700,
    fontSize: '1rem',
    color: '#f1f5f9',
    marginBottom: '0.5rem',
  },
  stepDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.88rem',
    lineHeight: 1.65,
    margin: 0,
  },

  // Features
  featGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
    gap: 20,
    textAlign: 'left',
  },
  featCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '1.4rem',
  },
  featIcon: {
    display: 'block',
    fontSize: '1.6rem',
    marginBottom: '0.7rem',
  },
  featTitle: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: '#f1f5f9',
    marginBottom: '0.4rem',
  },
  featDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '0.84rem',
    lineHeight: 1.65,
    margin: 0,
  },

  // Use cases
  useCaseGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 20,
    textAlign: 'left',
    marginTop: '1rem',
  },
  useCaseCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '1.4rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  useCaseTitle: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: '#f1f5f9',
    margin: 0,
  },
  useCaseDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '0.84rem',
    lineHeight: 1.65,
    margin: 0,
  },

  // Pricing
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
    gap: 24,
    textAlign: 'left',
    marginBottom: '3rem',
    alignItems: 'start',
  },
  planCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid',
    borderRadius: 16,
    padding: '1.8rem',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: 'translateX(-50%)',
    borderRadius: 20,
    padding: '0.2rem 0.9rem',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
  },
  planChip: {
    display: 'inline-block',
    borderRadius: 6,
    padding: '2px 10px',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.9rem',
    alignSelf: 'flex-start',
  },
  planPrice: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: '1.2rem',
  },
  planPriceNum: {
    fontWeight: 800,
    fontSize: '2.4rem',
    color: '#f1f5f9',
  },
  planPricePeriod: {
    fontSize: '0.85rem',
    color: 'rgba(255,255,255,0.4)',
  },
  planFeatures: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 1.4rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexGrow: 1,
  },
  planFeature: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '0.86rem',
    lineHeight: 1.5,
  },
  planCta: {
    display: 'block',
    textAlign: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.9rem',
    borderRadius: 10,
    padding: '0.65rem',
    textDecoration: 'none',
  },

  // Add-ons
  addonsWrap: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '2rem',
    textAlign: 'center',
  },
  addonsTitle: {
    fontWeight: 700,
    fontSize: '1.05rem',
    color: '#f1f5f9',
    marginBottom: '0.4rem',
  },
  addonsSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '0.85rem',
    marginBottom: '1.4rem',
  },
  addonsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    maxWidth: 700,
    margin: '0 auto',
  },
  addonCard: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '0.8rem 1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addonLabel: {
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.65)',
  },
  addonPrice: {
    fontWeight: 700,
    fontSize: '0.9rem',
    color: '#f1f5f9',
  },

  // FAQ
  faqGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 16,
    textAlign: 'left',
    marginTop: '1rem',
  },
  faqCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: '1.2rem 1.4rem',
  },
  faqQ: {
    fontWeight: 700,
    fontSize: '0.92rem',
    color: '#f1f5f9',
    marginBottom: '0.5rem',
  },
  faqA: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.85rem',
    lineHeight: 1.65,
    margin: 0,
  },

  // CTA Banner
  ctaBanner: {
    background: 'linear-gradient(135deg, rgba(79,70,229,0.25) 0%, rgba(124,58,237,0.25) 100%)',
    borderTop: '1px solid rgba(99,102,241,0.2)',
    borderBottom: '1px solid rgba(99,102,241,0.2)',
    padding: '4rem 2rem',
    textAlign: 'center',
  },
  ctaBannerInner: {
    maxWidth: 600,
    margin: '0 auto',
  },
  ctaBannerTitle: {
    fontWeight: 800,
    fontSize: 'clamp(1.5rem, 3vw, 2rem)',
    color: '#f1f5f9',
    marginBottom: '0.8rem',
  },
  ctaBannerSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: '0.98rem',
    marginBottom: '1.8rem',
    lineHeight: 1.65,
  },
  ctaBannerBtn: {
    display: 'inline-block',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    padding: '0.85rem 2.2rem',
    borderRadius: 10,
    fontWeight: 700,
    textDecoration: 'none',
    fontSize: '1rem',
  },

  // Footer
  footer: {
    background: 'rgba(0,0,0,0.3)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    padding: '3rem 2rem 1.5rem',
  },
  footerInner: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 32,
    paddingBottom: '2rem',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '1.5rem',
  },
  footerBrand: {
    maxWidth: 260,
  },
  footerLogo: {
    fontWeight: 800,
    fontSize: '1.1rem',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    display: 'block',
    marginBottom: '0.6rem',
  },
  footerTagline: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: '0.82rem',
    lineHeight: 1.6,
    margin: 0,
  },
  footerLinks: {
    display: 'flex',
    gap: 48,
    flexWrap: 'wrap',
  },
  footerCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  footerColTitle: {
    fontWeight: 700,
    fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 4,
  },
  footerLink: {
    color: 'rgba(255,255,255,0.4)',
    textDecoration: 'none',
    fontSize: '0.85rem',
    lineHeight: 1,
  },
  footerBottom: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  footerCopy: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: '0.78rem',
  },
  helpCardBtn: {
    display:      'inline-block',
    background:   'rgba(255,255,255,0.06)',
    border:       '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding:      '0.65rem 1.4rem',
    color:        'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize:     '0.9rem',
    fontWeight:   500,
  },
}
