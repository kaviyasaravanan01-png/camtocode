'use client'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let client: SupabaseClient | null = null

/** Browser client — singleton to avoid multiple GoTrueClient instances */
export function createClient() {
  if (!client) client = createSupabaseClient(supabaseUrl, supabaseAnon)
  return client
}
