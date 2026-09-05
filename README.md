# Pigsfield

**Education within reach. Skills for opportunity. Government made accountable.**

Pigsfield is a free-first learning map for India. It organizes educational, skill-building, exam, media, digital-tool and public-accountability resources into clear paths while sending people directly to the original provider.

## What is included

- Nursery to PhD learning paths with highlighted Teacher Training after PhD
- PigBang educational media with real cover art for every entry and lazy, privacy-enhanced YouTube playback
- Competitive Exams roadmaps, mock tests and subject collections
- Vocational & Business resources shown directly
- Digital Tools with six directly visible categories and practical tutorials
- Expandable RTI, grievance, legal-aid and Make Govt Accountable categories
- An always-available AI Studio with a choice of three hosted models and no visitor login, additional provider key or model download, for tutoring, images, documents, capability-gated browser voice previews and browser-made music
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
5. Keep the AI binding named `AI`, the visitor Durable Object binding named `VISITOR_COUNTER`, and the rate-limit bindings named `AI_RATE_LIMITER`, `AI_IP_RATE_LIMITER`, `TRANSLATION_RATE_LIMITER`, `TRANSLATION_IP_RATE_LIMITER`, `VISITOR_RATE_LIMITER` and `POSTER_IP_RATE_LIMITER`. The browser-facing endpoints are the same-origin `/api/ai`, `/api/translate`, `/api/poster` and `/api/visitors` routes. The declarative `exports` block provisions the SQLite-backed visitor counter on deployment.
6. The three text models use the native Workers AI binding. Ensure the Cloudflare account has sufficient Workers AI allocation; visitors still need no account or additional provider key.

## Optional accounts (off by default)

Pigsfield works fully without an account and nothing is gated behind one. Signing in exists
only so a saved list can follow someone between a shared PC and a phone. With no D1 database
bound, every `/api/auth/*` route answers "not enabled" and the sign-in panel never appears —
guest mode is the default, not a fallback.

To turn it on:

```bash
npx wrangler d1 create pigsfield
# add the printed database_id to wrangler.jsonc; the binding is documented there but not
# declared, because a placeholder id cannot deploy
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

## Knowing whether a change is actually live

The repository being green and the site being current are two different facts. Cloudflare
Workers Builds deploys from `main` on its own schedule, so a change can pass every check
here, be merged, and simply not be serving — and until this existed, the only way to find
out was for someone to open the site and notice.

`npm run check:production` now answers it. `sw.js` carries a digest of the shell it
precaches, stamped by `tools/build-sw.mjs`, which makes it a build fingerprint that costs
nothing extra: the check reads the digest production is serving and compares it to the one
this tree computes. It waits up to six minutes, because the post-merge job starts seconds
after the push and legitimately races the deploy. A commit that does not touch the shell
leaves the digest unchanged and passes at once, which is correct — there is nothing new to
deploy.

The same job also asks production for one real PigBang poster. `/api/poster` needs the
deployed Worker, so it cannot be exercised anywhere else — a static preview has no `/api` at
all — and before this the first person to notice that every card had lost its artwork would
have been a visitor. The probe uses a YouTube video id, the one source resolved without
reading a provider's page, so a failure means the endpoint is broken rather than a provider
having declined to answer a crawler. A provider blocking us is a cached 404 and a card that
keeps its generated symbol: working as designed, and not something to fail a build over.

So a green `main` now means the site is serving that commit and PigBang's cover art works. A
failure in either is a deployment problem, not a code problem: check Workers Builds for the
repository.

One known failure is neither, and is a dashboard setting: `http://pigsfield.com/` answers
200 instead of redirecting. `run_worker_first` is scoped to `/api/*`, so the Worker's own
http→https redirect never runs for a page request, and no change in this repository can fix
it. Turn on **Always Use HTTPS** in Cloudflare (SSL/TLS → Edge Certificates). The
`Strict-Transport-Security` header in `_headers` already covers every visit after the first
one; only that setting covers the first.

## Cover art (`/api/poster`)

Every PigBang card shows real cover art, and the visitor's browser fetches none of it from
the provider.

Deriving artwork from the link only ever worked for two of them — a YouTube video id maps to
a thumbnail and a Steam app id to a store header — so most of the grid fell back to a
generated tile with an emoji on it. But Netflix, Prime Video, Hotstar, the Play Store, the
App Store, Internet Archive and YouTube channels all publish cover art already: as the Open
Graph metadata they serve to link-preview crawlers. `worker/poster.mjs` reads it the same
way, at the edge, and streams the image back from this origin.

That means the browser contacts nobody to paint a card, `img-src` needs no exception beyond
`'self'`, and a provider that blocks us costs one cached 404 rather than a broken tile on
every visit — the generated symbol stays behind every poster and is revealed if the image
does not arrive.

The URL comes from a query string, so it is treated as attacker-controlled even though the
catalog is a fixed list: https only, public DNS names only, no IP literals (a public-looking
one can still resolve inside a private range), no ports, no `/api/` paths, bounded reads, a
hard timeout, and a response that must actually be a raster image. SVG is refused — it is a
document, not a poster.

