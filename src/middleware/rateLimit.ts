import type { RequestHandler } from 'express'
import { HttpError } from '../errors.js'

/**
 * Tiny in-memory limiter: each key may do one request every `gapMs`.
 * Fine for a single server. If you run several copies of the API, swap this for a shared store.
 */
export function minGap(gapMs: number, keyOf: (req: Parameters<RequestHandler>[0]) => string, message: string): RequestHandler {
  const last = new Map<string, number>()
  setInterval(() => {
    const cutoff = Date.now() - gapMs
    for (const [k, t] of last) if (t < cutoff) last.delete(k)
  }, 60_000).unref()

  return (req, _res, next) => {
    const key = keyOf(req)
    const now = Date.now()
    if (now - (last.get(key) ?? 0) < gapMs) throw new HttpError(429, message)
    last.set(key, now)
    next()
  }
}
