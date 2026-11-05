import express from 'express'
import cors from 'cors'
import { env } from './env.js'
import { errorHandler, notFound } from './errors.js'
import { authRouter } from './routes/auth.js'
import { profileRouter } from './routes/profile.js'
import { roomsRouter } from './routes/rooms.js'
import { messagesRouter } from './routes/messages.js'
import { lettersRouter } from './routes/letters.js'
import { adminRouter } from './routes/admin.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(cors({ origin: env.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'] }))
  app.use(express.json({ limit: '32kb' }))

  app.get('/health', (_req, res) => { res.json({ ok: true }) })

  app.use('/auth', authRouter)
  app.use('/me', profileRouter)
  app.use('/rooms', roomsRouter)
  app.use('/messages', messagesRouter)
  app.use('/letters', lettersRouter)
  app.use('/admin', adminRouter)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
