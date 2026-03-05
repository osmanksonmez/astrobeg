#!/usr/bin/env node
/**
 * fetch-instagram.js
 *
 * Fetches posts from Instagram via Apify's instagram-scraper actor,
 * downloads images locally to ig-images/, and writes posts.json.
 * No Facebook/Meta app or token required — scrapes the public profile.
 *
 * Run manually:  APIFY_TOKEN=xxx node fetch-instagram.js
 * Run via CI:    GitHub Actions supplies APIFY_TOKEN from repo secrets.
 */

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const TOKEN     = process.env.APIFY_TOKEN;
const USERNAME  = 'astrobeg';
const LIMIT     = 30;
const OUTPUT    = path.join(__dirname, 'posts.json');
const IMG_DIR   = path.join(__dirname, 'ig-images');

// ── Helpers ────────────────────────────────────────────────────
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Bad JSON: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Download a URL to a local file path, following redirects. */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get  = url.startsWith('https') ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function extractTitle(caption) {
  if (!caption) return 'Astrobeg';
  const first = caption.split('\n')[0].replace(/[*_#]/g, '').trim();
  return first.slice(0, 90) || 'Astrobeg';
}

function extractExcerpt(caption, max = 220) {
  if (!caption) return '';
  const clean = caption
    .replace(/#\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) {
    console.error('Error: APIFY_TOKEN environment variable is not set.');
    console.error('Set it and retry:  APIFY_TOKEN=your_token node fetch-instagram.js');
    process.exit(1);
  }

  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR);

  // Synchronous run — waits for the actor to finish and returns dataset items directly.
  const apiUrl =
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items` +
    `?token=${TOKEN}&timeout=240&memory=256`;

  const input = JSON.stringify({
    directUrls:   [`https://www.instagram.com/${USERNAME}/`],
    resultsType:  'posts',
    resultsLimit: LIMIT,
  });

  console.log(`Fetching Instagram posts for @${USERNAME} via Apify…`);
  const items = await httpsPost(apiUrl, input);

  if (!Array.isArray(items)) {
    console.error('Unexpected Apify response:', JSON.stringify(items).slice(0, 300));
    process.exit(1);
  }

  console.log(`Retrieved ${items.length} items.`);

  // Download images and build post objects
  const posts = [];
  for (const m of items) {
    if (!['Image', 'Sidecar'].includes(m.type)) continue;

    const remoteUrl = m.displayUrl || null;
    let localImage  = null;

    if (remoteUrl) {
      const filename = `${m.shortCode || m.id}.jpg`;
      const dest     = path.join(IMG_DIR, filename);

      // Skip download if already saved
      if (fs.existsSync(dest)) {
        localImage = `ig-images/${filename}`;
        console.log(`  Skipping (already saved): ${filename}`);
      } else {
        try {
          await downloadFile(remoteUrl, dest);
          localImage = `ig-images/${filename}`;
          console.log(`  Downloaded: ${filename}`);
        } catch (err) {
          console.warn(`  Failed to download image for ${m.shortCode}: ${err.message}`);
        }
      }
    }

    posts.push({
      id:            m.shortCode || m.id,
      title:         extractTitle(m.caption),
      excerpt:       extractExcerpt(m.caption),
      caption:       m.caption || '',
      image:         localImage,
      thumbnail:     localImage,
      permalink:     m.url,
      date:          m.timestamp,
      dateFormatted: formatDate(m.timestamp),
      type:          m.type === 'Sidecar' ? 'CAROUSEL_ALBUM' : 'IMAGE',
      source:        'instagram',
    });
  }

  // Merge with existing manual (non-instagram) posts
  let existing = { posts: [] };
  if (fs.existsSync(OUTPUT)) {
    try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); }
    catch (_) { /* ignore corrupt file */ }
  }

  const manualPosts = (existing.posts || []).filter(p => p.source !== 'instagram');
  const merged = [...posts, ...manualPosts].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  const output = {
    updated: new Date().toISOString(),
    count:   merged.length,
    posts:   merged,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Saved ${merged.length} posts to posts.json (${posts.length} from Instagram, ${manualPosts.length} manual).`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
