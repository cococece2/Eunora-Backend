import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../errors.js'
import { me, requireUser } from '../middleware/auth.js'

export const profileRouter = Router()
profileRouter.use(requireUser)

const COLS = 'id,sailor_name,total_xp,completed_quests,quests_day,created_at'

const toProfile = (r: any) => ({
  id: r.id as string,
  sailorName: r.sailor_name as string,
  totalXp: r.total_xp as number,              // lifetime XP: only ever goes up
  completedQuests: r.completed_quests as string[], // quests ticked off on questsDay
  questsDay: r.quests_day as string | null,   // the (local) date those quests belong to, e.g. "2026-11-04"
  createdAt: r.created_at as string,
})

/** GET /me → the logged-in sailor's profile */
profileRouter.get('/', async (req, res) => {
  const { id, db } = me(req)
  const { data, error } = await db.from('profiles').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'No profile found for this account.')
  res.json({ profile: toProfile(data) })
})

/** PUT /me/progress  { totalXp, completedQuests, questsDay } → { profile } */
profileRouter.put('/progress', async (req, res) => {
  const body = z.object({
    totalXp: z.number().int().min(0),
    completedQuests: z.array(z.string().min(1).max(64)).max(50),
    questsDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'questsDay must look like 2026-11-04.'),
  }).parse(req.body)

  const { id, db } = me(req)
  const { data: current, error: readError } = await db.from('profiles').select('total_xp').eq('id', id).single()
  if (readError) throw readError

  const { data, error } = await db.from('profiles')
    .update({
      total_xp: Math.max(current.total_xp, body.totalXp), // lifetime XP never goes down
      completed_quests: [...new Set(body.completedQuests)],
      quests_day: body.questsDay,
    })
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) throw error
  res.json({ profile: toProfile(data) })
})

/** GET /me/rooms → { roomIds: [...] }  the crews this sailor has joined */
profileRouter.get('/rooms', async (req, res) => {
  const { id, db } = me(req)
  const { data, error } = await db.from('room_members').select('room_id').eq('user_id', id)
  if (error) throw error
  res.json({ roomIds: (data ?? []).map(r => r.room_id as string) })
})
