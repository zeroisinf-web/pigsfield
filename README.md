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
- An always-available, no-key AI Studio for answers, images, documents, browser voice previews, caption videos and browser-made music
- Browser-powered, in-page Hindi translation where supported, light/dark themes, search, saved resources and native original-source links
- Persistent AI Studio, Donate and Feedback controls
- A responsive depth-and-motion layer with a reduced-motion-safe flat mode
- About, editorial policy, accessibility, privacy and contribution pages

The catalog is **free-first**, not a promise that every third-party resource is free forever. Always check the provider's current price, terms and eligibility.

## Run locally

This is a dependency-free static site. Serve the repository root instead of opening files directly so service workers and embeds behave as they will in production:

```bash
python -m http.server 8741
```

Then open `http://localhost:8741`.

Run the repository checks with:

```bash
npm run build
npm test
```

## Deploy on GitHub Pages

1. Push this folder to the repository's `main` branch.
2. In GitHub, open **Settings → Pages**.
3. Select **GitHub Actions** as the source. The included workflow validates and publishes the site.
4. For the custom domain, enter `pigsfield.com`. The included `CNAME` file already matches it.

The site uses relative asset paths, so it also works in a project-page subdirectory. Canonical and social metadata intentionally point to the production domain.

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

Pigsfield does not ask for or store an API key. The studio loads only when its persistent dock button is opened and offers exactly three selectable text models under their original names:

- `gpt-oss-20b` â€” cloud inference through Pollinations' `openai-fast` route, with no login or visitor-supplied key. Prompts leave the device and provider availability, retention and rate limits apply.
- `Qwen3.5-2B-q4f16_1-MLC` â€” on-device inference through WebLLM and WebGPU. First use downloads about 1.1 GB of model data and needs about 2.3 GB of GPU memory.
- `DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC` â€” on-device inference through WebLLM and WebGPU. First use downloads about 4.3 GB of model data and needs about 5.2 GB of GPU memory.

Local choices are unavailable when the browser or device does not support WebGPU; the studio does not silently substitute another model. Their model files come from the WebLLM/MLC distribution path, while prompts and generated text are processed on the device. Image prompts still use the named Pollinations image service. Voice preview, music synthesis and final document or caption-video assembly use browser capabilities, although any text or storyboard request follows the selected text model's cloud-or-device boundary. Do not enter personal, confidential or high-stakes information into a cloud model, and verify all generated work before using it.

## Accessibility and privacy

The interface is keyboard navigable, responsive, reduced-motion aware and designed with visible focus and strong contrast. Saved resources, preferences and recent activity stay in browser storage. External providers receive data only when a visitor opens their link or starts a relevant feature. Choosing हिन्दी uses the browser's on-device Translator API when it is available; the browser may download a language model, but Pigsfield does not redirect the page or send its URL to Google Translate. Unsupported browsers show instructions for using their own Translate-page menu. See the in-site Accessibility and Privacy pages for the full plain-language policy.

## Support and corrections

- Donate by UPI: `zeroisinf@ibl`
- Feedback, corrections and volunteering: `zeroisinf@gmail.com`

Pigsfield is volunteer-led. Growth should come from usefulness, trustworthy sources, accessibility and community correction—not inflated claims or search-engine tricks.
