import { env } from './env.js'
import { createApp } from './app.js'

const server = createApp().listen(env.PORT, () => {
  console.log(`Still Sailing API listening on http://localhost:${env.PORT}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
