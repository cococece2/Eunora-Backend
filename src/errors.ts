import type { ErrorRequestHandler, RequestHandler } from 'express'
import { z } from 'zod'

/** Throw this from a route to send a specific status and message to the client. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No endpoint at ${req.method} ${req.path}` })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.code && { code: err.code }) })
    return
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request.', issues: err.issues })
    return
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body is not valid JSON.' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' })
}
