import { Router } from 'express'
import type { Session } from '@supabase/supabase-js'
import { z } from 'zod'
import { admin, freshAnon as fresh } from '../supabase.js'
import { HttpError } from '../errors.js'
import { me, requireUser } from '../middleware/auth.js'

export const authRouter = Router()

const toSession = (s: Session) => ({
  accessToken: s.access_token,
  refreshToken: s.refresh_token,
  expiresAt: s.expires_at ?? null,
  user: { id: s.user.id, email: s.user.email ?? null },
})

function friendly(message: string) {
  if (/invalid login/i.test(message)) return 'That email and password do not match.'
  if (/already registered/i.test(message)) return 'That email already has an account — try logging in.'
  if (/password/i.test(message) && /characters/i.test(message)) return 'Choose a longer password (8+ characters).'
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first — check your inbox for the link.'
  return message
}

const email = z.email('Enter a valid email address.').trim().toLowerCase()
const password = z.string().min(8, 'Choose a longer password (8+ characters).').max(72)

/** POST /auth/signup  { email, password, sailorName } → { session | null, needsConfirm } */
authRouter.post('/signup', async (req, res) => {
  const body = z.object({
    email,
    password,
    sailorName: z.string().trim().min(3, 'Sailor name needs 3+ characters.').max(20, 'Sailor name can be at most 20 characters.'),
  }).parse(req.body)

  const { data, error } = await fresh().auth.signUp({
    email: body.email,
    password: body.password,
    options: { data: { sailor_name: body.sailorName } },
  })
  if (error) throw new HttpError(error.status ?? 400, friendly(error.message))
  // If "Confirm email" is on in Supabase, there is no session until they click the email link.
  res.status(201).json({ session: data.session ? toSession(data.session) : null, needsConfirm: !data.session })
})

/** POST /auth/login  { email, password } → { session } */
authRouter.post('/login', async (req, res) => {
  const body = z.object({ email, password: z.string().min(1, 'Enter your password.') }).parse(req.body)
  const { data, error } = await fresh().auth.signInWithPassword(body)
  if (error || !data.session) throw new HttpError(401, friendly(error?.message ?? 'Could not log in.'))
  res.json({ session: toSession(data.session) })
})

/** POST /auth/refresh  { refreshToken } → { session }  (call this shortly before expiresAt) */
authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body)
  const { data, error } = await fresh().auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session) throw new HttpError(401, 'Your login has expired. Please log in again.')
  res.json({ session: toSession(data.session) })
})

/** POST /auth/logout  (logged in) → 204. Ends the session on Supabase too when the service key is set. */
authRouter.post('/logout', requireUser, async (req, res) => {
  if (admin) await admin.auth.admin.signOut(me(req).token)
  res.status(204).end()
})
