import 'dotenv/config';
if(process.env.NODE_ENV==='production'||!process.env.DATABASE_URL||!['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Tests require a local non-production PostgreSQL database');
