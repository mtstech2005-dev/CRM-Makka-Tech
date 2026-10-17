import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development','production','test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_URL: z.url(), BACKEND_URL: z.url(), DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32), TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  APP_TIMEZONE: z.string().default('Africa/Cairo')
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error('Invalid environment configuration: ' + parsed.error.issues.map(i=>i.path.join('.')).join(', '));
export const config = parsed.data;
if(config.NODE_ENV === 'production' && (!config.FRONTEND_URL.startsWith('https://') || !config.BACKEND_URL.startsWith('https://'))) throw new Error('HTTPS is required in production');
