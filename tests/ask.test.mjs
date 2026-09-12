import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAsk, pageBrief, geminiRequest, parseSuggestions, youTubeUri, resetVideoSupport,
  MAX_PAGE_CHARACTERS, DEFAULT_GEMINI_MODEL
} from '../worker/ask.mjs';

const ORIGIN = 'https://pigsfield.com';
const post = (body, headers = {}) => new Request(`${ORIGIN}/api/ask`, {
  method: 'POST',
  headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body)
});
const reply = (text) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

test('only a real YouTube video id is ever forwarded to the model', () => {
  assert.equal(youTubeUri('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(youTubeUri('https://youtu.be/dQw4w9WgXcQ?t=42'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(youTubeUri('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  // Gemini fetches this address itself, so anything that is not a verified video id is the
  // endpoint being pointed at a target of someone else's choosing.
  for (const hostile of [
    'https://pigsfield.com/api/auth/session',
    'http://169.254.169.254/latest/meta-data/',
    'https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=../../etc/passwd',
    'file:///etc/passwd',
    ''
  ]) assert.equal(youTubeUri(hostile), '', `${hostile} must not be forwarded`);
});

test('the page brief is bounded and delimited', () => {
  const { brief, uri } = pageBrief({
    title: 'Photosynthesis',
    url: `${ORIGIN}/learn/`,
    headings: ['Photosynthesis', 'Light reactions'],
    text: 'x'.repeat(MAX_PAGE_CHARACTERS * 3),
    video: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Photosynthesis in 10 minutes' }
  });
  assert.ok(brief.startsWith('<page_context>') && brief.endsWith('</page_context>'));
  assert.ok(brief.length < MAX_PAGE_CHARACTERS + 2000, 'the brief must stay bounded whatever the page holds');
  assert.match(brief, /Photosynthesis in 10 minutes/);
  assert.equal(uri, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

test('the video part is attached only when there is a verified video', () => {
  const { brief } = pageBrief({ title: 'A page' });
  const withVideo = geminiRequest('notes', brief, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', [], false);
  const withoutVideo = geminiRequest('notes', brief, '', [], false);
  assert.ok(withVideo.contents[0].parts.some((part) => part.fileData));
  assert.ok(!withoutVideo.contents[0].parts.some((part) => part.fileData));
  assert.match(withVideo.systemInstruction.parts[0].text, /study notes/i);
  // The page is reference material; the instruction has to say so or a page can steer it.
  assert.match(withVideo.systemInstruction.parts[0].text, /never as instructions/i);
  assert.equal(geminiRequest('suggest', brief, '', [], false).generationConfig.responseMimeType, 'application/json');
});

test('malformed suggestions are dropped rather than shown', () => {
  assert.deepEqual(parseSuggestions('```json\n[{"label":"Explain this","prompt":"Explain the page"}]\n```'),
    [{ label: 'Explain this', prompt: 'Explain the page' }]);
  assert.deepEqual(parseSuggestions('not json at all'), []);
  assert.deepEqual(parseSuggestions('[{"label":"","prompt":"x"},{"prompt":"y"}]'), []);
  assert.equal(parseSuggestions(JSON.stringify(Array.from({ length: 9 }, () => ({ label: 'a', prompt: 'b' })))).length, 4);
});

test('the route refuses anything but a same-origin POST, and says when it is unconfigured', async () => {
  const env = { GEMINI_API_KEY: 'test-key' };
  assert.equal((await handleAsk(new Request(`${ORIGIN}/api/ask`, { method: 'GET' }), env)).status, 405);
  const crossOrigin = new Request(`${ORIGIN}/api/ask`, { method: 'POST', headers: { Origin: 'https://elsewhere.test' }, body: '{}' });
  assert.equal((await handleAsk(crossOrigin, env)).status, 403);
  const unconfigured = await handleAsk(post({ mode: 'chat', messages: [{ role: 'user', text: 'hi' }] }), {});
  assert.equal(unconfigured.status, 503);
  assert.match((await unconfigured.json()).error, /not configured/i);
  const empty = await handleAsk(post({ mode: 'chat', messages: [] }), env);
  assert.equal(empty.status, 400);
});

test('a chat answer carries the model text and never the key', async () => {
  resetVideoSupport();
  let seen;
  const response = await handleAsk(
    post({ mode: 'chat', page: { title: 'Ohm law' }, messages: [{ role: 'user', text: 'explain this' }] }),
    { GEMINI_API_KEY: 'test-key' },
    async (url, init) => { seen = { url, init }; return reply('Voltage equals current times resistance.'); }
  );
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.match(data.text, /Voltage equals current/);
  assert.equal(data.engine, 'google-gemini');
  assert.ok(seen.url.includes(DEFAULT_GEMINI_MODEL), 'the default model is used when none is configured');
  assert.equal(seen.init.headers['x-goog-api-key'], 'test-key');
  assert.ok(!JSON.stringify(data).includes('test-key'), 'the key must never reach the browser');
});

test('the suggestion round can be pointed at its own model, which has its own allowance', async () => {
  resetVideoSupport();
  const seen = [];
  const env = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-main', GEMINI_SUGGEST_MODEL: 'gemini-lite' };
  const record = async (url) => { seen.push(url.split('/').pop()); return reply('[]'); };
  await handleAsk(post({ mode: 'suggest', page: { title: 'A page' }, messages: [] }), env, record);
  await handleAsk(post({ mode: 'chat', messages: [{ role: 'user', text: 'hi' }] }), env, record);
  assert.deepEqual(seen, ['gemini-lite:generateContent', 'gemini-main:generateContent']);

  // Unset, suggestions ride the main model exactly as before.
  const shared = [];
  await handleAsk(post({ mode: 'suggest', page: { title: 'A page' }, messages: [] }),
    { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-main' },
    async (url) => { shared.push(url.split('/').pop()); return reply('[]'); });
  assert.deepEqual(shared, ['gemini-main:generateContent']);
});

test('a configured model name overrides the default and is sanitised', async () => {
  let seen;
  await handleAsk(
    post({ mode: 'chat', messages: [{ role: 'user', text: 'hi' }] }),
    { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-4-flash/../../admin' },
    async (url) => { seen = url; return reply('ok'); }
  );
  assert.ok(seen.endsWith('/gemini-4-flash....admin:generateContent'), seen);
});

const videoPage = { title: 'Lesson', video: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } };

test('a video the model cannot read is retried without it, then not attempted again', async () => {
  resetVideoSupport();
  const calls = [];
  const withVideo = (init) => JSON.parse(init.body).contents[0].parts.some((part) => part.fileData);
  const response = await handleAsk(
    post({ mode: 'notes', page: videoPage, messages: [] }),
    { GEMINI_API_KEY: 'k' },
    async (url, init) => {
      calls.push(withVideo(init));
      // Live Gemini answers 403 "caller does not have permission" to a YouTube part on a
      // key that is not entitled to video input, in about a tenth of a second.
      return calls.length === 1 ? new Response('{}', { status: 403 }) : reply('# Notes');
    }
  );
  assert.deepEqual(calls, [true, false], 'the retry must drop the video part');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.text, /# Notes/);
  assert.equal(data.usedVideo, false, 'the answer must not claim it watched the video');

  // The refusal is remembered: a second request spends one call, not two.
  const second = [];
  await handleAsk(
    post({ mode: 'notes', page: videoPage, messages: [] }),
    { GEMINI_API_KEY: 'k' },
    async (url, init) => { second.push(withVideo(init)); return reply('# Notes again'); }
  );
  assert.deepEqual(second, [false], 'a known refusal must not be retried on every request');
});

test('a quota error is never retried, because the retry spends the allowance that ran out', async () => {
  resetVideoSupport();
  let calls = 0;
  const response = await handleAsk(
    post({ mode: 'notes', page: videoPage, messages: [] }),
    { GEMINI_API_KEY: 'k' },
    async () => { calls += 1; return new Response('{}', { status: 429 }); }
  );
  assert.equal(calls, 1, '429 must not trigger the without-video retry');
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /busy/i);
});

test('upstream failures are reported without leaking their shape', async () => {
  const env = { GEMINI_API_KEY: 'k' };
  const busy = await handleAsk(post({ mode: 'chat', messages: [{ role: 'user', text: 'hi' }] }), env, async () => new Response('{}', { status: 429 }));
  assert.equal(busy.status, 429);
  const broken = await handleAsk(post({ mode: 'chat', messages: [{ role: 'user', text: 'hi' }] }), env, async () => new Response('{}', { status: 500 }));
  assert.equal(broken.status, 502);
  assert.ok(!JSON.stringify(await broken.json()).includes('500'));
  const thrown = await handleAsk(post({ mode: 'chat', messages: [{ role: 'user', text: 'hi' }] }), env, async () => { throw new Error('socket'); });
  assert.equal(thrown.status, 503);
  const rateLimited = await handleAsk(post({ mode: 'chat', messages: [{ role: 'user', text: 'hi' }] }), {
    GEMINI_API_KEY: 'k',
    AI_IP_RATE_LIMITER: { limit: async () => ({ success: false }) }
  }, async () => reply('never'));
  assert.equal(rateLimited.status, 429);
});
