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

-- Video topics. Seeded from server/topics/*.json (only topics not yet in the table), then edited in the web UI.
CREATE TABLE IF NOT EXISTS topics (
  topic_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  tone VARCHAR(500) NULL,
  kicker VARCHAR(60) NULL,
  icon VARCHAR(100) NULL,
  default_tags JSON NOT NULL,
  related_tags JSON NOT NULL,
  background VARCHAR(20) NOT NULL DEFAULT 'grid',
  theme JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 99,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Shared asset library (storage/library/, downloaded by scripts/download-assets.js).
-- cutout = transparent PNG of one object (background removed by scripts/cutout.py).
-- `common` assets suit every topic; the others are linked to topics in topic_assets.
CREATE TABLE IF NOT EXISTS assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('illustration','logo','photo','cutout') NOT NULL,
  name VARCHAR(120) NOT NULL,
  file VARCHAR(255) NOT NULL,
  label VARCHAR(255) NULL,
  common TINYINT(1) NOT NULL DEFAULT 0,
  source VARCHAR(80) NOT NULL,
  license VARCHAR(100) NULL,
  credit VARCHAR(255) NULL,
  source_url VARCHAR(500) NULL,
  width INT NULL,
  height INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assets_kind_name (kind, name)
);

CREATE TABLE IF NOT EXISTS topic_assets (
  topic_id VARCHAR(50) NOT NULL,
  asset_id INT NOT NULL,
  PRIMARY KEY (topic_id, asset_id),
  CONSTRAINT fk_topic_assets_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
