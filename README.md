# Pigsfield

**Education within reach. Skills for opportunity. Government made accountable.**

Pigsfield is a free-first learning map for India. It organizes educational, skill-building, exam, media, digital-tool and public-accountability resources into clear paths while sending people directly to the original provider.

## What is included

- Nursery to PhD learning paths with highlighted Teacher Training after PhD
- PigBang educational media with lazy, privacy-enhanced YouTube playback
- Competitive Exams roadmaps, mock tests and subject collections
- Vocational & Business resources shown directly
- Digital Tools with six directly visible categories and practical tutorials
- Expandable RTI, grievance, legal-aid and Make Govt Accountable categories
- An always-available AI Studio with no visitor login, additional provider key or model download for tutoring, images, documents, capability-gated browser voice previews and browser-made music
- Persistent in-page Hindi translation: on-device where supported, otherwise through a rate-limited same-origin Cloudflare AI4Bharat route
- Persistent AI Studio, Donate and Feedback controls
- A best-effort monthly browser check-in total backed by a privacy-light Cloudflare Durable Object
- A responsive depth-and-motion layer with a reduced-motion-safe flat mode
- About, editorial policy, accessibility, privacy and contribution pages

The catalog is **free-first**, not a promise that every third-party resource is free forever. Always check the provider's current price, terms and eligibility.

## Run locally

The interface is dependency-free. Serve the repository root instead of opening files directly so service workers and embeds behave as they will in production:

```bash
python -m http.server 8741
```

Then open `http://localhost:8741`.

This static preview does not provide `/api/ai` or `/api/translate`; hosted text generation and fallback Hindi translation need the deployed Cloudflare Worker and its `AI` binding.

Run the repository checks with:

```bash
npm run build
npm test
```

## Deploy from GitHub with Cloudflare Workers

1. Push this folder to the repository's `main` branch.
2. Connect the repository to a Cloudflare Workers Builds project and use the included `wrangler.jsonc` configuration.
3. Deploy the repository root. Cloudflare publishes the static assets and runs `worker/index.mjs` before `/api/*` requests.
4. Turn on **Always Use HTTPS** in the Cloudflare dashboard (SSL/TLS → Edge Certificates). `worker/index.mjs` contains an http→https redirect, but `run_worker_first` in `wrangler.jsonc` is scoped to `/api/*`, so the Worker never runs for a page request and that redirect cannot fire for ordinary traffic. The `Strict-Transport-Security` header in `_headers` protects every visit after the first one; only the dashboard setting covers the first.
5. Keep the AI binding named `AI`, the visitor Durable Object binding named `VISITOR_COUNTER`, and the rate-limit bindings named `AI_RATE_LIMITER`, `AI_IP_RATE_LIMITER`, `TRANSLATION_RATE_LIMITER`, `TRANSLATION_IP_RATE_LIMITER` and `VISITOR_RATE_LIMITER`. The browser-facing endpoints are the same-origin `/api/ai`, `/api/translate` and `/api/visitors` routes. The declarative `exports` block provisions the SQLite-backed visitor counter on deployment.
6. The three text choices use the native Workers AI binding. Ensure the Cloudflare account has sufficient Workers AI allocation; visitors still need no account or additional provider key.

## Optional accounts (off by default)

Pigsfield works fully without an account and nothing is gated behind one. Signing in exists
only so a saved list can follow someone between a shared PC and a phone. With no D1 database
bound, every `/api/auth/*` route answers "not enabled" and the sign-in panel never appears —
guest mode is the default, not a fallback.

To turn it on:

```bash
npx wrangler d1 create pigsfield
# put the printed database_id into wrangler.jsonc
npx wrangler d1 execute pigsfield --remote --file=worker/schema.sql
npx wrangler secret put ACCOUNT_PEPPER      # any long random string
npx wrangler secret put RESEND_API_KEY      # or swap sendMagicLink() for another provider
npx wrangler secret put ACCOUNT_FROM_EMAIL  # e.g. hello@pigsfield.com, on a verified domain
```

