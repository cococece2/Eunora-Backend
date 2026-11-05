import type { RealtimeChannel } from '@supabase/supabase-js'
import { anon } from './supabase.js'

export const MSG_COLS = 'id,room_id,user_id,body,created_at,profiles(sailor_name)'

export type Message = { id: number; roomId: string; userId: string; sailorName: string; body: string; createdAt: string }

export const toMessage = (r: any): Message => ({
  id: Number(r.id),
  roomId: r.room_id,
  userId: r.user_id,
  sailorName: r.profiles?.sailor_name ?? 'Sailor',
  body: r.body,
  createdAt: r.created_at,
})

// ── Live updates ────────────────────────────────────────────────────────────
// One Supabase Realtime channel per room, shared by everyone streaming that room.

type Listener = (m: Message) => void
const rooms = new Map<string, { channel: RealtimeChannel; listeners: Set<Listener> }>()

export function subscribe(roomId: string, listener: Listener): () => void {
  let room = rooms.get(roomId)
  if (!room) {
    const listeners = new Set<Listener>()
    const channel = anon.channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, async payload => {
        // Re-read the row so we get the sailor name and respect the "hidden" rule.
        const { data } = await anon.from('messages').select(MSG_COLS).eq('id', (payload.new as any).id).maybeSingle()
        if (!data) return
        const msg = toMessage(data)
        for (const l of listeners) l(msg)
      })
      .subscribe()
    room = { channel, listeners }
    rooms.set(roomId, room)
  }
  room.listeners.add(listener)

  return () => {
    const r = rooms.get(roomId)
    if (!r) return
    r.listeners.delete(listener)
    if (r.listeners.size === 0) {
      rooms.delete(roomId)
      anon.removeChannel(r.channel)
    }
  }
}
