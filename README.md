# Pigsfield

**Education within reach. Skills for opportunity. Government made accountable.**

Pigsfield is a free-first learning map for India. It organizes educational, skill-building, exam, media, digital-tool and public-accountability resources into clear paths while sending people directly to the original provider.

## What is included

- Nursery-to-PhD learning paths
- Teacher training, vocational and practical skills
- Useful digital tools with direct tutorials
- Competitive-exam roadmaps, mock tests and subject collections
- PigBang educational media with lazy, privacy-enhanced YouTube playback
- Expandable RTI, grievance, legal-aid and government-accountability categories
- An always-available AI Studio with no visitor login or model download for answers, images, documents, browser voice previews, caption videos and browser-made music
- Browser-powered, in-page Hindi translation where supported, light/dark themes, search, saved resources and native original-source links
- Persistent AI Studio, Donate and Feedback controls
- A responsive depth-and-motion layer with a reduced-motion-safe flat mode
- About, editorial policy, accessibility, privacy and contribution pages

The catalog is **free-first**, not a promise that every third-party resource is free forever. Always check the provider's current price, terms and eligibility.

## Run locally

The interface is dependency-free. Serve the repository root instead of opening files directly so service workers and embeds behave as they will in production:

```bash
python -m http.server 8741
```

Then open `http://localhost:8741`.

This static preview does not provide `/api/ai`; hosted text generation needs the deployed Cloudflare Worker and its `AI` binding.

Run the repository checks with:

```bash
npm run build
npm test
```

## Deploy from GitHub with Cloudflare Workers

1. Push this folder to the repository's `main` branch.
2. Connect the repository to a Cloudflare Workers Builds project and use the included `wrangler.jsonc` configuration.
3. Deploy the repository root. Cloudflare publishes the static assets and runs `worker/index.mjs` before `/api/*` requests.
4. Keep the Workers AI binding named `AI` and the rate-limit binding named `AI_RATE_LIMITER`; the browser-facing endpoint is the same-origin `/api/ai` route.

The static interface uses relative asset paths, but hosted text generation requires the Cloudflare Worker and its bindings. Canonical and social metadata intentionally point to the production domain.

## Edit resources

The live catalog is in `js/data/`:

- `school.js` — learning stages
- `teach.js` — teacher training and skills
- `tools.js` — digital tools
- `exams.js` — competitive-exam paths
- `pigbang.js` — educational media
- `govt.js` — citizen rights and accountability

Keep each link pointed at the original, lawful provider. Add a clear description, accurate price label and the most specific source URL available. The browser creates the cards, varied visual symbols, filters and source links from these data files. Every provider control is a genuine anchor, so desktop right-click and mobile press-and-hold expose the browser's normal open-in-new-tab and copy-link actions for that exact original URL.

## YouTube embeds and error 153

Playback starts only after the visitor presses Play. The player uses YouTube's privacy-enhanced domain, sends a strict-origin referrer, supports video and playlist URLs, and always keeps an original-source fallback. Do not change the site referrer policy to `no-referrer`; YouTube needs site identity for embedded playback. Videos whose owners disable embedding must still open on their original YouTube page.

## AI Studio boundaries

Pigsfield does not ask visitors for an account or API key. The studio loads only when its persistent dock button is opened and offers exactly three selectable hosted reasoning models under their original names:

- `gpt-oss-120b` — OpenAI's open-weight reasoning model through Cloudflare Workers AI.
- `gemma-4-26b-a4b-it` — Google's Gemma instruction model through Cloudflare Workers AI.
- `glm-4.7-flash` — Z.ai's reasoning model through Cloudflare Workers AI.

Text prompts are sent to the same-origin `/api/ai` route, which calls the selected model through a server-side Cloudflare Workers AI binding. No model files are downloaded to the browser and no provider credential is exposed there. A random local client identifier supports the short per-visitor rate limit; shared free capacity and provider availability still apply. Image prompts use the named Pollinations image service. Voice preview, music synthesis and final document or caption-video assembly use browser capabilities, while text and storyboard requests use the selected hosted model. Generated images, documents, caption videos, storyboards and music files remain downloadable where the browser supports the format. Do not enter personal, confidential or high-stakes information into a cloud service, and verify all generated work before using it.

## Accessibility and privacy

The interface is keyboard navigable, responsive, reduced-motion aware and designed with visible focus and strong contrast. Saved resources, preferences and recent activity stay in browser storage. External providers receive data only when a visitor opens their link or starts a relevant feature. Choosing हिन्दी uses the browser's on-device Translator API when it is available; the browser may download a language model, but Pigsfield does not redirect the page or send its URL to Google Translate. Unsupported browsers show instructions for using their own Translate-page menu. See the in-site Accessibility and Privacy pages for the full plain-language policy.

## Support and corrections

- Donate by UPI: `zeroisinf@ibl`
- Feedback, corrections and volunteering: `zeroisinf@gmail.com`

Pigsfield is volunteer-led. Growth should come from usefulness, trustworthy sources, accessibility and community correction—not inflated claims or search-engine tricks.