`ACCOUNT_PEPPER` is not optional and is not stored in this repository. Email addresses are
never written to the database — only a peppered SHA-256 of them — and email addresses carry
far too little entropy for a bare hash to resist a dictionary attack. Without the pepper
that protection would be theatre, so the code refuses to run rather than pretend. Losing the
pepper means existing accounts can no longer be matched; rotating it is a deliberate reset.

The static interface uses relative asset paths, but hosted text generation requires the Cloudflare Worker and its bindings. Canonical and social metadata intentionally point to the production domain.

## Edit resources

The live catalog is in `js/data/`:

- `school.js` — Nursery-to-PhD learning stages; receives the shared Teacher Training section after PhD
- `teach.js` — Teacher Training source records plus the 24-item Vocational & Business catalog
- `tools.js` — Digital Tools
- `exams.js` — Competitive Exams paths
- `pigbang.js` — PigBang educational media
- `govt.js` — Make Govt Accountable resources

Keep each link pointed at the original, lawful provider. Add a clear description, accurate price label and the most specific source URL available. The browser creates the cards, varied visual symbols, filters and source links from these data files. Every provider control is a genuine anchor, so desktop right-click and mobile press-and-hold expose the browser's normal open-in-new-tab and copy-link actions for that exact original URL.

## YouTube embeds and error 153

Playback starts only after the visitor presses Play. The player uses YouTube's privacy-enhanced domain, sends a strict-origin referrer, supports video and playlist URLs, and always keeps an original-source fallback. Do not change the site referrer policy to `no-referrer`; YouTube needs site identity for embedded playback. Videos whose owners disable embedding must still open on their original YouTube page.

## AI Studio boundaries

Pigsfield does not ask visitors for an account or additional provider key. The studio loads only when its persistent dock button is opened and offers exactly one selectable model hosted by Cloudflare Workers AI:

- `gemma-4-26b-a4b-it` — Google's efficient reasoning model, served as `@cf/google/gemma-4-26b-a4b-it`. Visitors need no login or additional provider key.

Tutor and document prompts are sent to the same-origin `/api/ai` route, which calls the selected model through the server-side Cloudflare AI binding. No model files are downloaded to the browser and no additional provider key is exposed there. A random local client identifier and Cloudflare-provided network address support short abuse limits; shared capacity and provider availability still apply. Image prompts use the named Pollinations image service. Voice preview and music synthesis appear only when the browser supports the necessary capability, and their final output is made in the browser. Generated images, documents and music files remain downloadable where the browser supports the format. Do not enter personal, confidential or high-stakes information into a cloud service, and verify all generated work before using it.

The homepage calls `/api/visitors` only to show a best-effort monthly browser check-in total. A first-party, HTTP-only cookie stores the current India calendar month so the same browser is usually counted once. The Durable Object stores only the total and its start time; it does not store per-visitor identifiers.

The studio also provides ordinary external links to [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models) and [Qwen Chat](https://chat.qwen.ai/). These open the providers' own websites, where their current login, pricing, privacy and usage terms apply.

## Accessibility and privacy

The interface is keyboard navigable, responsive, reduced-motion aware and designed with visible focus and strong contrast. Saved resources, preferences and recent activity stay in browser storage. Choosing हिन्दी uses the browser's on-device Translator API where supported. Otherwise, loaded translatable English interface text—including page copy, accessible labels, titles and placeholders—goes in limited batches to Pigsfield's same-origin `/api/translate` route and Cloudflare-hosted AI4Bharat IndicTrans2; text typed by the visitor is never included. That fallback is rate-limited, uses a no-referrer request, needs no visitor account or provider key, and sends neither the page URL nor text to Google Translate. Browser-menu guidance appears only if both paths fail. See the in-site Accessibility and Privacy pages for the full plain-language policy.

## Support and corrections

- Donate by UPI: `zeroisinf@ibl`
- Feedback, corrections and volunteering: `zeroisinf@gmail.com`

Pigsfield is volunteer-led. Growth should come from usefulness, trustworthy sources, accessibility and community correction—not inflated claims or search-engine tricks.
