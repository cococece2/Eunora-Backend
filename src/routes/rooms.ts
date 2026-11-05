import { Router } from 'express'
import { z } from 'zod'
import { anon } from '../supabase.js'
import { HttpError } from '../errors.js'
import { me, requireUser } from '../middleware/auth.js'
import { minGap } from '../middleware/rateLimit.js'
import { MSG_COLS, subscribe, toMessage } from '../messages.js'

export const roomsRouter = Router()

const roomId = z.string().min(1).max(64)

async function assertRoomExists(id: string) {
  const { data, error } = await anon.from('rooms').select('id').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'That crew does not exist.')
}

/** GET /rooms → { rooms: [{ id, name, description, emoji, members }] } */
roomsRouter.get('/', async (_req, res) => {
  const { data, error } = await anon.from('rooms')
    .select('id,name,description,emoji,room_members(count)')
    .order('sort_order')
  if (error) throw error
  res.json({
    rooms: (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      emoji: r.emoji,
      members: r.room_members?.[0]?.count ?? 0,
    })),
  })
})

/** PUT /rooms/:roomId/membership (logged in) → 204. Joins the crew; joining twice is fine. */
roomsRouter.put('/:roomId/membership', requireUser, async (req, res) => {
  const room = roomId.parse(req.params.roomId)
  await assertRoomExists(room)
  const { id, db } = me(req)
  const { error } = await db.from('room_members').insert({ room_id: room, user_id: id })
  if (error && error.code !== '23505') throw error // 23505 = already a member
  res.status(204).end()
})

/** DELETE /rooms/:roomId/membership (logged in) → 204. Leaves the crew. */
roomsRouter.delete('/:roomId/membership', requireUser, async (req, res) => {
  const room = roomId.parse(req.params.roomId)
  const { id, db } = me(req)
  const { error } = await db.from('room_members').delete().eq('room_id', room).eq('user_id', id)
  if (error) throw error
  res.status(204).end()
})

/**
 * GET /rooms/:roomId/messages?limit=100&before=<messageId>
 * → { messages: [...] }  oldest first. Pass `before` with the oldest id you have to load earlier ones.
 */
roomsRouter.get('/:roomId/messages', async (req, res) => {
  const room = roomId.parse(req.params.roomId)
  const q = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    before: z.coerce.number().int().positive().optional(),
  }).parse(req.query)

  let query = anon.from('messages').select(MSG_COLS).eq('room_id', room)
    .order('created_at', { ascending: false }).limit(q.limit)
  if (q.before) query = query.lt('id', q.before)
  const { data, error } = await query
  if (error) throw error
  res.json({ messages: (data ?? []).reverse().map(toMessage) })
})

/** POST /rooms/:roomId/messages (logged in, must have joined)  { body } → { message } */
roomsRouter.post(
  '/:roomId/messages',
  requireUser,
  minGap(2000, req => req.user!.id, 'Easy there, sailor. Wait a moment between messages.'),
  async (req, res) => {
    const room = roomId.parse(req.params.roomId)
    const { body } = z.object({
      body: z.string().trim().min(1, 'Write something first.').max(280, 'Messages can be at most 280 characters.'),
    }).parse(req.body)

    const { id, db } = me(req)
    const { data, error } = await db.from('messages').insert({ room_id: room, user_id: id, body }).select(MSG_COLS).single()
    if (error?.code === '42501') throw new HttpError(403, 'Join this crew before posting.', 'not_member')
    if (error?.code === '23503') throw new HttpError(404, 'That crew does not exist.')
    if (error) throw error
    res.status(201).json({ message: toMessage(data) })
  },
)

/**
 * GET /rooms/:roomId/stream → Server-Sent Events. Each new message arrives as:
 *   event: message
 *   data: { ...message }
 * In the browser: new EventSource(`${API}/rooms/daily/stream`).addEventListener('message', ...)
 */
roomsRouter.get('/:roomId/stream', async (req, res) => {
  const room = roomId.parse(req.params.roomId)
  await assertRoomExists(room)

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  res.write('retry: 3000\n\n')

  const unsubscribe = subscribe(room, m => res.write(`event: message\nid: ${m.id}\ndata: ${JSON.stringify(m)}\n\n`))
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})
