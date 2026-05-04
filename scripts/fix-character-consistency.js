#!/usr/bin/env node
/**
 * Fix character animation consistency using fal.ai img2img.
 * Reads the chosen player-idle.png as a reference and generates
 * the missing animation frames in the same style.
 *
 * Usage: FAL_KEY=your_key node scripts/fix-character-consistency.js
 *
 * Outputs to app/public/game-assets/platformer/ alongside existing files.
 * Each frame gets 4 variants — rename your pick to <name>.png.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const FAL_KEY  = process.env.FAL_KEY;
const ASSET_DIR = path.join(__dirname, '..', 'app', 'public', 'game-assets', 'platformer');
const REF_IMAGE = path.join(ASSET_DIR, 'player-idle.png');

if (!FAL_KEY) {
  console.error('Set FAL_KEY: FAL_KEY=yourkey node scripts/fix-character-consistency.js');
  process.exit(1);
}

if (!fs.existsSync(REF_IMAGE)) {
  console.error(`Reference image not found: ${REF_IMAGE}`);
  console.error('Make sure you have renamed your chosen idle frame to player-idle.png');
  process.exit(1);
}

// ─── Encode reference image as data URI ──────────────────────────────────────
const refBase64   = fs.readFileSync(REF_IMAGE).toString('base64');
const refDataUri  = `data:image/png;base64,${refBase64}`;

// ─── Frames to generate ───────────────────────────────────────────────────────
// strength: 0.55 keeps close to reference style, 0.75 gives more pose freedom.
const FRAMES = [
  {
    name: 'player-run-1',
    prompt: 'pixel art game sprite, same chicken king character as reference, running pose frame 1, left leg forward right leg back, arms swinging, crown on head, side view, black outline, same art style as reference image',
    strength: 0.65,
    count: 4,
  },
  {
    name: 'player-run-2',
    prompt: 'pixel art game sprite, same chicken king character as reference, running pose frame 2, right leg forward left leg back, arms swinging opposite direction, crown on head, side view, black outline, same art style as reference image',
    strength: 0.65,
    count: 4,
  },
  {
    name: 'player-jump',
    prompt: 'pixel art game sprite, same chicken king character as reference, jumping pose, both legs tucked up, arms raised, crown on head, mid-air, side view, black outline, same art style as reference image',
    strength: 0.65,
    count: 4,
  },
  {
    name: 'player-fall',
    prompt: 'pixel art game sprite, same chicken king character as reference, falling pose, arms out to sides, legs dangling down, crown on head, side view, black outline, same art style as reference image',
    strength: 0.65,
    count: 4,
  },
];

// ─── Also regenerate collectible-wing with a cleaner prompt ──────────────────
const EXTRAS = [
  {
    name: 'collectible-wing',
    prompt: 'pixel art game collectible item, single golden glowing chicken wing, bright orange-gold colour, white highlight, small floating pickup item, black outline, square canvas, game sprite style, no background, top-down view',
    strength: null, // text-to-image (no reference)
    count: 4,
  },
];

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

async function generateImg2Img(frame) {
  process.stdout.write(`  gen  ${frame.name} (${frame.count} variants, img2img) ... `);

  const result = await post(
    'https://fal.run/fal-ai/flux/dev/image-to-image',
    { 'Authorization': `Key ${FAL_KEY}` },
    {
      image_url:           refDataUri,
      prompt:              frame.prompt,
      strength:            frame.strength,
      num_inference_steps: 28,
      num_images:          frame.count,
      sync_mode:           true,
    }
  );

  if (result.status !== 200 || !result.body.images) {
    console.log(`✗  HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 200)}`);
    return false;
  }

  const images = result.body.images;
  for (let i = 0; i < images.length; i++) {
    const dest = path.join(ASSET_DIR, `${frame.name}_fix${i + 1}.png`);
    await saveImage(images[i].url || images[i], dest);
  }

  console.log(`✓  ${images.length} variants saved as ${frame.name}_fix1..${images.length}.png`);
  return true;
}

async function generateText2Img(asset) {
  process.stdout.write(`  gen  ${asset.name} (${asset.count} variants, txt2img) ... `);

  const result = await post(
    'https://fal.run/fal-ai/flux/schnell',
    { 'Authorization': `Key ${FAL_KEY}` },
    {
      prompt:              asset.prompt,
      image_size:          'square_hd',
      num_inference_steps: 4,
      num_images:          asset.count,
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
    const dest = path.join(ASSET_DIR, `${asset.name}_fix${i + 1}.png`);
    await saveImage(images[i].url || images[i], dest);
  }

  console.log(`✓  ${images.length} variants saved as ${asset.name}_fix1..${images.length}.png`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const refKB = (fs.statSync(REF_IMAGE).size / 1024).toFixed(1);
  console.log(`Reference: player-idle.png (${refKB}KB)`);
  console.log(`Generating ${FRAMES.length} animation frames via img2img + ${EXTRAS.length} extras\n`);

  for (const frame of FRAMES) {
    await generateImg2Img(frame);
    await new Promise(r => setTimeout(r, 500));
  }

  for (const extra of EXTRAS) {
    await generateText2Img(extra);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\nDone. New files saved with _fix suffix.');
  console.log('Review them, then rename your pick to <name>.png (overwriting the old one if needed).');
}

main().catch(err => { console.error(err); process.exit(1); });
