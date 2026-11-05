import { Router } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { admin } from '../supabase.js'
import { HttpError } from '../errors.js'
import { requireAdmin } from '../middleware/admin.js'
import { MSG_COLS, toMessage } from '../messages.js'
import { toLetter } from './letters.js'

// Everything here needs the header `x-admin-key: <ADMIN_API_KEY>`.
export const adminRouter = Router()
adminRouter.use(requireAdmin)

const db = () => admin as SupabaseClient // requireAdmin guarantees it is set
const numericId = z.coerce.number().int().positive()

// ── Letters ──────────────────────────────────────────────────────────────────

/** GET /admin/letters?status=pending|approved|all → { letters } */
adminRouter.get('/letters', async (req, res) => {
  const { status } = z.object({ status: z.enum(['pending', 'approved', 'all']).default('pending') }).parse(req.query)
  let query = db().from('letters').select('id,body,approved,created_at,profiles(sailor_name)').order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('approved', status === 'approved')
  const { data, error } = await query
  if (error) throw error
  res.json({ letters: (data ?? []).map(toLetter) })
})

/** POST /admin/letters/:id/approve → { letter }  publishes it */
adminRouter.post('/letters/:id/approve', async (req, res) => {
  const id = numericId.parse(req.params.id)
  const { data, error } = await db().from('letters').update({ approved: true }).eq('id', id)
    .select('id,body,approved,created_at,profiles(sailor_name)').maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'No letter with that id.')
  res.json({ letter: toLetter(data) })
})

/** DELETE /admin/letters/:id → 204  rejects (deletes) it */
adminRouter.delete('/letters/:id', async (req, res) => {
  const id = numericId.parse(req.params.id)
  const { error } = await db().from('letters').delete().eq('id', id)
  if (error) throw error
  res.status(204).end()
})

// ── Messages (moderation) ────────────────────────────────────────────────────

/** GET /admin/messages/hidden → { messages }  hidden messages with their report counts */
adminRouter.get('/messages/hidden', async (_req, res) => {
  const { data, error } = await db().from('messages').select(`${MSG_COLS},reports(count)`)
    .eq('hidden', true).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  res.json({ messages: (data ?? []).map((r: any) => ({ ...toMessage(r), reports: r.reports?.[0]?.count ?? 0 })) })
})

/** POST /admin/messages/:id/hide → 204 */
adminRouter.post('/messages/:id/hide', async (req, res) => {
  const id = numericId.parse(req.params.id)
  const { error } = await db().from('messages').update({ hidden: true }).eq('id', id)
  if (error) throw error
  res.status(204).end()
})

/** POST /admin/messages/:id/unhide → 204  also clears its reports so it starts fresh */
adminRouter.post('/messages/:id/unhide', async (req, res) => {
  const id = numericId.parse(req.params.id)
  const { error: reportsError } = await db().from('reports').delete().eq('message_id', id)
  if (reportsError) throw reportsError
  const { error } = await db().from('messages').update({ hidden: false }).eq('id', id)
  if (error) throw error
  res.status(204).end()
})

/** DELETE /admin/messages/:id → 204 */
adminRouter.delete('/messages/:id', async (req, res) => {
  const id = numericId.parse(req.params.id)
  const { error } = await db().from('messages').delete().eq('id', id)
  if (error) throw error
  res.status(204).end()
})

// ── Rooms ────────────────────────────────────────────────────────────────────

const roomBody = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
  emoji: z.string().trim().min(1).max(16).default('⚓'),
  sortOrder: z.number().int().default(0),
})

/** PUT /admin/rooms/:id  { name, description, emoji?, sortOrder? } → { room }  creates or updates */
adminRouter.put('/rooms/:id', async (req, res) => {
  const id = z.string().regex(/^[a-z0-9-]{1,64}$/, 'Room id must be lowercase letters, numbers or dashes.').parse(req.params.id)
  const b = roomBody.parse(req.body)
  const { data, error } = await db().from('rooms')
    .upsert({ id, name: b.name, description: b.description, emoji: b.emoji, sort_order: b.sortOrder })
    .select('id,name,description,emoji,sort_order').single()
  if (error) throw error
  res.json({ room: data })
})

/** DELETE /admin/rooms/:id → 204  (also deletes its messages and members) */
adminRouter.delete('/rooms/:id', async (req, res) => {
  const { error } = await db().from('rooms').delete().eq('id', req.params.id)
  if (error) throw error
  res.status(204).end()
})
