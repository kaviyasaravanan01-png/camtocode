import type { NavMenuItem } from '@/components/AppNavMenu'

export function loggedInNavItems(signOut: () => void): NavMenuItem[] {
  return [
    { type: 'link', href: '/history', label: 'History', icon: '📁' },
    { type: 'link', href: '/account', label: 'Account', icon: '👤' },
    { type: 'link', href: '/scroll', label: 'Scroll Automation', icon: '📜' },
    { type: 'link', href: '/docs', label: 'Docs', icon: '📖' },
    { type: 'action', label: 'Sign Out', icon: '🚪', onClick: signOut, danger: true },
  ]
}

export function guestNavItems(): NavMenuItem[] {
  return [
    { type: 'link', href: '/scroll', label: 'Scroll Automation', icon: '📜' },
    { type: 'link', href: '/docs', label: 'Docs', icon: '📖' },
    { type: 'link', href: '/login', label: 'Sign In', icon: '🔑' },
  ]
}
