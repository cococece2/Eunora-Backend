import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../errors.js'
import { me, requireUser } from '../middleware/auth.js'

export const messagesRouter = Router()

/**
 * POST /messages/:messageId/report (logged in) → 204
 * Once 3 different sailors report a message, the database hides it automatically.
 */
messagesRouter.post('/:messageId/report', requireUser, async (req, res) => {
  const messageId = z.coerce.number().int().positive().parse(req.params.messageId)
  const { id, db } = me(req)
  const { error } = await db.from('reports').insert({ message_id: messageId, reporter_id: id })
  if (error?.code === '23503') throw new HttpError(404, 'That message does not exist.')
  if (error && error.code !== '23505') throw error // 23505 = already reported by you
  res.status(204).end()
})
