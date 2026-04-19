'use client'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Browser client — use in Client Components only */
export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnon)
}
