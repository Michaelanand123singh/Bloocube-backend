/*
  Usage:
    BASE_URL=http://localhost:5000 AUTH_TOKEN="Bearer <jwt>" node scripts/testCompetitorFetch.js

  Notes:
  - AUTH_TOKEN is optional if your endpoint allows unauthenticated access. If required, pass a valid token.
  - This script exercises /api/competitor/fetch for multiple platforms and prints key fields or errors.
*/

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const VERBOSE = (process.env.VERBOSE || '').toLowerCase() === 'true' || process.env.VERBOSE === '1';

const tests = [
  { platform: 'instagram', competitorUrl: 'https://www.instagram.com/instagram' },
  { platform: 'twitter',   competitorUrl: 'https://x.com/Twitter' },
  { platform: 'youtube',   competitorUrl: 'https://www.youtube.com/@YouTube' },
  { platform: 'linkedin',  competitorUrl: 'https://www.linkedin.com/company/google' },
  { platform: 'facebook',  competitorUrl: 'https://www.facebook.com/facebook' },
];

async function postJson(path, body) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers['Authorization'] = AUTH_TOKEN;
  if (VERBOSE) {
    console.log('\n--- REQUEST -------------------------------------------');
    console.log('POST', url);
    console.log('Headers:', headers);
    console.log('Body:', JSON.stringify(body));
  }
  console.time(`request:${path}`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  console.timeEnd(`request:${path}`);
  const text = await res.text();
  if (VERBOSE) {
    console.log('--- RESPONSE ------------------------------------------');
    console.log('Status:', res.status, res.statusText);
    try { console.log('Content-Type:', res.headers.get('content-type')); } catch {}
    console.log('Raw Body:', text);
  }
  let json;
  try { json = JSON.parse(text); } catch (e) { 
    console.log('JSON parse error:', e.message);
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} -> ${text}`);
  }
  return json;
}

function printResult(label, result) {
  if (!result || !result.success) {
    console.log(`❌ ${label}:`, result?.message || 'Unknown error');
    return;
  }
  const d = result.data || {};
  const profile = d.profile || {};
  const engagement = d.engagement || {};
  const content = d.content || {};
  console.log(`✅ ${label}`);
  console.log(`   platform: ${profile.platform}`);
  console.log(`   username: ${profile.username}`);
  if (profile.followers != null) console.log(`   followers: ${profile.followers}`);
  if (profile.subscribers != null) console.log(`   subscribers: ${profile.subscribers}`);
  console.log(`   engagementRate: ${engagement.engagementRate}%`);
  console.log(`   totalPosts (period): ${content.totalPosts}`);
  console.log(`   dataQuality: ${d.dataQuality?.level} (score ${d.dataQuality?.score})`);

  // Warnings for missing/odd data
  const warnings = [];
  if (!profile.platform) warnings.push('missing profile.platform');
  if (!profile.username) warnings.push('missing profile.username');
  if (engagement.engagementRate == null || engagement.engagementRate === 'NaN') warnings.push('missing/invalid engagementRate');
  if (typeof content.totalPosts !== 'number') warnings.push('missing content.totalPosts');
  if (warnings.length) console.log('   warnings:', warnings.join(', '));

  // Sample first post metrics for debugging
  if (Array.isArray(content.posts) && content.posts.length > 0) {
    const p = content.posts[0];
    const sample = {
      id: p.id || p.post_id,
      created_at: p.created_time || p.created_at || p.publishedAt,
      like_count: p.like_count || p.favorite_count || p.likes || p.likeCount,
      comment_count: p.comment_count || p.reply_count || p.comments || p.commentCount,
      share_count: p.retweet_count || p.share_count || p.shares,
      media_type: p.media_type || p.content_type,
      title: p.title || undefined
    };
    console.log('   firstPostSample:', sample);
  }
}

async function run() {
  console.log(`Testing /api/competitor/fetch against ${BASE_URL}`);
  for (const t of tests) {
    const label = `${t.platform} -> ${t.competitorUrl}`;
    try {
      console.time(label);
      const res = await postJson('/api/competitor/fetch', t);
      printResult(label, res);
      console.timeEnd(label);
    } catch (err) {
      console.log(`❌ ${label}: ${err.message}`);
      if (VERBOSE && err.stack) console.log(err.stack);
    }
  }
}

// Node 18+ has global fetch; if not, fall back to node-fetch
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});


