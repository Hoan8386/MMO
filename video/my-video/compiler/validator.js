/**
 * HyperFrames Video Plan Validator
 * ==================================
 * Validates a Video Plan JSON against the template registry,
 * schemas, animation library, and theme definitions.
 *
 * Usage:
 *   node compiler/validator.js <video-plan.json>
 *
 * Programmatic:
 *   const { validateVideoPlan } = require('./validator');
 *   const result = validateVideoPlan(plan, projectDir);
 */

const fs = require('fs');
const path = require('path');

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Validate a Video Plan JSON
 * @param {object} plan - The video plan
 * @param {string} projectDir - Project root directory
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateVideoPlan(plan, projectDir) {
  const errors = [];
  const warnings = [];

  const registry = loadJSON(path.join(projectDir, 'config/templates.json'));
  const animationsConfig = loadJSON(path.join(projectDir, 'config/animations.json'));
  const themesConfig = loadJSON(path.join(projectDir, 'config/themes.json'));

  if (!registry) {
    errors.push('Missing config/templates.json');
    return { valid: false, errors, warnings };
  }

  const templateIds = new Set((registry.templates || []).map(t => t.id));
  const animationIds = animationsConfig ? new Set(Object.keys(animationsConfig.animations || {})) : new Set();
  const themeIds = themesConfig ? new Set(Object.keys(themesConfig.themes || {})) : new Set();

  // 1. Check plan structure
  if (!plan) {
    errors.push('Plan is null or undefined');
    return { valid: false, errors, warnings };
  }

  if (!plan.title) {
    warnings.push('Plan is missing a title');
  }

  if (!plan.scenes || !Array.isArray(plan.scenes)) {
    errors.push('Plan must have a "scenes" array');
    return { valid: false, errors, warnings };
  }

  if (plan.scenes.length === 0) {
    errors.push('Plan has 0 scenes');
    return { valid: false, errors, warnings };
  }

  // 2. Check global theme
  if (plan.theme && !themeIds.has(plan.theme)) {
    warnings.push(`Global theme "${plan.theme}" not found in themes.json. Available: ${[...themeIds].join(', ')}`);
  }

  // 3. Validate each scene
  const sceneNumbers = new Set();

  plan.scenes.forEach((scene, idx) => {
    const prefix = `Scene ${scene.scene || idx + 1}`;

    // Scene number
    if (scene.scene === undefined) {
      errors.push(`${prefix}: Missing "scene" number`);
    } else if (sceneNumbers.has(scene.scene)) {
      errors.push(`${prefix}: Duplicate scene number ${scene.scene}`);
    } else {
      sceneNumbers.add(scene.scene);
    }

    // Template
    if (!scene.template) {
      errors.push(`${prefix}: Missing "template" field`);
    } else if (!templateIds.has(scene.template)) {
      errors.push(`${prefix}: Template "${scene.template}" does not exist. Available: ${[...templateIds].join(', ')}`);
    } else {
      // Check template file exists
      const entry = registry.templates.find(t => t.id === scene.template);
      const filePath = path.join(projectDir, entry.file);
      if (!fs.existsSync(filePath)) {
        errors.push(`${prefix}: Template file not found: ${entry.file}`);
      }
    }

    // Duration
    if (scene.duration !== undefined) {
      if (typeof scene.duration !== 'number' || scene.duration <= 0) {
        errors.push(`${prefix}: Duration must be a positive number, got: ${scene.duration}`);
      }
      if (scene.duration > 60) {
        warnings.push(`${prefix}: Duration ${scene.duration}s is unusually long (>60s)`);
      }
    }

    // Animation
    if (scene.animation && !animationIds.has(scene.animation)) {
      warnings.push(`${prefix}: Animation "${scene.animation}" not found in animations.json`);
    }

    // Theme (per-scene)
    if (scene.theme && !themeIds.has(scene.theme)) {
      warnings.push(`${prefix}: Theme "${scene.theme}" not found in themes.json`);
    }

    // Data
    if (!scene.data) {
      warnings.push(`${prefix}: Missing "data" object — template will use defaults`);
    } else if (typeof scene.data !== 'object') {
      errors.push(`${prefix}: "data" must be an object`);
    } else {
      // Validate against schema if available
      const schema = loadJSON(path.join(projectDir, `schemas/${scene.template}.schema.json`));
      if (schema) {
        // Check required fields
        (schema.required || []).forEach(field => {
          if (scene.data[field] === undefined || scene.data[field] === null || scene.data[field] === '') {
            errors.push(`${prefix}: Required field "${field}" is missing in data (template: ${scene.template})`);
          }
        });
      }

      // Check for HTML injection in string values
      Object.entries(scene.data).forEach(([key, val]) => {
        if (typeof val === 'string' && (val.includes('<script') || val.includes('javascript:'))) {
          errors.push(`${prefix}: Potential HTML injection in data field "${key}"`);
        }
      });
    }
  });

  // 4. Check total duration
  const totalDuration = plan.scenes.reduce((sum, s) => sum + (s.duration || 8), 0);
  if (totalDuration > 300) {
    warnings.push(`Total video duration is ${totalDuration}s (${Math.round(totalDuration / 60)}min) — consider splitting`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalScenes: plan.scenes.length,
      totalDuration,
      templatesUsed: [...new Set(plan.scenes.map(s => s.template))],
      theme: plan.theme || 'dark-tech'
    }
  };
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node validator.js <video-plan.json>');
    console.log('       node validator.js --demo  (validate all demo plans)');
    process.exit(1);
  }

  const projectDir = path.join(__dirname, '..');

  if (args[0] === '--demo') {
    // Validate all demo plans
    const demosDir = path.join(projectDir, 'demos');
    if (!fs.existsSync(demosDir)) {
      console.log('No demos/ directory found');
      process.exit(1);
    }
    const files = fs.readdirSync(demosDir).filter(f => f.endsWith('.json'));
    let allValid = true;

    files.forEach(file => {
      const plan = loadJSON(path.join(demosDir, file));
      const result = validateVideoPlan(plan, projectDir);
      const status = result.valid ? '✅' : '❌';
      console.log(`\n${status} ${file}`);
      if (result.errors.length > 0) {
        result.errors.forEach(e => console.log(`   ❌ ${e}`));
        allValid = false;
      }
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
      }
      if (result.stats) {
        console.log(`   📊 ${result.stats.totalScenes} scenes, ${result.stats.totalDuration}s, templates: [${result.stats.templatesUsed.join(', ')}]`);
      }
    });

    process.exit(allValid ? 0 : 1);
  } else {
    const planPath = path.resolve(args[0]);
    const plan = loadJSON(planPath);
    if (!plan) {
      console.error(`Cannot read: ${planPath}`);
      process.exit(1);
    }

    const result = validateVideoPlan(plan, projectDir);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Video Plan Validation: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`${'='.repeat(60)}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  ❌ ${e}`));
    }

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    }

    if (result.stats) {
      console.log('\nStats:');
      console.log(`  Scenes: ${result.stats.totalScenes}`);
      console.log(`  Duration: ${result.stats.totalDuration}s`);
      console.log(`  Templates: ${result.stats.templatesUsed.join(', ')}`);
      console.log(`  Theme: ${result.stats.theme}`);
    }

    process.exit(result.valid ? 0 : 1);
  }
}

module.exports = { validateVideoPlan };
