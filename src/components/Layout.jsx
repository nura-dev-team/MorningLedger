import { Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import BottomNav from './BottomNav'

const Layout = () => {
  const { profile } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!profile?.property_id) return

    const fetchPending = async () => {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('property_id', profile.property_id)
        .eq('status', 'pending')

      setPendingCount(count || 0)
    }

    fetchPending()

    // Subscribe to real-time invoice changes to keep badge accurate
    const channel = supabase
      .channel('pending-invoices')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `property_id=eq.${profile.property_id}` },
        fetchPending
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile?.property_id])

  return (
    <div style={{ background: 'var(--nbg)', minHeight: '100dvh' }}>
      <Outlet context={{ pendingCount }} />
      <BottomNav pendingCount={pendingCount} />
    </div>
  )
}

export default Layout
