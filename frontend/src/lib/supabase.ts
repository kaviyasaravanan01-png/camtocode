'use client'
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let client: ReturnType<typeof createBrowserClient> | null = null

/** Browser client — stores session in cookies so server can read it */
export function createClient() {
  if (!client) client = createBrowserClient(supabaseUrl, supabaseAnon)
  return client
}
