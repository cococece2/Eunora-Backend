import type { Request, RequestHandler } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, asUser } from '../supabase.js'
import { HttpError } from '../errors.js'

export type AuthedUser = { id: string; email?: string; token: string; db: SupabaseClient }

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser
    }
  }
}

function bearer(req: Request) {
  const h = req.headers.authorization
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined
}

/** Rejects the request with 401 unless it carries a valid Supabase access token. */
export const requireUser: RequestHandler = async (req, _res, next) => {
  const token = bearer(req)
  if (!token) throw new HttpError(401, 'Please log in first.')
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your login has expired. Please log in again.')
  req.user = { id: data.user.id, email: data.user.email, token, db: asUser(token) }
  next()
}

/** Use inside routes that ran requireUser. */
export function me(req: Request): AuthedUser {
  if (!req.user) throw new HttpError(401, 'Please log in first.')
  return req.user
}
