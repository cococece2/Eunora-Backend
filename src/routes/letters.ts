import { Router } from 'express'
import { z } from 'zod'
import { anon } from '../supabase.js'
import { HttpError } from '../errors.js'
import { me, requireUser } from '../middleware/auth.js'

export const lettersRouter = Router()

export const LETTER_MIN = 50
export const LETTER_MAX = 1500

export const toLetter = (r: any) => ({
  id: Number(r.id),
  sailorName: r.profiles?.sailor_name ?? 'A sailor',
  body: r.body as string,
  createdAt: r.created_at as string,
  ...(r.approved !== undefined && { approved: r.approved as boolean }),
})

/** GET /letters?limit=12 → { letters: [...] }  approved letters only, newest first */
lettersRouter.get('/', async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(12) }).parse(req.query)
  const { data, error } = await anon.from('letters')
    .select('id,body,created_at,profiles(sailor_name)')
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  res.json({ letters: (data ?? []).map(toLetter) })
})

/**
 * POST /letters (logged in)  { body } → 202 { status: 'pending' }
 * Letters wait for a person to approve them (see /admin/letters). Max 3 per day.
 */
lettersRouter.post('/', requireUser, async (req, res) => {
  const { body } = z.object({
    body: z.string().trim()
      .min(LETTER_MIN, `Letters need at least ${LETTER_MIN} characters.`)
      .max(LETTER_MAX, `Letters can be at most ${LETTER_MAX} characters.`),
  }).parse(req.body)

  const { id, db } = me(req)
  const { error } = await db.from('letters').insert({ user_id: id, body })
  if (error?.code === '42501') {
    throw new HttpError(429, 'You can seal up to 3 bottles a day. Please try again tomorrow.', 'daily_limit')
  }
  if (error) throw error
  res.status(202).json({ status: 'pending' })
})
