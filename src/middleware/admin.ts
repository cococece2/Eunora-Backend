import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { env } from '../env.js'
import { admin } from '../supabase.js'
import { HttpError } from '../errors.js'

const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Only lets the request through with the right `x-admin-key` header. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!env.ADMIN_API_KEY || !admin) {
    throw new HttpError(503, 'Admin endpoints are off. Set ADMIN_API_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.')
  }
  const key = req.header('x-admin-key')
  if (!key || !same(key, env.ADMIN_API_KEY)) throw new HttpError(403, 'Wrong admin key.')
  next()
}
