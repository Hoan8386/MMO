import { query } from './db';

export const JOB_STATUSES = ['queued', 'planning', 'planned', 'compiling', 'tts', 'ready_to_render', 'rendering', 'completed', 'failed'] as const;
export type JobStatus = typeof JOB_STATUSES[number];

const transitions: Record<JobStatus, JobStatus[]> = {
  queued: ['planning', 'failed'],
  planning: ['planned', 'failed'],
  planned: ['compiling', 'failed'],
  compiling: ['tts', 'failed'],
  tts: ['ready_to_render', 'failed'],
  ready_to_render: ['rendering', 'failed'],
  rendering: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export async function createJob(newsId: number) {
  const result = await query('INSERT INTO video_jobs (news_id, status) VALUES ($1, $2) RETURNING *', [newsId, 'queued']);
  return result.rows[0];
}

export async function getJob(jobId: number) {
  const result = await query('SELECT * FROM video_jobs WHERE id = $1', [jobId]);
  return result.rows[0] || null;
}

export async function listJobs(filters: { status?: string; newsId?: number } = {}) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (filters.status) { values.push(filters.status); clauses.push(`status = $${values.length}`); }
  if (filters.newsId) { values.push(filters.newsId); clauses.push(`news_id = $${values.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(`SELECT * FROM video_jobs ${where} ORDER BY created_at DESC`, values);
  return result.rows;
}

export async function updateJobStatus(jobId: number, status: JobStatus, extras: Record<string, unknown> = {}) {
  if (!JOB_STATUSES.includes(status)) throw new Error(`Invalid job status: ${status}`);
  const current = await getJob(jobId);
  if (!current) throw new Error(`Job ${jobId} not found`);
  if (current.status !== status && !transitions[current.status as JobStatus]?.includes(status)) {
    throw new Error(`Invalid job transition: ${current.status} -> ${status}`);
  }

  const fields = ['status = $1'];
  const values: unknown[] = [status];
  if (status === 'planning' || status === 'rendering') fields.push('started_at = COALESCE(started_at, now())');
  if (status === 'completed' || status === 'failed') fields.push('finished_at = now()');
  for (const [key, value] of Object.entries(extras)) {
    if (!['model', 'prompt_version', 'input_json', 'output_json', 'output_path', 'error_message'].includes(key)) continue;
    values.push(value);
    fields.push(`${key} = $${values.length}`);
  }
  values.push(jobId);
  const result = await query(`UPDATE video_jobs SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  return result.rows[0];
}