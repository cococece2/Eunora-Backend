import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { env } from './env.js'

function client(key: string, accessToken?: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Node 20 has no built-in WebSocket, which Supabase Realtime needs. `ws` fills the gap.
    realtime: { transport: WebSocket as any },
    ...(accessToken && { global: { headers: { Authorization: `Bearer ${accessToken}` } } }),
  })
}

/** Anonymous client: used for public reads and live updates. Row Level Security applies. */
export const anon = client(env.SUPABASE_ANON_KEY)

/** A brand-new anonymous client, for sign-in/sign-up, so one person's session never leaks into a shared client. */
export const freshAnon = () => client(env.SUPABASE_ANON_KEY)

/**
 * A client that acts as the signed-in person. Every query runs with their token,
 * so the Row Level Security rules in db/*.sql still decide what they can do.
 */
export const asUser = (accessToken: string) => client(env.SUPABASE_ANON_KEY, accessToken)

/** Service-role client: bypasses Row Level Security. Only used by /admin routes and logout. */
export const admin = env.SUPABASE_SERVICE_ROLE_KEY ? client(env.SUPABASE_SERVICE_ROLE_KEY) : null
