/**
 * HyperFrames Video Compiler
 * ===========================
 * Reads a Video Plan JSON → loads templates from registry →
 * injects data + theme → generates a HyperFrames index.html composition.
 *
 * Usage (Node.js):
 *   node compiler/compiler.js --plan demos/demo-ai-news.json --output output/
 *
 * Usage (programmatic):
 *   const compiler = new VideoCompiler('./');
 *   const result = await compiler.compile(videoPlan);
 */

const fs = require('fs');
const path = require('path');

class VideoCompiler {
  constructor(projectDir) {
    this.projectDir = path.resolve(projectDir);
    this.registry = this._loadJSON('config/templates.json');
    this.animations = this._loadJSON('config/animations.json');
    this.themes = this._loadJSON('config/themes.json');
    this.templateCache = {};
  }

  _loadJSON(relPath) {
    const fullPath = path.join(this.projectDir, relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn('[Compiler] Missing config:', relPath);
      return null;
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  }

  _loadTemplate(templateId) {
    if (this.templateCache[templateId]) return this.templateCache[templateId];

    const entry = (this.registry?.templates || []).find(t => t.id === templateId);
    if (!entry) {
      throw new Error(`Template "${templateId}" not found in registry`);
    }

    const filePath = path.join(this.projectDir, entry.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Template file not found: ${entry.file}`);
    }

    const html = fs.readFileSync(filePath, 'utf-8');
    this.templateCache[templateId] = { entry, html };
    return this.templateCache[templateId];
  }

  _loadSchema(templateId) {
    const schemaPath = path.join(this.projectDir, `schemas/${templateId}.schema.json`);
    if (fs.existsSync(schemaPath)) {
      return JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    }
    return null;
  }

  _injectData(templateHtml, templateId, data, theme) {
    // Replace the DATA block in the template's script section
    // Strategy: inject a window.__hfData global before the template script
    const dataScript = `<script>
      window.__hfData = window.__hfData || {};
      window.__hfData['${templateId}'] = ${JSON.stringify(data)};
    </script>`;

    // Insert data script right after the opening <template> tag
    return templateHtml.replace('<template>', '<template>\n' + dataScript);
  }

  _applyTheme(templateHtml, themeId) {
    if (!this.themes || !this.themes.themes) return templateHtml;
    const theme = this.themes.themes[themeId];
    if (!theme) return templateHtml;

    // Generate CSS custom property declarations
    const cssVars = Object.entries(theme)
      .map(([key, val]) => `      ${key}: ${val};`)
      .join('\n');

    const themeStyle = `<style>\n    #root {\n${cssVars}\n    }\n    </style>`;

    // Insert theme style right after the data script
    return templateHtml.replace('</template>', themeStyle + '\n</template>');
  }

  /**
   * Compile a Video Plan into HyperFrames compositions
   * @param {object} plan - Video Plan JSON
   * @param {string} [outputDir] - Output directory (default: this.projectDir)
   * @returns {object} Compilation result
   */
  async compile(plan, outputDir) {
    outputDir = outputDir || this.projectDir;

    const scenes = plan.scenes || [];
    const globalTheme = plan.theme || 'dark-tech';
    const compositions = [];
    let totalDuration = 0;

    console.log(`[Compiler] Compiling "${plan.title}" with ${scenes.length} scenes...`);

    // Process each scene
    for (const scene of scenes) {
      const templateId = scene.template;
      const { entry, html } = this._loadTemplate(templateId);
      const sceneTheme = scene.theme || globalTheme;
      const sceneDuration = scene.duration || entry.defaultDuration || 8;

      // Inject data
      let processed = this._injectData(html, templateId, scene.data || {}, sceneTheme);

      // Apply theme
      processed = this._applyTheme(processed, sceneTheme);

      // Update composition-id to be unique per scene
      const compId = `${templateId}-${scene.scene}`;
      processed = processed.replace(
        new RegExp(`data-composition-id="${templateId}"`, 'g'),
        `data-composition-id="${compId}"`
      );
      processed = processed.replace(
        new RegExp(`window\\.__timelines\\['${templateId}'\\]`, 'g'),
        `window.__timelines['${compId}']`
      );
      processed = processed.replace(
        new RegExp(`window\\.__timelines\\["${templateId}"\\]`, 'g'),
        `window.__timelines["${compId}"]`
      );

      // Write composition file
      const compDir = path.join(outputDir, 'compositions', `scene-${scene.scene}`);
      fs.mkdirSync(compDir, { recursive: true });
      const compFile = path.join(compDir, 'composition.html');
      fs.writeFileSync(compFile, processed, 'utf-8');

      compositions.push({
        scene: scene.scene,
        template: templateId,
        compositionId: compId,
        file: `compositions/scene-${scene.scene}/composition.html`,
        start: totalDuration,
        duration: sceneDuration
      });

      totalDuration += sceneDuration;
      console.log(`  Scene ${scene.scene}: ${templateId} (${sceneDuration}s) @ ${compositions[compositions.length - 1].start}s`);
    }

    // Generate main index.html
    const indexHtml = this._generateIndex(plan, compositions, totalDuration, globalTheme);
    const indexPath = path.join(outputDir, 'index.html');

    // Backup existing index.html
    if (fs.existsSync(indexPath)) {
      const backupDir = path.join(outputDir, '.hyperframes', 'backup');
      fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = Date.now();
      fs.copyFileSync(indexPath, path.join(backupDir, `index-${timestamp}.html`));
    }

    fs.writeFileSync(indexPath, indexHtml, 'utf-8');

    console.log(`[Compiler] Done! Total duration: ${totalDuration}s, ${compositions.length} scenes`);
    console.log(`[Compiler] Output: ${indexPath}`);

    return {
      success: true,
      totalDuration,
      compositions,
      indexFile: indexPath
    };
  }

  _generateIndex(plan, compositions, totalDuration, theme) {
    const sceneSlots = compositions.map(comp => {
      return `      <!-- Scene ${comp.scene}: ${comp.template} -->
      <div
        data-composition-id="${comp.compositionId}"
        data-composition-src="${comp.file}"
        data-start="${comp.start}"
        data-duration="${comp.duration}"
        data-track-index="${comp.scene}"
        data-width="1920"
        data-height="1080"
      ></div>`;
    }).join('\n\n');

    return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1920, height=1080">
    <title>${this._escapeHtml(plan.title || 'HyperFrames Video')}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"><\/script>
    <style>
      body {
        margin: 0;
        background: #0a0e17;
        font-family: 'Inter', system-ui, sans-serif;
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #0a0e17;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${totalDuration}"
      data-width="1920"
      data-height="1080"
    >
${sceneSlots}
    </div>
    <script>
      // Main timeline — empty shell; sub-composition timelines are auto-nested by the runtime
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    <\/script>
  </body>
</html>`;
  }

  _escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  let planPath = null;
  let outputDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plan' && args[i + 1]) planPath = args[++i];
    else if (args[i] === '--output' && args[i + 1]) outputDir = args[++i];
    else if (!planPath) planPath = args[i];
  }

  if (!planPath) {
    console.log('Usage: node compiler.js --plan <video-plan.json> [--output <dir>]');
    process.exit(1);
  }

  const projectDir = path.join(__dirname, '..');
  const compiler = new VideoCompiler(projectDir);

  const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf-8'));
  outputDir = outputDir ? path.resolve(outputDir) : projectDir;

  compiler.compile(plan, outputDir).then(result => {
    if (result.success) {
      console.log('\n✅ Compilation successful!');
      console.log(`   Scenes: ${result.compositions.length}`);
      console.log(`   Duration: ${result.totalDuration}s`);
    }
  }).catch(err => {
    console.error('❌ Compilation failed:', err.message);
    process.exit(1);
  });
}

module.exports = VideoCompiler;
