import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'

export const metadata = {
  title: 'Docs',
  description: `How to use ${SITE_NAME} with Scroll Automation for long files, auto-recapture, and office-friendly workflows.`,
}

export default function DocsPage() {
  return (
    <div className="ctc-docs">
      <header className="ctc-docs-header">
        <Link href="/" className="ctc-docs-logo">{SITE_NAME}</Link>
        <nav className="ctc-docs-nav">
          <Link href="/scroll">Scroll Automation</Link>
          <Link href="/app">Camera App</Link>
          <Link href="/try">Try Free</Link>
        </nav>
      </header>

      <main className="ctc-docs-main">
        <h1>Documentation</h1>
        <p className="ctc-docs-lead">
          Guides for capturing long source files with {SITE_NAME} — especially on office laptops where
          extensions and installs are blocked.
        </p>

        <section id="scroll-automation">
          <h2>Scroll Automation + CamToCode</h2>
          <p>
            <strong>Scroll Automation</strong> is a free, client-side page at{' '}
            <Link href="/scroll">/scroll</Link>. It opens a file from your computer and scrolls it in
            fixed sections — no login, no API, nothing leaves your browser.
          </p>
          <p>
            Use it on your <strong>laptop</strong> while <strong>CamToCode on your phone</strong> captures
            each section. You avoid scrolling inside VS Code or other locked-down editors.
          </p>

          <h3>Why this works in offices</h3>
          <ul>
            <li>No software install — only a normal website URL</li>
            <li>File stays on your machine (read locally in the browser)</li>
            <li>No backend calls for scrolling or file display</li>
            <li>Works with any editor: export or open the same file via the file picker</li>
          </ul>

          <h3>Recommended setup</h3>
          <ol>
            <li>
              <strong>Laptop:</strong> Open <Link href="/scroll">camtocode.com/scroll</Link> in Chrome or Edge.
              Click <em>Open file</em> and choose your <code>.py</code>, <code>.js</code>, etc.
            </li>
            <li>
              <strong>Display:</strong> Use <em>Fullscreen</em>. Adjust background/text colors, font size, <strong>zoom (+/−)</strong>, and bold for clear phone capture.
            </li>
            <li>
              <strong>Step size:</strong> Enable <em>Auto lines per step (from screen)</em> so each chunk matches
              what fits on screen — or set a fixed line count that matches your phone camera crop.
            </li>
            <li>
              <strong>Phone:</strong> Open CamToCode → point camera at the laptop screen → crop ROI to the code
              block only.
            </li>
            <li>
              <strong>CamToCode settings:</strong> Turn on <em>Auto Re-capture</em> and set interval (e.g. 10–15s)
              or capture manually between scrolls.
            </li>
          </ol>

          <h3>Two scroll modes</h3>

          <h4>Keyboard mode (best with manual capture)</h4>
          <p>Click the scroll page once so it has focus, then:</p>
          <table className="ctc-docs-table">
            <thead>
              <tr><th>Key</th><th>Action</th></tr>
            </thead>
            <tbody>
              <tr><td><kbd>S</kbd></td><td>Advance to the next section (after phone finished capturing)</td></tr>
              <tr><td><kbd>P</kbd></td><td>Pause — block <kbd>S</kbd> until you resume</td></tr>
              <tr><td><kbd>T</kbd></td><td>Terminate — stop session and jump back to line 1</td></tr>
            </tbody>
          </table>
          <p>
            <strong>Workflow:</strong> First section is already visible → capture on phone → press <kbd>S</kbd> on
            laptop → capture next section → repeat. Last chunk automatically shows only remaining lines (e.g. 10
            lines left when step is 30).
          </p>

          <h4>Timer mode (best with Auto Re-capture)</h4>
          <p>
            Set the timer interval to match CamToCode&apos;s <em>Auto Re-capture</em> delay (e.g. both 10 seconds).
            Press <em>Start timer</em> on the laptop when you start capturing on the phone. Sections advance in sync.
          </p>
          <p>
            Use <em>Pause</em> / <em>Stop</em> on the scroll page if you need to adjust the camera or ROI.
          </p>

          <h3>Tips for clean captures</h3>
          <ul>
            <li>Match <strong>step size</strong> on the scroll page to your <strong>camera ROI height</strong> — slight overlap helps merge chunks.</li>
            <li>Use <em>Scan Separator</em> in CamToCode settings so merged output shows chunk boundaries.</li>
            <li>Prefer <strong>Standard OCR</strong> or higher for long files; use <strong>Quick OCR</strong> for clear screens.</li>
            <li>Enable <em>Night Mode</em> on the phone if the screen has glare.</li>
            <li>Re-open the file on the scroll page if you edit it in VS Code — the browser does not auto-sync disk changes.</li>
          </ul>

          <div className="ctc-docs-cta">
            <Link href="/scroll" className="ctc-docs-btn ctc-docs-btn--primary">Open Scroll Automation</Link>
            <Link href="/app" className="ctc-docs-btn">Open Camera App</Link>
          </div>
        </section>

        <section id="auto-recapture">
          <h2>Auto Re-capture (CamToCode app)</h2>
          <p>
            In the camera app <em>Settings</em>, enable <strong>Auto Re-capture</strong> and choose an interval.
            After each scan completes, a countdown runs and the next capture starts automatically — accumulated
            text is appended to your session.
          </p>
          <ul>
            <li><strong>Pause</strong> during countdown if you need more time to scroll (or use Scroll Automation on the laptop).</li>
            <li><strong>Scan Separator</strong> inserts a visible divider between chunks.</li>
            <li>Use <strong>Enlarge</strong> mode and crop ROI for consistent framing.</li>
          </ul>
        </section>

        <section id="guest-try">
          <h2>Free try scan</h2>
          <p>
            <Link href="/try">/try</Link> offers one free Quick OCR scan without login. Scroll Automation and Docs
            are always free and do not require an account.
          </p>
        </section>

        <section id="privacy">
          <h2>Privacy note</h2>
          <p>
            Scroll Automation never uploads your file. CamToCode OCR sends camera frames to AI providers when AI
            Vision is enabled — see <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </main>

      <footer className="ctc-docs-footer">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/refund">Refund</Link>
      </footer>
    </div>
  )
}
