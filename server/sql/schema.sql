-- Schema for the AI video studio. Safe to run repeatedly.

-- One row per video project (docs/THIET-KE-HE-THONG.md);
-- the project's files live in storage/projects/<slug>/.
CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  material MEDIUMTEXT NOT NULL,
  channel VARCHAR(100) NULL,
  topic VARCHAR(50) NOT NULL DEFAULT 'technology',
  voice VARCHAR(100) NOT NULL DEFAULT 'vi-VN-HoaiMyNeural',
  voice_rate VARCHAR(10) NOT NULL DEFAULT '+6%',
  target_seconds INT NOT NULL DEFAULT 90,
  aspect_ratio VARCHAR(10) NOT NULL DEFAULT '16:9',
  width INT NOT NULL DEFAULT 1920,
  height INT NOT NULL DEFAULT 1080,
  plan JSON NULL,
  plan_approved TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('draft','planning','awaiting_approval','building','built','rendering','completed','failed') NOT NULL DEFAULT 'draft',
  progress INT NOT NULL DEFAULT 0,
  message VARCHAR(1000) NULL,
  manual_edit TINYINT(1) NOT NULL DEFAULT 0,
  duration DECIMAL(8,3) NULL,
  current_version INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Every successful render; the plan is snapshotted so a version can be traced back.
CREATE TABLE IF NOT EXISTS project_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  version INT NOT NULL,
  file VARCHAR(255) NOT NULL,
  duration DECIMAL(8,3) NULL,
  manual_edit TINYINT(1) NOT NULL DEFAULT 0,
  plan JSON NULL,
  qc JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_versions_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE KEY uq_project_version (project_id, version)
);

-- Token usage per AI call, for cost tracking.
CREATE TABLE IF NOT EXISTS ai_calls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  step VARCHAR(30) NOT NULL,
  model VARCHAR(100) NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cache_read_input_tokens INT NOT NULL DEFAULT 0,
  frames_sent INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_calls_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- History of long-running actions with their log, so a failure points at its step.
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  type ENUM('plan','build','render') NOT NULL,
  status ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  log MEDIUMTEXT NULL,
  error TEXT NULL,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_jobs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_jobs_project (project_id, id)
);
