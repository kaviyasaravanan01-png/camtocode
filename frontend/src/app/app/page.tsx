import { createServerComponentClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import CameraApp from '@/components/CameraApp'

export default async function AppPage() {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  return <CameraApp userId={user.id} userEmail={user.email ?? ''} />
}
