'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function AuthCallback() {
  useEffect(() => {
    const supabase = createClient()
    // createBrowserClient auto-exchanges the PKCE code from URL params
    supabase.auth.getSession().then(({ data: { session } }) => {
      window.location.href = session ? '/app' : '/'
    })
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '1rem',
    }}>
      Signing you in...
    </div>
  )
}
