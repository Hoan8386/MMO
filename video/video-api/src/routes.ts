import { Router, Request, Response } from 'express';
import { query } from './db';
import { compileVideo } from './compiler';
import { createJob, getJob, listJobs, updateJobStatus, JobStatus } from './jobs';
import { planVideo } from './openrouter';
import { synthesizeScenes } from './tts';
import { videoPlanSchema } from './schemas/video-plan.schema';

const router = Router();

function idParam(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid numeric id');
  return id;
}

async function runPipeline(jobId: number, newsId: number) {
  try {
    const newsResult = await query<{ id: number; title: string; summary: string; scenes: unknown }>('SELECT id, title, summary, scenes FROM video_news WHERE id = $1', [newsId]);
    const news = newsResult.rows[0];
    if (!news) throw new Error(`News article ${newsId} not found`);

    await updateJobStatus(jobId, 'planning', { input_json: news });
    const plan = await planVideo(news);
    await updateJobStatus(jobId, 'planned', { output_json: plan, model: process.env.OPENROUTER_MODEL, prompt_version: 'v1' });
    await updateJobStatus(jobId, 'compiling');
    await compileVideo(plan, newsId);
    await updateJobStatus(jobId, 'tts');
    await synthesizeScenes(plan, newsId);
    await updateJobStatus(jobId, 'ready_to_render', { output_json: plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const current = await getJob(jobId);
    if (current && current.status !== 'completed' && current.status !== 'failed') {
      await updateJobStatus(jobId, 'failed', { error_message: message });
    }
  }
}

router.get('/news', async (_req, res, next) => {
  try { res.json((await query('SELECT * FROM video_news ORDER BY created_at DESC')) .rows); } catch (error) { next(error); }
});

router.get('/news/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM video_news WHERE id = $1', [idParam(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ error: 'News article not found' });
    return res.json(result.rows[0]);
  } catch (error) { return next(error); }
});

router.post('/news/:id/generate', async (req, res, next) => {
  try {
    const newsId = idParam(req.params.id);
    const exists = await query('SELECT id FROM video_news WHERE id = $1', [newsId]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'News article not found' });
    const job = await createJob(newsId);
    void runPipeline(job.id, newsId);
    return res.status(202).json({ jobId: job.id, status: job.status });
  } catch (error) { return next(error); }
});

router.get('/jobs', async (req, res, next) => {
  try { res.json(await listJobs({ status: typeof req.query.status === 'string' ? req.query.status : undefined })); } catch (error) { next(error); }
});

router.get('/jobs/:jobId/status', async (req, res, next) => {
  try {
    const job = await getJob(idParam(req.params.jobId));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json(job);
  } catch (error) { return next(error); }
});

router.patch('/jobs/:jobId/status', async (req, res, next) => {
  try {
    const status = req.body?.status as JobStatus;
    const job = await updateJobStatus(idParam(req.params.jobId), status, req.body || {});
    return res.json(job);
  } catch (error) { return next(error); }
});

router.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  res.status(message.startsWith('Invalid') ? 400 : 500).json({ error: message });
});

export default router;