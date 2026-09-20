import path from 'node:path';
import { z } from 'zod';
import { config as appConfig } from '../config';

const config = require(path.join(appConfig.projectDir, 'config/templates.json')) as {
  templates: Array<{ id: string }>;
};
const animations = require(path.join(appConfig.projectDir, 'config/animations.json')) as {
  animations: Record<string, unknown>;
};
const themes = require(path.join(appConfig.projectDir, 'config/themes.json')) as {
  themes: Record<string, unknown>;
};

const validTemplateIds = config.templates.map((template) => template.id);
const validAnimationIds = Object.keys(animations.animations);
const validThemeIds = Object.keys(themes.themes);

const optionalJsonValue = z.unknown().optional();

export const videoPlanSchema = z.object({
  title: z.string().min(1),
  summary: z.string().default(''),
  duration: z.number().positive().optional(),
  theme: z.enum(validThemeIds as [string, ...string[]]).default('dark-tech'),
  scenes: z.array(z.object({
    scene: z.number().int().positive(),
    duration: z.number().positive().optional(),
    template: z.enum(validTemplateIds as [string, ...string[]]),
    animation: z.enum(validAnimationIds as [string, ...string[]]).optional(),
    theme: z.enum(validThemeIds as [string, ...string[]]).optional(),
    voice: z.string().optional(),
    visual: z.string().optional(),
    data: z.record(z.string(), z.unknown()).default({}),
    image_prompt: z.string().optional(),
    audio_path: z.string().optional(),
  }).passthrough()).min(1),
}).passthrough();

export type VideoPlan = z.infer<typeof videoPlanSchema>;
export { validAnimationIds, validTemplateIds, validThemeIds, optionalJsonValue };