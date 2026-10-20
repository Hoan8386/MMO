-- Schema for the AI video studio. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS video_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  style_prompt TEXT NOT NULL,
  palette JSON NOT NULL,
  stroke_color VARCHAR(20) NOT NULL DEFAULT '#141414',
  background_color VARCHAR(20) NOT NULL DEFAULT '#ffffff',
  subtitle_color VARCHAR(20) NOT NULL DEFAULT '#141414',
  stroke_width DECIMAL(4,1) NOT NULL DEFAULT 5,
  width INT NOT NULL DEFAULT 1920,
  height INT NOT NULL DEFAULT 1080,
  voice VARCHAR(100) NOT NULL DEFAULT 'vi-VN-HoaiMyNeural',
  voice_rate VARCHAR(10) NOT NULL DEFAULT '-5%',
  hand_image VARCHAR(255) NULL,
  hand_tip_x DECIMAL(7,2) NOT NULL DEFAULT 3,
  hand_tip_y DECIMAL(7,2) NOT NULL DEFAULT 58.5,
  hand_natural_width INT NOT NULL DEFAULT 248,
  hand_width INT NOT NULL DEFAULT 546,
  hand_rotate DECIMAL(5,1) NOT NULL DEFAULT -24,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS videos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  script MEDIUMTEXT NOT NULL,
  status ENUM('draft','generating','ready','rendering','done','error') NOT NULL DEFAULT 'draft',
  progress INT NOT NULL DEFAULT 0,
  message VARCHAR(500) NULL,
  output_path VARCHAR(255) NULL,
  duration DECIMAL(8,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_videos_type FOREIGN KEY (type_id) REFERENCES video_types(id)
);

CREATE TABLE IF NOT EXISTS scenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  video_id INT NOT NULL,
  idx INT NOT NULL,
  text TEXT NOT NULL,
  paths JSON NULL,
  audio_path VARCHAR(255) NULL,
  audio_duration DECIMAL(8,3) NULL,
  status ENUM('pending','ready','error') NOT NULL DEFAULT 'pending',
  message VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_scenes_video FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  INDEX idx_scenes_video (video_id, idx)
);

INSERT IGNORE INTO video_types (name, slug, description, style_prompt, palette, stroke_color, background_color)
VALUES
('Người que', 'nguoi-que',
 'Whiteboard vẽ tay người que, nét đen, tô màu nhẹ.',
 'Whiteboard stick-figure style. Characters are simple stick figures: a circle head with dot eyes and a small mouth expressing emotion, a single line body, line arms and legs. Props are simple outline icons (phone, gift box, speech bubble, heart, cloud). Minimal detail, generous white space, one clear visual metaphor per sentence.',
 JSON_ARRAY('#ffe0b8','#e84a5f','#f7c548','#4fc3f7','#81c784','#ff9800','#ba68c8'), '#141414', '#ffffff'),
('Hoạt hình', 'hoat-hinh',
 'Hoạt hình màu sắc tươi, nhân vật dễ thương.',
 'Bright cartoon style. Cute rounded characters with big heads, big eyes and expressive faces, chunky bodies with clothes, drawn with smooth curves. Colorful filled shapes, playful props and simple background elements (sun, cloud, tree, house). Friendly and fun.',
 JSON_ARRAY('#ffcc80','#ff7043','#ffd54f','#4dd0e1','#9ccc65','#f06292','#7e57c2','#29b6f6'), '#2d2d2d', '#fffdf5'),
('Khoa học', 'khoa-hoc',
 'Sơ đồ khoa học: mũi tên, biểu đồ, nguyên tử, công thức.',
 'Clean science-explainer diagram style. Use diagrams, arrows, flow charts, simple charts, atoms and molecules, planets, cells, gears, lab glassware and labelled boxes. Letters and numbers are drawn as short strokes. Precise geometric shapes, clear left-to-right or top-to-bottom flow.',
 JSON_ARRAY('#90caf9','#1e88e5','#26a69a','#ffb74d','#ef5350','#b0bec5','#ce93d8'), '#1b2a41', '#f7fbff');
