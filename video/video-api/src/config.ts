import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), 'video-api/.env') });
dotenv.config();

export const config = {
  port: Number(process.env.VIDEO_API_PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://n8n:n8n_password@localhost:5432/n8n',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
  edgeTtsUrl: process.env.EDGE_TTS_URL || 'http://localhost:5051/v1/audio/speech',
  edgeTtsApiKey: process.env.EDGE_TTS_API_KEY || '',
  projectDir: path.resolve(process.cwd(), process.env.HYPERFRAMES_PROJECT_DIR || 'my-video'),
  apiBaseUrl: process.env.VIDEO_API_BASE_URL || `http://localhost:${process.env.VIDEO_API_PORT || 3000}`,
};