import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'
import { buildPageMetadata } from '@/lib/seo'

export const metadata = buildPageMetadata({
  title: 'Documentation — CamToCode, Scroll Automation & Auto Re-capture',
  description:
    'How to use camtocode.com with Scroll Automation, Auto Re-capture, keyboard shortcuts, and office-friendly workflows. Free tools, no install.',
  path: '/docs',
})

export default function DocsPage() {
  return (
    <div className="ctc-docs">
      <header className="ctc-docs-header">
        <Link href="/" className="ctc-docs-logo">{SITE_NAME}</Link>
        <nav className="ctc-docs-nav">
          <Link href="/blog">Blog</Link>
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

          <h3>Display &amp; settings</h3>
          <p>
            Open <em>Settings</em> on the scroll page (hidden in fullscreen — configure before you go full screen).
            All options are saved in your browser automatically. Nothing is sent to a server.
          </p>
          <table className="ctc-docs-table">
            <thead>
              <tr><th>Setting</th><th>What it does</th></tr>
            </thead>
            <tbody>
              <tr><td>Background / text color</td><td>Match your screen for clearer phone capture (e.g. black bg, white text)</td></tr>
              <tr><td>Font size &amp; zoom (+/−)</td><td>Make code larger on screen; zoom also affects auto line detection</td></tr>
              <tr><td>Font family &amp; bold</td><td>Monospace presets or system font; bold for low-light capture</td></tr>
              <tr><td>Line height &amp; padding</td><td>Fine-tune spacing to match your camera crop</td></tr>
              <tr><td>Line numbers</td><td>Show or hide — toggle off if numbers clutter the capture</td></tr>
              <tr><td>Auto lines per step</td><td>When on, step size = visible lines on screen; when off, set a fixed line count</td></tr>
              <tr><td>Scroll mode</td><td><em>Keyboard</em> (manual) or <em>Timer</em> (auto every N seconds)</td></tr>
            </tbody>
          </table>

          <h3>Fullscreen</h3>
          <p>
            Press <kbd>F</kbd> or click <em>Fullscreen</em> to show <strong>code only</strong> — header, status bar,
            hints, buttons, and settings are all hidden so your phone captures a clean screen.
          </p>
          <ul>
            <li>Exit with <kbd>Esc</kbd>, <kbd>F</kbd>, or the small <strong>✕</strong> that appears when you move the mouse to the top-right corner</li>
            <li>Keyboard shortcuts (<kbd>S</kbd> <kbd>N</kbd> <kbd>P</kbd> <kbd>T</kbd>) still work in fullscreen</li>
          </ul>

          <h3>Mouse scroll</h3>
          <p>
            You can scroll the file freely with the <strong>mouse wheel or trackpad</strong> at any time — you are not
            locked to keyboard/timer only. Manual scroll is useful to reposition before a capture. When you press{' '}
            <kbd>S</kbd> or <kbd>N</kbd>, the next section advances from <em>where you scrolled to</em>.
          </p>

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

          <h3>Keyboard shortcuts (both scroll modes)</h3>
          <p>Click the scroll page once so it has focus, then:</p>
          <table className="ctc-docs-table">
            <thead>
              <tr><th>Key</th><th>Action</th></tr>
            </thead>
            <tbody>
              <tr><td><kbd>S</kbd> or <kbd>N</kbd></td><td>Advance to the next section. In <strong>timer mode</strong>, also restarts the countdown from zero.</td></tr>
              <tr><td><kbd>P</kbd></td><td><strong>Keyboard mode:</strong> pause / resume advance. <strong>Timer mode:</strong> pause / resume the timer.</td></tr>
              <tr><td><kbd>T</kbd></td><td>Terminate — stop session and jump back to line 1</td></tr>
              <tr><td><kbd>F</kbd></td><td>Toggle fullscreen (code only, all UI hidden)</td></tr>
            </tbody>
          </table>
          <p>
            <strong>Keyboard mode workflow:</strong> First section is already visible → capture on phone → press{' '}
            <kbd>S</kbd> or <kbd>N</kbd> on laptop → capture next section → repeat. Last chunk automatically shows
            only remaining lines (e.g. 10 lines left when step is 30).
          </p>

          <h4>Timer mode (best with Auto Re-capture)</h4>
          <p>
            Set the timer interval to match CamToCode&apos;s <em>Auto Re-capture</em> delay (e.g. both 10 seconds).
            Press <em>Start timer</em> on the laptop when you start capturing on the phone. Sections advance in sync.
            Use <kbd>S</kbd> or <kbd>N</kbd> anytime to skip ahead manually — the timer restarts from zero after each skip.
            Use <kbd>P</kbd> to pause the timer or <kbd>T</kbd> to stop and reset to the top (same as the on-screen buttons, which are hidden in fullscreen).
          </p>

          <h3>Offline use</h3>
          <p>
            Open <Link href="/scroll">/scroll</Link> once while online, then you can turn off Wi‑Fi and still open files,
            scroll, change settings, and use all keyboard shortcuts — as long as you <strong>do not refresh</strong> the tab.
            The scroll tool never calls an API. (CamToCode OCR on your phone still needs internet.)
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
