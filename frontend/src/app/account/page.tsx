import { createServerComponentClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AccountPage from '@/components/AccountPage'

export default async function Account() {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <AccountPage userEmail={user.email!} />
}
