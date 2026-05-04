#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const ASSETS = {
  'chicken': '1f414',
  'rooster': '1f413',
  'wing': '1f357',
  'crown': '1f451',
  'ufo': '1f6f8',
  'van': '1f690',
  'truck': '1f69a',
  'car': '1f698',
  'scooter': '1f6f5',
  'house': '1f3e0',
  'shop': '1f3ea',
  'inspector': '1f575',
  'bin': '1f5d1',
  'drop': '1f4a7',
  'shield': '1f6e1',
  'bolt': '26a1',
  'boom': '1f4a5'
};

const BASE_URL = 'https://raw.githubusercontent.com/jdecked/twemoji/master/assets/svg/';
const OUT_DIR = path.join(__dirname, '..', 'app', 'public', 'game-assets', 'vector');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function download(name, code) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path.join(OUT_DIR, `${name}.svg`));
    https.get(`${BASE_URL}${code}.svg`, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${name}: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ Downloaded ${name}`);
        resolve();
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching professional vector assets...');
  for (const [name, code] of Object.entries(ASSETS)) {
    await download(name, code);
  }
  console.log('\nAll vector assets downloaded to app/public/game-assets/vector/');
}

main().catch(console.error);
