import { createServerComponentClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import HistoryPage from '@/components/HistoryPage'

export default async function History() {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  return <HistoryPage userId={user.id} />
}