Cost is bounded by caching, not by hope: a resolved poster is held in the Cloudflare edge
cache and in the browser for 30 days, a miss for 6 hours, and `POSTER_IP_RATE_LIMITER` caps
what one address can make the Worker fetch upstream. `sw.js` deliberately skips `/api/`, or
the service worker's cache-first branch would have refetched every poster in the background
on every hit.

Refresh a stale poster by clearing the Cloudflare cache for the URL; there is no stored image
map to regenerate and nothing to keep in sync with the catalog.

## AI Studio boundaries

Pigsfield does not ask visitors for an account or additional provider key. The studio loads
only when its persistent dock button is opened, and offers three selectable models, all
hosted by Cloudflare Workers AI:

- `gemma-4-26b-a4b-it` — the default. Google's efficient reasoning model, served as `@cf/google/gemma-4-26b-a4b-it`.
- `gpt-oss-120b` — the strongest open-weights model on the platform, served as `@cf/openai/gpt-oss-120b`. Best for a hard problem; slower, and the only one that reasons before answering.
- `llama-4-scout-17b-16e-instruct` — the best of the three on Indian languages, served as `@cf/meta/llama-4-scout-17b-16e-instruct`.

"No login, no key, no download" is a property of the endpoint, not of the model behind it,
so it holds for all three.

Gemma stays the default for cost, not inertia. At $0.30 per million output tokens it is the
cheapest text model on Workers AI by a wide margin — roughly 2.8x cheaper than
`llama-4-scout-17b-16e-instruct` and over 10x cheaper than `qwen3.8-27b`. Against the
10,000 Neurons/day free allocation that is about 730 answers a day on Gemma rather than 260
on Scout, which is the difference between the studio staying free to run and not. The other
two are there because they are genuinely better at something, and a visitor who needs that
should not have to go elsewhere; make one of them the default only with that trade in mind.

Each model reads a different request body, and Workers AI **ignores an input field it does
not recognise rather than rejecting it** — so sending `max_tokens` to a model that reads
`max_completion_tokens` silently removes the output cap on a per-token bill. The field name
and the ceiling therefore travel with the model in the `MODELS` table, `modelInput()` is the
only place that writes either, and `tests/ai-worker.test.mjs` asserts both that the right
field is sent and that the others are absent. GPT-OSS also answers in the Responses shape
rather than chat completions, and its ceiling counts the reasoning it does before the answer
begins, which is why it is 2,400 rather than 900.

The daily spend ceiling (`DAILY_AI_CALL_BUDGET`) needs the `AI_BUDGET` Durable Object
binding, which `wrangler.jsonc` documents but does not declare. It is only worth adding on
a Workers Paid plan, where overage is billable; on Workers Free the allocation is a hard
stop and requests simply fail, so a ceiling would add nothing but a nicer error message.

Tutor and document prompts are sent to the same-origin `/api/ai` route, which calls the selected model through the server-side Cloudflare AI binding. No model files are downloaded to the browser and no additional provider key is exposed there. A random local client identifier and Cloudflare-provided network address support short abuse limits; shared capacity and provider availability still apply. Image prompts use the named Pollinations image service. Voice preview and music synthesis appear only when the browser supports the necessary capability, and their final output is made in the browser. Generated images, documents and music files remain downloadable where the browser supports the format. Do not enter personal, confidential or high-stakes information into a cloud service, and verify all generated work before using it.

The homepage calls `/api/visitors` only to show a best-effort monthly browser check-in total. A first-party, HTTP-only cookie stores the current India calendar month so the same browser is usually counted once. The Durable Object stores only the total and its start time; it does not store per-visitor identifiers.

The studio also provides ordinary external links to [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models) and [Qwen Chat](https://chat.qwen.ai/). These open the providers' own websites, where their current login, pricing, privacy and usage terms apply.

## Accessibility and privacy

The interface is keyboard navigable, responsive, reduced-motion aware and designed with visible focus and strong contrast. Saved resources, preferences and recent activity stay in browser storage. Choosing हिन्दी uses the browser's on-device Translator API where supported. Otherwise, loaded translatable English interface text—including page copy, accessible labels, titles and placeholders—goes in limited batches to Pigsfield's same-origin `/api/translate` route and Cloudflare-hosted AI4Bharat IndicTrans2; text typed by the visitor is never included. That fallback is rate-limited, uses a no-referrer request, needs no visitor account or provider key, and sends neither the page URL nor text to Google Translate. Browser-menu guidance appears only if both paths fail. See the in-site Accessibility and Privacy pages for the full plain-language policy.

## Support and corrections

- Donate by UPI: `zeroisinf@ibl`
- Feedback, corrections and volunteering: `zeroisinf@gmail.com`

Pigsfield is volunteer-led. Growth should come from usefulness, trustworthy sources, accessibility and community correction—not inflated claims or search-engine tricks.
