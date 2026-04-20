'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

declare global {
  interface Window {
    Razorpay: any
  }
}

interface Props {
  plan: 'starter' | 'pro'
  label?: string
  style?: React.CSSProperties
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload  = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter — ₹599/month',
  pro:     'Pro — ₹1,499/month',
}

export default function PayButton({ plan, label, style }: Props) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState('')

  const handleClick = async () => {
    setLoading(true)
    setMsg('')

    // 1. Get auth token
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      // Not logged in — redirect to login then back to pricing
      window.location.href = `/login?redirect=pricing`
      return
    }
    const token = session.access_token

    // 2. Load Razorpay SDK
    const loaded = await loadRazorpayScript()
    if (!loaded) {
      setMsg('Failed to load payment SDK. Please refresh and try again.')
      setLoading(false)
      return
    }

    // 3. Create order on backend
    let order: any
    try {
      const res = await fetch(`${BACKEND_URL}/api/create_order`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      order = await res.json()
    } catch (e: any) {
      setMsg(`Order creation failed: ${e.message}`)
      setLoading(false)
      return
    }

    // 4. Open Razorpay checkout
    const options = {
      key:         order.key_id,
      amount:      order.amount,
      currency:    order.currency,
      name:        'CamToCode',
      description: PLAN_LABELS[plan] || plan,
      order_id:    order.order_id,
      prefill: {
        email: session.user?.email || '',
      },
      theme: { color: plan === 'pro' ? '#8b5cf6' : '#0ea5e9' },
      handler: async (response: any) => {
        // 5. Verify payment on backend
        try {
          const res = await fetch(`${BACKEND_URL}/api/verify_payment`, {
            method:  'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ ...response, plan }),
          })
          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || `HTTP ${res.status}`)
          }
          // 6. Success — reload to refresh plan
          setMsg('Payment successful! Upgrading your plan…')
          setTimeout(() => { window.location.href = '/app' }, 1500)
        } catch (e: any) {
          setMsg(`Payment verification failed: ${e.message}`)
        }
        setLoading(false)
      },
      modal: {
        ondismiss: () => {
          setLoading(false)
          // For async payments (UPI), the modal closes before handler fires.
          // Redirect to /account so the user sees their plan once the
          // webhook upgrades it (usually within a few seconds).
          window.location.href = '/account'
        },
      },
    }

    const rzp = new window.Razorpay(options)
    rzp.on('payment.failed', (resp: any) => {
      setMsg(`Payment failed: ${resp.error?.description || 'Unknown error'}`)
      setLoading(false)
    })
    rzp.open()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          display:    'block',
          width:      '100%',
          textAlign:  'center',
          color:      '#fff',
          fontWeight: 700,
          fontSize:   '0.9rem',
          borderRadius: 10,
          padding:    '0.65rem',
          border:     'none',
          cursor:     loading ? 'not-allowed' : 'pointer',
          opacity:    loading ? 0.7 : 1,
          background: plan === 'pro'
            ? 'linear-gradient(135deg,#7c3aed,#6d28d9)'
            : 'linear-gradient(135deg,#0ea5e9,#0284c7)',
          ...style,
        }}
      >
        {loading ? 'Processing…' : (label || `Upgrade to ${plan.charAt(0).toUpperCase() + plan.slice(1)}`)}
      </button>
      {msg && (
        <p style={{
          fontSize: '0.78rem',
          color: msg.startsWith('Payment successful') ? '#22c55e' : '#f87171',
          textAlign: 'center',
          margin: 0,
        }}>
          {msg}
        </p>
      )}
    </div>
  )
}
