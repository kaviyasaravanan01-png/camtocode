import { createServerComponentClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'

const ADMIN_EMAILS = [
  'anandanathurelangovan94@gmail.com',
  'kaviyasaravanan01@gmail.com',
]

export default async function AdminPage() {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    redirect('/')
  }

  return <AdminDashboard userEmail={user.email!} />
}
