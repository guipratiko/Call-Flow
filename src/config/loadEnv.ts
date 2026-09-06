import dotenv from 'dotenv';

dotenv.config();

if (!process.env.TZ?.trim()) {
  process.env.TZ = (process.env.APP_TIMEZONE || 'America/Sao_Paulo').trim();
}
