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
// High-fidelity modern arcade style. DEFENSIVE: Insisting on single asset, centered, white bg.
const STYLE = 'Sleek professional 3D digital game asset, single isolated object, perfectly centered in frame, pure solid white background, high-fidelity 4K render, cinematic studio lighting, sharp edges, vibrant colors, masterfully detailed, NO COLLAGE, NO GRID, NO MULTIPLE VIEWS, ONLY ONE CHARACTER,';

// ─── Asset definitions ────────────────────────────────────────────────────────
const ASSET_SETS = {

  // ── Top-down Sauce Shooter ─────────────────────────────────────────────────
  shooter: [
    {
      name: 'player-ship',
      prompt: `${STYLE} a single top-down view of a golden crown wearing chicken king riding a sleek high-tech glowing chrome sauce bottle jet, sci-fi delivery vehicle, sleek design`,
      count: 1,
    },
    {
      name: 'enemy-van-1',
      prompt: `${STYLE} a single top-down view of a mean-looking red armored fast food delivery van, futuristic spikes, aggressive sports car details`,
      count: 1,
    },
    {
      name: 'enemy-van-2',
      prompt: `${STYLE} a single top-down view of a heavy-duty purple armored burger truck, sci-fi tank details, glowing engine parts`,
      count: 1,
    },
    {
      name: 'bullet-sauce',
      prompt: `${STYLE} a single glowing orange plasma bolt in the shape of a sauce drop, energy projectile, trails of fire`,
      count: 1,
    },
    {
      name: 'explosion',
      prompt: `${STYLE} a single cinematic fireball explosion, glowing orange and white heat, smoke trails, dramatic impact`,
      count: 1,
    },
    {
      name: 'powerup-shield',
      prompt: `${STYLE} a single glowing hexagonal energy shield icon, holographic gold aura, futuristic powerup`,
      count: 1,
    },
    {
      name: 'powerup-rapid',
      prompt: `${STYLE} a single glowing lightning bolt icon inside a sauce bottle, blue neon energy, futuristic speed powerup`,
      count: 1,
    },
    {
      name: 'bg-tile',
      prompt: `High-detail 4K aerial view of a futuristic neon city grid at night, glowing streets, cyberpunk architecture, seamless texture tile`,
      count: 1,
    },
  ],

  // ── Wing Run (Top-down Delivery) ──────────────────────────────────────────
  wingrun: [
    {
      name: 'player-bike',
      prompt: `${STYLE} a single full top-down aerial view of a futuristic high-tech cyberpunk delivery motorcycle, glowing neon tires, sleek aerodynamic chrome body, a golden crown wearing chicken king is the rider, perfectly centered, isolated`,
      count: 1,
    },
    {
      name: 'enemy-car-1',
      prompt: `${STYLE} a single top-down view of a sleek red futuristic sports car, neon lights, cyberpunk vehicle`,
      count: 1,
    },
    {
      name: 'enemy-car-2',
      prompt: `${STYLE} a single top-down view of a heavy blue futuristic armored truck, neon lights`,
      count: 1,
    },
    {
      name: 'building-shop',
      prompt: `${STYLE} a single top-down aerial view of a futuristic cyberpunk fast food shop building with neon signs saying "Wingz", highly detailed roof`,
      count: 1,
    },
    {
      name: 'building-house',
      prompt: `${STYLE} a single top-down aerial view of a futuristic cyberpunk residential house roof, neon accents`,
      count: 1,
    },
    {
      name: 'bg-road',
      prompt: `High-detail 4K top-down view of a futuristic cyberpunk city road intersection, glowing neon lines, dark asphalt, seamless tileable`,
      count: 1,
    },
    {
      name: 'bg-grass',
      prompt: `High-detail 4K top-down view of glowing futuristic synthetic grass, cyberpunk landscaping, seamless tileable`,
      count: 1,
    }
  ],

  // ── Snake ──────────────────────────────────────────────────────────────────
  snake: [
    {
      name: 'snake-head',
      prompt: `${STYLE} a single top-down view of the head of a chicken king wearing a gold crown, high fidelity 3D render`,
      count: 1,
    },
    {
      name: 'snake-body',
      prompt: `${STYLE} a single top-down view of a golden fried chicken wing, high fidelity 3D render`,
      count: 1,
    },
    {
      name: 'collectible-crown',
      prompt: `${STYLE} a single top-down view of a glowing gold crown jewel, high fidelity 3D render`,
      count: 1,
    },
    {
      name: 'collectible-wing',
      prompt: `${STYLE} a single top-down view of a glowing golden crispy fried chicken wing, high fidelity 3D render`,
      count: 1,
    },
    {
      name: 'bg-tile',
      prompt: `High-detail 4K dark asphalt texture, subtle glowing neon grid lines, seamless tile`,
      count: 1,
    },
  ],

  // ── Side-scrolling Platformer ──────────────────────────────────────────────
  platformer: [
    {
      name: 'player-idle',
      prompt: `${STYLE} a single side view of a fat chubby chicken king character standing idle, gold crown, red comb, white feathers, 3D character model style, high detail`,
      count: 1,
    },
    {
      name: 'player-run-1',
      prompt: `${STYLE} a single side view of a chicken king mid-run frame 1, crown on head, one leg forward, 3D character model style`,
      count: 1,
    },
    {
      name: 'player-run-2',
      prompt: `${STYLE} a single side view of a chicken king mid-run frame 2, crown on head, opposite leg forward, 3D character model style`,
      count: 1,
    },
    {
      name: 'player-jump',
      prompt: `${STYLE} a single side view of a chicken king character jumping, crown on head, wings spread, legs tucked, 3D character model style`,
      count: 1,
    },
    {
      name: 'enemy-bin',
      prompt: `${STYLE} a single side view of a futuristic robotic garbage bin with glowing red eyes, metallic textures, high detail`,
      count: 1,
    },
    {
      name: 'enemy-inspector',
      prompt: `${STYLE} a single side view of a sinister corporate health inspector, glowing visor, metallic suit, futuristic clipboard`,
      count: 1,
    },
    {
      name: 'collectible-wing',
      prompt: `${STYLE} a single golden crispy fried chicken wing, glowing radiant energy, floating in mid-air, 3D render`,
      count: 1,
    },
    {
      name: 'platform-tile',
      prompt: `High-fidelity futuristic industrial platform tile, metallic plating with glowing gold seams, 3D texture, seamless tileable`,
      count: 1,
    },
    {
      name: 'bg-city',
      prompt: `High-detail 4K cinematic city background at night, glowing neon signs, rainy atmosphere, depth of field, futuristic architecture`,
      count: 1,
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

function saveImage(urlOrData, dest) {
  // fal.ai can return either an https URL or a data: URI
  if (urlOrData.startsWith('data:')) {
    const base64 = urlOrData.split(',')[1];
    fs.writeFileSync(dest, Buffer.from(base64, 'base64'));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(urlOrData, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return saveImage(res.headers.location, dest).then(resolve).catch(reject);
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
    'https://fal.run/fal-ai/fast-sdxl',
    { 'Authorization': `Key ${FAL_KEY}` },
    {
      prompt: asset.prompt,
      image_size: 'square_hd',
      num_images: asset.count,
      enable_safety_checker: false,
      sync_mode: true,
    }
  );

  if (result.status !== 200 || !result.body.images) {
    console.log(`✗  HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 180)}`);
    return false;
  }

  const images = result.body.images;
  for (let i = 0; i < images.length; i++) {
    const imgUrl = images[i].url || images[i];
    const dest   = path.join(outDir, `${asset.name}_${i + 1}.png`);
    await saveImage(imgUrl, dest);
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
