import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [session, setSession]   = useState(undefined) // undefined = loading
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)

  // ── Active property switching ──────────────────────────────────────────────
  const [activePropertyId, setActivePropertyId] = useState(null)
  const [activeProperty, setActivePropertyState] = useState(null)

  // ── Multi-property lists ───────────────────────────────────────────────────
  const [ownedProperties, setOwnedProperties]       = useState([])
  const [assignedProperties, setAssignedProperties] = useState([])

  // ── Set active property (call with full property object) ───────────────────
  const setActiveProperty = (property) => {
    if (!property) return
    setActivePropertyId(property.id)
    setActivePropertyState(property)
  }

  // ── Fetch owned properties for owners ──────────────────────────────────────
  const fetchOwnedProperties = async (userId) => {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setOwnedProperties(data)
      return data
    }
    return []
  }

  // ── Fetch assigned properties for controllers (via accepted invites) ───────
  const fetchAssignedProperties = async (email) => {
    // Get all property_ids from accepted controller invites
    const { data: invites, error: invErr } = await supabase
      .from('invites')
      .select('property_id')
      .eq('email', email.toLowerCase().trim())
      .eq('role', 'controller')
      .eq('status', 'accepted')

    if (invErr || !invites || invites.length === 0) {
      setAssignedProperties([])
      return []
    }

    const propertyIds = [...new Set(invites.map((i) => i.property_id))]

    const { data: props, error: propErr } = await supabase
      .from('properties')
      .select('*')
      .in('id', propertyIds)
      .order('created_at', { ascending: true })

    if (!propErr && props) {
      setAssignedProperties(props)
      return props
    }
    return []
  }

  // ── Fetch profile + initialize active property ─────────────────────────────
  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, properties(*)')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data) {
      setProfile(data)

      // Set default active property from profile.property_id
      if (data.properties) {
        setActivePropertyId(data.property_id)
        setActivePropertyState(data.properties)
      }

      // Fetch multi-property lists based on role
      if (data.role === 'owner') {
        const owned = await fetchOwnedProperties(data.id)
        // If profile.property_id isn't set but they own properties, default to first
        if (!data.property_id && owned.length > 0) {
          setActivePropertyId(owned[0].id)
          setActivePropertyState(owned[0])
        }
      } else if (data.role === 'controller' && data.email) {
        const assigned = await fetchAssignedProperties(data.email)
        // If profile.property_id isn't set but they have assignments, default to first
        if (!data.property_id && assigned.length > 0) {
          setActivePropertyId(assigned[0].id)
          setActivePropertyState(assigned[0])
        }
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth state changes (magic link click, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setActivePropertyId(null)
        setActivePropertyState(null)
        setOwnedProperties([])
        setAssignedProperties([])
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setActivePropertyId(null)
    setActivePropertyState(null)
    setOwnedProperties([])
    setAssignedProperties([])
  }

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id)
  }

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      loading,
      signOut,
      refreshProfile,
      activePropertyId,
      activeProperty,
      setActiveProperty,
      ownedProperties,
      assignedProperties,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
