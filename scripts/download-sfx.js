#!/usr/bin/env node
/**
 * Download game SFX from Freesound.
 * Usage: FREESOUND_KEY=your_key node scripts/download-sfx.js
 *
 * Searches Freesound for each sound, picks the top-rated result under the
 * max duration, and downloads the HQ MP3 preview to app/public/sfx/.
 *
 * Run again to refresh any sound — it skips already-downloaded files
 * unless you pass --force.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const API_KEY    = process.env.FREESOUND_KEY;
const OUT_DIR    = path.join(__dirname, '..', 'app', 'public', 'sfx');
const FORCE      = process.argv.includes('--force');

if (!API_KEY) {
  console.error('Set FREESOUND_KEY env var: FREESOUND_KEY=yourkey node scripts/download-sfx.js');
  process.exit(1);
}

// ─── Sound specs ─────────────────────────────────────────────────────────────
// name        → output filename (name.mp3)
// query       → Freesound search query
// maxDuration → seconds, filters out anything longer
// filter      → optional extra Freesound filter string
const SOUNDS = [
  // ── Snake ────────────────────────────────────────────────────────────────
  {
    name: 'snake-eat',
    query: 'crunch bite eating short',
    maxDuration: 1.5,
  },
  {
    name: 'snake-die',
    query: '8bit retro death game over short',
    maxDuration: 3,
  },
  {
    name: 'snake-start',
    query: 'arcade game start short beep',
    maxDuration: 2,
  },
  {
    name: 'snake-speedup',
    query: 'swoosh whoosh speed short',
    maxDuration: 1,
  },

  // ── Wing Run ─────────────────────────────────────────────────────────────
  {
    name: 'wr-deliver',
    query: 'delivery success ding coins cash register',
    maxDuration: 2,
  },
  {
    name: 'wr-crash',
    query: 'crash collision impact car short',
    maxDuration: 2,
  },
  {
    name: 'wr-closecall',
    query: 'whoosh swish near miss',
    maxDuration: 1,
  },
  {
    name: 'wr-powerup',
    query: 'power up collect sparkle pickup',
    maxDuration: 2,
  },
  {
    name: 'wr-round',
    query: 'level complete fanfare short victory',
    maxDuration: 4,
  },
  {
    name: 'wr-hop',
    query: 'jump spring bounce short',
    maxDuration: 1,
  },
  {
    name: 'wr-combo',
    query: 'combo streak bonus ding short',
    maxDuration: 1.5,
  },

  // ── Shared UI ────────────────────────────────────────────────────────────
  {
    name: 'ui-click',
    query: 'button click ui tap short',
    maxDuration: 0.5,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlinkSync(dest); reject(err); });
    }).on('error', err => { fs.unlinkSync(dest); reject(err); });
  });
}

async function fetchBestSound({ name, query, maxDuration }) {
  const filter  = `duration:[0+TO+${maxDuration}]`;
  const fields  = 'id,name,duration,previews,license,username';
  const url     = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&token=${API_KEY}&fields=${fields}&filter=${filter}&sort=rating_desc&page_size=10`;

  const raw  = await get(url);
  const data = JSON.parse(raw);

  if (!data.results || data.results.length === 0) {
    throw new Error(`No results found for query: "${query}"`);
  }

  // Prefer results where preview-hq-mp3 is present
  const result = data.results.find(r => r.previews && r.previews['preview-hq-mp3'])
               || data.results[0];

  if (!result.previews || !result.previews['preview-hq-mp3']) {
    throw new Error(`No preview URL for best result of: "${query}"`);
  }

  return {
    id:       result.id,
    title:    result.name,
    duration: result.duration,
    license:  result.license,
    author:   result.username,
    url:      result.previews['preview-hq-mp3'],
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const report = [];
  let downloaded = 0, skipped = 0, failed = 0;

  for (const spec of SOUNDS) {
    const dest = path.join(OUT_DIR, `${spec.name}.mp3`);

    if (!FORCE && fs.existsSync(dest)) {
      console.log(`  skip  ${spec.name}.mp3 (already exists, use --force to re-download)`);
      skipped++;
      continue;
    }

    process.stdout.write(`  fetch ${spec.name}.mp3 ... `);

    try {
      const sound = await fetchBestSound(spec);
      await download(sound.url, dest);

      const kb = (fs.statSync(dest).size / 1024).toFixed(1);
      console.log(`✓  ${kb}KB  "${sound.title}" by ${sound.author} (${sound.duration.toFixed(1)}s)`);
      report.push({ file: `${spec.name}.mp3`, id: sound.id, title: sound.title, author: sound.author, license: sound.license, duration: sound.duration });
      downloaded++;

      // Small delay to be polite to the API
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.log(`✗  ${err.message}`);
      report.push({ file: `${spec.name}.mp3`, error: err.message });
      failed++;
    }
  }

  // Write a manifest so you can see exactly what was downloaded and swap
  // individual sounds by searching Freesound and re-running with --force
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(report, null, 2));

  console.log(`\nDone. ${downloaded} downloaded, ${skipped} skipped, ${failed} failed.`);
  console.log(`Manifest written to app/public/sfx/manifest.json`);
  console.log(`\nTo replace a sound: search freesound.org, note the ID, then edit the query`);
  console.log(`and re-run with --force to re-download just that file.`);
}

main().catch(err => { console.error(err); process.exit(1); });
