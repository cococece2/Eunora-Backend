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

const LETTER_COLS = 'id,body,status,approved,review_note,reviewed_at,created_at,profiles(sailor_name)'

/** GET /admin/letters?status=pending|approved|rejected|all → { letters } */
adminRouter.get('/letters', async (req, res) => {
  const { status } = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') }).parse(req.query)
  let query = db().from('letters').select(LETTER_COLS).order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  res.json({ letters: (data ?? []).map(toLetter) })
})

/** Sets a letter's review decision and flags it so the writer sees a notice next time they log in. */
async function review(id: number, status: 'approved' | 'rejected', note?: string) {
  const { data, error } = await db().from('letters')
    .update({ status, review_note: note?.trim() || null, reviewed_at: new Date().toISOString(), author_seen: false })
    .eq('id', id).select(LETTER_COLS).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'No letter with that id.')
  return toLetter(data)
}
const noteBody = z.object({ note: z.string().max(500).optional() }).default({})

/** POST /admin/letters/:id/approve  { note? } → { letter }  publishes it */
adminRouter.post('/letters/:id/approve', async (req, res) => {
  const { note } = noteBody.parse(req.body ?? {})
  res.json({ letter: await review(numericId.parse(req.params.id), 'approved', note) })
})

/** POST /admin/letters/:id/reject  { note? } → { letter }  keeps it private; the writer is told */
adminRouter.post('/letters/:id/reject', async (req, res) => {
  const { note } = noteBody.parse(req.body ?? {})
  res.json({ letter: await review(numericId.parse(req.params.id), 'rejected', note) })
})

/** DELETE /admin/letters/:id → 204  deletes it for good (the writer is NOT told; prefer /reject) */
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
