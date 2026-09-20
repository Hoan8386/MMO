import { config } from './config';
import { VideoPlan, videoPlanSchema, validAnimationIds, validTemplateIds, validThemeIds } from './schemas/video-plan.schema';

const systemPrompt = `You are a Vietnamese AI technology video planner. Return only valid JSON matching this shape: {title, summary, duration, theme, scenes:[{scene,duration,template,animation,voice,visual,data,image_prompt}]}. Use only these IDs. Themes: ${validThemeIds.join(', ')}. Templates: ${validTemplateIds.join(', ')}. Animations: ${validAnimationIds.join(', ')}. Make scene data suitable for the selected template and write voiceover in Vietnamese.`;

function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : content);
}

export async function planVideo(news: { title: string; summary: string; scenes: unknown }): Promise<VideoPlan> {
  if (!config.openRouterApiKey) throw new Error('OPENROUTER_API_KEY is not configured');
  const userPrompt = JSON.stringify({ title: news.title, summary: news.summary, sourceScenes: news.scenes });
  let lastError: unknown;
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.openRouterApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.openRouterModel, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
      });
      if (response.status === 429 && attempt < 3) { await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt)); continue; }
      if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenRouter returned no plan content');
      return videoPlanSchema.parse(extractJson(content));
    } catch (error) { lastError = error; if (attempt === 3) break; }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to create video plan');
}