#!/usr/bin/env node
/**
 * Generate a character sprite sheet — all poses in one image.
 * Drawn together = naturally consistent. User crops each frame manually.
 *
 * Usage: FAL_KEY=your_key node scripts/generate-sprite-sheet.js
 *
 * Outputs: app/public/game-assets/platformer/spritesheet_v1.png ... v4.png
 * Crop each ~256px-wide column out as the individual frame.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const FAL_KEY  = process.env.FAL_KEY;
const OUT_DIR  = path.join(__dirname, '..', 'app', 'public', 'game-assets', 'platformer');

if (!FAL_KEY) {
  console.error('Set FAL_KEY: FAL_KEY=yourkey node scripts/generate-sprite-sheet.js');
  process.exit(1);
}

// ─── Character locked description (extracted from player-idle.png) ────────────
const CHARACTER = 'fat chubby white chicken with gold three-pointed crown, red comb feathers on head, yellow beak, red wattle under beak, small red bow tie at neck, round white feathered body, orange chicken feet, pixel art style, black outlines, side view facing right';

// ─── Sprite sheet variants ────────────────────────────────────────────────────
// Each generates a landscape image with 4 frames side by side.
// Frames left to right: idle | run-1 | run-2 | jump
const SHEETS = [
  {
    name: 'spritesheet-character',
    prompt: `pixel art game sprite sheet, 4 frames side by side on plain light grey background, ${CHARACTER}: [frame 1] standing idle upright, [frame 2] running with left leg kicked forward and right arm forward, [frame 3] running with right leg kicked forward and left arm forward, [frame 4] jumping with both legs tucked under body and arms raised up. Each frame same size, evenly spaced, consistent character across all frames, retro arcade platformer style`,
    count: 4,
  },
  {
    name: 'spritesheet-actions',
    prompt: `pixel art game sprite sheet, 4 frames side by side on plain light grey background, ${CHARACTER}: [frame 1] crouching low to ground, [frame 2] taking damage recoiling backwards, [frame 3] celebrating with both wings raised up, [frame 4] falling downward with wings spread out. Each frame same size, evenly spaced, consistent character, retro arcade platformer style`,
    count: 4,
  },
];

// ─── Collectible wing — fresh prompts ────────────────────────────────────────
const COLLECTIBLES = [
  {
    name: 'collectible-wing-v2',
    prompt: 'pixel art game collectible, single crispy fried chicken wing, golden-brown colour, glistening sauce, bright gold glow around it, small floating pickup item, black outline, plain background, retro game sprite style',
    count: 4,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function saveImage(urlOrData, dest) {
  if (urlOrData.startsWith('data:')) {
    fs.writeFileSync(dest, Buffer.from(urlOrData.split(',')[1], 'base64'));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(urlOrData, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlinkSync(dest);
        return saveImage(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlinkSync(dest); reject(err); });
    }).on('error', err => { fs.unlinkSync(dest); reject(err); });
  });
}

async function generate(name, prompt, count, size = 'landscape_4_3') {
  process.stdout.write(`  gen  ${name} (${count} variants) ... `);

  const result = await post(
    'https://fal.run/fal-ai/fast-sdxl',
    { 'Authorization': `Key ${FAL_KEY}` },
    {
      prompt,
      image_size:          size,
      num_images:          count,
      enable_safety_checker: false,
      sync_mode:           true,
    }
  );

  if (result.status !== 200 || !result.body.images) {
    console.log(`✗  HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 200)}`);
    return false;
  }

  const images = result.body.images;
  for (let i = 0; i < images.length; i++) {
    const dest = path.join(OUT_DIR, `${name}_${i + 1}.png`);
    await saveImage(images[i].url || images[i], dest);
  }

  console.log(`✓  ${images.length} saved`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('── Character sprite sheets (crop each frame manually) ──');
  for (const sheet of SHEETS) {
    await generate(sheet.name, sheet.prompt, sheet.count);
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n── Collectibles ──');
  for (const c of COLLECTIBLES) {
    await generate(c.name, c.prompt, c.count, 'square_hd');
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\nDone.');
  console.log('Sprite sheets: crop each ~quarter-width column as a separate frame.');
  console.log('Preview them with: open app/public/game-assets/platformer/spritesheet-character_1.png');
}

main().catch(err => { console.error(err); process.exit(1); });
