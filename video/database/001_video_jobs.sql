CREATE TABLE IF NOT EXISTS video_jobs (
  id SERIAL PRIMARY KEY,
  news_id INTEGER NOT NULL REFERENCES video_news(id),
  type VARCHAR(30) DEFAULT 'full_video',
  status VARCHAR(30) DEFAULT 'queued',
  model TEXT,
  prompt_version TEXT,
  input_json JSONB,
  output_json JSONB,
  output_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_news_id ON video_jobs(news_id);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status);

CREATE TABLE IF NOT EXISTS video_renders (
  id SERIAL PRIMARY KEY,
  news_id INTEGER NOT NULL REFERENCES video_news(id),
  job_id INTEGER NOT NULL REFERENCES video_jobs(id),
  composition_file TEXT,
  output_path TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  fps INTEGER DEFAULT 30,
  width INTEGER DEFAULT 1080,
  height INTEGER DEFAULT 1920,
  created_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_video_renders_job_id ON video_renders(job_id);