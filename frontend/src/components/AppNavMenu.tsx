'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export type NavMenuItem =
  | { type: 'link'; href: string; label: string; icon?: string }
  | { type: 'action'; label: string; icon?: string; onClick: () => void; danger?: boolean }

interface AppNavMenuProps {
  items: NavMenuItem[]
  /** Extra inline controls shown beside the hamburger (debug, settings, etc.) */
  trailing?: React.ReactNode
}

export default function AppNavMenu({ items, trailing }: AppNavMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <div ref={rootRef} className="ctc-nav-menu" style={s.wrap}>
      {trailing}
      <button
        type="button"
        className="ctc-nav-menu-btn"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Open menu"
        title="Menu"
      >
        <span className="ctc-nav-menu-icon" aria-hidden>
          <span /><span /><span />
        </span>
      </button>
      {open && (
        <div className="ctc-nav-menu-panel" role="menu">
          {items.map((item, i) =>
            item.type === 'link' ? (
              <Link
                key={item.href + item.label}
                href={item.href}
                role="menuitem"
                className="ctc-nav-menu-item"
                onClick={close}
              >
                {item.icon && <span className="ctc-nav-menu-item-icon">{item.icon}</span>}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label + i}
                type="button"
                role="menuitem"
                className={`ctc-nav-menu-item${item.danger ? ' ctc-nav-menu-item--danger' : ''}`}
                onClick={() => {
                  close()
                  item.onClick()
                }}
              >
                {item.icon && <span className="ctc-nav-menu-item-icon">{item.icon}</span>}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
}
