import path from 'node:path';
import { config } from './config';
import { VideoPlan } from './schemas/video-plan.schema';

const VideoCompiler = require(path.join(config.projectDir, 'compiler/compiler.js')) as new (projectDir: string) => { compile(plan: VideoPlan, outputDir: string): Promise<unknown> };
const { validateVideoPlan } = require(path.join(config.projectDir, 'compiler/validator.js')) as { validateVideoPlan(plan: VideoPlan, projectDir: string): { valid: boolean; errors: string[]; warnings: string[] } };

export async function compileVideo(plan: VideoPlan, newsId: number) {
  const validation = validateVideoPlan(plan, config.projectDir);
  if (!validation.valid) throw new Error(`Video plan rejected: ${validation.errors.join('; ')}`);
  const outputDir = path.join(config.projectDir, 'generated', String(newsId));
  return new VideoCompiler(config.projectDir).compile(plan, outputDir);
}