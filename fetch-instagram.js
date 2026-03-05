#!/usr/bin/env node
/**
 * fetch-instagram.js
 *
 * Fetches posts from the Instagram Graph API and writes them to posts.json.
 * Run manually:  INSTAGRAM_TOKEN=xxx node fetch-instagram.js
 * Run via CI:    GitHub Actions supplies INSTAGRAM_TOKEN from repo secrets.
 *
 * Required env vars:
 *   INSTAGRAM_TOKEN  — long-lived Instagram User Access Token (never commit this)
 *
 * The token must have the following permissions:
 *   instagram_basic, pages_show_list (for business accounts)
 *   OR instagram_basic (for Basic Display API personal accounts)
 *
 * Token refresh: long-lived tokens last 60 days. The workflow auto-refreshes
 * them before expiry using the /refresh_access_token endpoint.
 */

'use strict';

const https   = require('https');
const fs      = require('fs');
const path    = require('path');

// ── Config ────────────────────────────────────────────────────
const TOKEN      = process.env.INSTAGRAM_TOKEN;
const LIMIT      = 30;   // posts to fetch per sync
const OUTPUT     = path.join(__dirname, 'posts.json');

// ── Helpers ───────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Bad JSON: ' + raw.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

/** Extract a blog-style title from the first line of a caption. */
function extractTitle(caption) {
  if (!caption) return 'Astrobeg';
  const first = caption.split('\n')[0].replace(/[*_#]/g, '').trim();
  return first.slice(0, 90) || 'Astrobeg';
}

/** Clean excerpt: strip hashtags, excess whitespace, cap length. */
function extractExcerpt(caption, max = 220) {
  if (!caption) return '';
  const clean = caption
    .replace(/#\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean;
}

/** Format ISO timestamp to Turkish locale date string. */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ── Refresh token (keeps it alive beyond 60 days) ─────────────
async function refreshToken(token) {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;
  const data = await httpsGet(url);
  if (data.access_token) {
    console.log(`Token refreshed. New expiry: ${data.expires_in}s`);
    return data.access_token;
  }
  console.warn('Token refresh skipped:', data.error?.message || 'unknown');
  return token;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) {
    console.error('Error: INSTAGRAM_TOKEN environment variable is not set.');
    console.error('Set it and retry:  INSTAGRAM_TOKEN=your_token node fetch-instagram.js');
    process.exit(1);
  }

  // Try to refresh the token first (safe to call even if not near expiry)
  const liveToken = await refreshToken(TOKEN);

  // Fetch media list
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
  const apiUrl = `https://graph.instagram.com/me/media?fields=${fields}&limit=${LIMIT}&access_token=${liveToken}`;

  console.log('Fetching Instagram media…');
  const response = await httpsGet(apiUrl);

  if (response.error) {
    console.error('Instagram API error:', response.error.message);
    process.exit(1);
  }

  const media = response.data || [];
  console.log(`Retrieved ${media.length} media items.`);

  // Map to our post schema
  const posts = media
    .filter(m => ['IMAGE', 'CAROUSEL_ALBUM'].includes(m.media_type))
    .map(m => ({
      id:        m.id,
      title:     extractTitle(m.caption),
      excerpt:   extractExcerpt(m.caption),
      caption:   m.caption || '',
      image:     m.media_url   || null,
      thumbnail: m.thumbnail_url || m.media_url || null,
      permalink: m.permalink,
      date:      m.timestamp,
      dateFormatted: formatDate(m.timestamp),
      type:      m.media_type,
      source:    'instagram',
    }));

  // Merge with any existing non-instagram (manual) posts
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

  // Print refreshed token so the Actions workflow can update the secret
  if (liveToken !== TOKEN) {
    console.log('\nREFRESHED_TOKEN=' + liveToken);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
