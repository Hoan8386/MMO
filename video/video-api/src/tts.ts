import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import { VideoPlan } from './schemas/video-plan.schema';

export async function synthesizeScenes(plan: VideoPlan, newsId: number) {
  const audioDir = path.join(config.projectDir, 'data', 'audio', String(newsId));
  await fs.mkdir(audioDir, { recursive: true });
  const paths: string[] = [];
  for (const scene of plan.scenes) {
    if (!scene.voice) continue;
    const outputPath = path.join(audioDir, `scene-${String(scene.scene).padStart(3, '0')}.mp3`);
    const response = await fetch(config.edgeTtsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.edgeTtsApiKey ? { Authorization: `Bearer ${config.edgeTtsApiKey}` } : {}) },
      body: JSON.stringify({ model: 'tts-1', input: scene.voice, voice: process.env.EDGE_TTS_VOICE || 'vi-VN-HoaiMyNeural', response_format: 'mp3' }),
    });
    if (!response.ok) throw new Error(`Edge TTS request failed: ${response.status} ${await response.text()}`);
    await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    paths.push(outputPath);
  }
  for (const audioPath of paths) await fs.access(audioPath);
  return paths;
}