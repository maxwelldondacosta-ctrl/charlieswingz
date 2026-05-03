#!/usr/bin/env node
/**
 * Generate game sprite assets using fal.ai (Flux model).
 * Usage: FAL_KEY=your_key node scripts/generate-assets.js [game]
 *
 * Examples:
 *   FAL_KEY=xxx node scripts/generate-assets.js          # all games
 *   FAL_KEY=xxx node scripts/generate-assets.js shooter  # shooter only
 *   FAL_KEY=xxx node scripts/generate-assets.js platformer
 *
 * Output: app/public/game-assets/<game>/<name>.png
 *
 * Each asset is generated 4 times so you can pick the best one.
 * Images are saved as <name>_1.png, <name>_2.png, etc.
 * Rename the one you want to <name>.png once you've reviewed them.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const FAL_KEY = process.env.FAL_KEY;
const TARGET  = process.argv[2] || 'all';
const OUT_ROOT = path.join(__dirname, '..', 'app', 'public', 'game-assets');

if (!FAL_KEY) {
  console.error('Set FAL_KEY env var: FAL_KEY=yourkey node scripts/generate-assets.js');
  process.exit(1);
}

// ─── Shared style prefix ──────────────────────────────────────────────────────
// Prepended to every prompt. Tweak this to shift the whole art direction.
const STYLE = 'pixel art game sprite, clean outlines, vibrant colours, black outline, transparent background, 64x64 pixels, retro arcade style,';

// ─── Asset definitions ────────────────────────────────────────────────────────
const ASSET_SETS = {

  // ── Top-down Sauce Shooter ─────────────────────────────────────────────────
  // A top-down arcade shooter: you defend Charlie's Wingz shop from rival
  // food vans coming in waves. Shoot sauce bottles at them.
  shooter: [
    {
      name: 'player-ship',
      prompt: `${STYLE} top-down view of a golden crown wearing chicken king on a flying sauce bottle, player character for top-down shooter`,
      count: 4,
    },
    {
      name: 'enemy-van-1',
      prompt: `${STYLE} top-down view of a red rival fast food van, enemy vehicle, simple and readable`,
      count: 4,
    },
    {
      name: 'enemy-van-2',
      prompt: `${STYLE} top-down view of a purple rival burger van, enemy vehicle, slightly different from red variant`,
      count: 4,
    },
    {
      name: 'bullet-sauce',
      prompt: `${STYLE} small hot sauce bottle projectile, bright orange, flying through air, side view, tiny`,
      count: 4,
    },
    {
      name: 'explosion',
      prompt: `${STYLE} small orange and gold explosion burst, circular, fire and sparks, no background`,
      count: 4,
    },
    {
      name: 'powerup-shield',
      prompt: `${STYLE} golden shield powerup item, glowing, small pickup collectible`,
      count: 4,
    },
    {
      name: 'powerup-rapid',
      prompt: `${STYLE} lightning bolt sauce bottle powerup, rapid fire, small collectible item`,
      count: 4,
    },
    {
      name: 'bg-tile',
      prompt: `pixel art top-down dark tarmac road tile, 64x64, subtle texture, dark grey, city road, seamless tile`,
      count: 2,
    },
  ],

  // ── Side-scrolling Platformer ──────────────────────────────────────────────
  // Run right, jump over obstacles (bins, traffic cones, health inspectors),
  // collect floating wings. Infinite runner style.
  platformer: [
    {
      name: 'player-idle',
      prompt: `${STYLE} side view of a chicken king character standing idle, crown on head, chef apron, arms at sides, platformer character`,
      count: 4,
    },
    {
      name: 'player-run-1',
      prompt: `${STYLE} side view of a chicken king character mid-run frame 1, crown on head, one leg forward, platformer sprite`,
      count: 4,
    },
    {
      name: 'player-run-2',
      prompt: `${STYLE} side view of a chicken king character mid-run frame 2, crown on head, opposite leg forward, platformer sprite`,
      count: 4,
    },
    {
      name: 'player-jump',
      prompt: `${STYLE} side view of a chicken king character jumping, crown on head, arms up, legs bent, platformer sprite`,
      count: 4,
    },
    {
      name: 'enemy-bin',
      prompt: `${STYLE} side view of an animated angry wheelie bin with eyes, obstacle enemy, platformer`,
      count: 4,
    },
    {
      name: 'enemy-inspector',
      prompt: `${STYLE} side view of a grumpy health inspector in a suit with clipboard, enemy character, platformer`,
      count: 4,
    },
    {
      name: 'collectible-wing',
      prompt: `${STYLE} floating glowing chicken wing collectible item, golden glow, side view, small pickup`,
      count: 4,
    },
    {
      name: 'platform-tile',
      prompt: `pixel art side-view platform tile brick, dark charcoal brick with gold mortar lines, 64x32, seamless tileable`,
      count: 2,
    },
    {
      name: 'bg-city',
      prompt: `pixel art side-scrolling city background, dark night sky, neon lit shop fronts, far distance, parallax layer, wide format, no foreground elements`,
      count: 2,
    },
  ],

};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = https.request(url, opts, res => {
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

function downloadPng(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadPng(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlinkSync(dest); reject(err); });
    }).on('error', err => { fs.unlinkSync(dest); reject(err); });
  });
}

async function generateAsset(asset, outDir) {
  process.stdout.write(`  gen  ${asset.name} (${asset.count} variants) ... `);

  const result = await post(
    'https://fal.run/fal-ai/flux/schnell',
    { 'Authorization': `Key ${FAL_KEY}` },
    {
      prompt: asset.prompt,
      image_size: 'square_hd',   // 1024x1024 — you can crop/resize after
      num_inference_steps: 4,
      num_images: asset.count,
      enable_safety_checker: false,
      sync_mode: true,
    }
  );

  if (result.status !== 200 || !result.body.images) {
    console.log(`✗  HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 120)}`);
    return false;
  }

  const images = result.body.images;
  for (let i = 0; i < images.length; i++) {
    const imgUrl = images[i].url || images[i];
    const dest   = path.join(outDir, `${asset.name}_${i + 1}.png`);
    await downloadPng(imgUrl, dest);
  }

  console.log(`✓  ${images.length} images saved`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const games = TARGET === 'all' ? Object.keys(ASSET_SETS) : [TARGET];
  const unknown = games.filter(g => !ASSET_SETS[g]);
  if (unknown.length) {
    console.error(`Unknown game(s): ${unknown.join(', ')}. Available: ${Object.keys(ASSET_SETS).join(', ')}`);
    process.exit(1);
  }

  for (const game of games) {
    console.log(`\n── ${game.toUpperCase()} ──`);
    const outDir = path.join(OUT_ROOT, game);
    fs.mkdirSync(outDir, { recursive: true });

    const assets = ASSET_SETS[game];
    let ok = 0, fail = 0;

    for (const asset of assets) {
      const success = await generateAsset(asset, outDir);
      success ? ok++ : fail++;
      // Brief pause between requests
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n  ${game}: ${ok} assets generated, ${fail} failed`);
    console.log(`  Output: app/public/game-assets/${game}/`);
    console.log(`  Review the variants (_1, _2, _3, _4) and rename your pick to <name>.png`);
  }

  console.log('\nAll done.');
}

main().catch(err => { console.error(err); process.exit(1); });
