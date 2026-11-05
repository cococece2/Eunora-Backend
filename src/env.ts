import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:8443,http://localhost:5173'),
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().transform(v => v || undefined),
  ADMIN_API_KEY: z.string().optional().transform(v => v || undefined),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Missing or invalid settings in .env (see .env.example):')
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean),
}
