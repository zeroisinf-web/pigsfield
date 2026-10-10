# Pigsfield SEO growth runbook

Technical SEO makes Pigsfield crawlable and understandable; it cannot guarantee a ranking position. Search visibility must be earned with useful original work, expert review, trustworthy citations, real recommendations and consistently good page experience.

## Complete after every production deployment

1. Confirm these return `200` over HTTPS:
   - `https://pigsfield.com/robots.txt`
   - `https://pigsfield.com/sitemap.xml`
   - every canonical URL listed in the sitemap
2. Configure Cloudflare to redirect HTTP to HTTPS. If a `www` hostname is added, redirect it permanently to the canonical apex domain instead of serving a second copy.
3. Verify the domain in [Google Search Console](https://search.google.com/search-console/about), submit `https://pigsfield.com/sitemap.xml`, and inspect the home, Learn, Skills, Tools, Exams, PigBang and Government Accountability URLs.
4. Add the site to [Bing Webmaster Tools](https://www.bing.com/webmasters/about), then submit the same sitemap.
5. Check the rendered HTML, indexing status and Core Web Vitals after Google has recrawled the release. Fix errors; do not repeatedly request indexing for unchanged pages.

## Off-site steps the code cannot do

1. In Cloudflare, redirect `www` to the apex with a 301, turn on Crawler Hints, and leave AI search and AI training crawlers allowed. `npm run check:production` fails if the live robots.txt disallows the whole site for a search engine.
2. In Search Console, submit the sitemap again after this release and inspect `/exams/upsc/`, `/watch/channels/` and `/hi/rights/information-and-records/`. In Bing Webmaster Tools, import the site from Search Console and watch its AI Performance report. Bing also receives changed URLs automatically through IndexNow after every deploy (`tools/indexnow.mjs`).
3. After four to six weeks, check Search Console's page indexing report for "Duplicate, Google chose different canonical" on the `/hi/rights/` pairs. If Google folds them together, give the English pages an English summary of each practical guide so the two versions differ in more than their framing.
4. Set the GitHub repository's homepage to `https://pigsfield.com/`, make every social profile link back to the site under the same name, and publish `@pigsfield` YouTube playlists that mirror the UPSC, NCERT roadmap and Class 9 to 12 pages, each description linking to its page.
5. Decide on privacy-respecting measurement (cookieless Cloudflare Web Analytics, or an aggregate-only counter behind `/api/`) before judging which new pages to build next; it needs a privacy-page and CSP update. Once a month, ask ChatGPT, Perplexity, Gemini and Copilot the same twenty questions Pigsfield answers and record whether it is cited.
6. Watch for DMCA notices in Search Console's Removals report and on Lumen. The films list publishes every PigBang film, including a few uploads on Dailymotion and Internet Archive; remove any entry that receives a valid notice.

## Build authority without search spam

- Publish original, first-hand guides within Pigsfield's six existing pillars. Each guide should answer one real learner or citizen task completely, name its author or reviewer, explain how sources were checked and link to primary evidence.
- Add `last checked` data to resources when a human actually verifies availability, price, ownership and usefulness. Never change dates merely to appear fresh.
- Invite schools, universities, libraries, educators, public-interest organizations and subject experts to review relevant paths. Earn links because the path is useful; never buy, exchange or automate backlinks.
- Turn recurring feedback into corrections and original analysis. A smaller set of trustworthy, maintained pages is better than mass-produced keyword pages.
- Keep high-impact civic, legal, financial, health and exam information attached to official sources and visible disclaimers.

## Highest-impact content milestones

1. Build a central provider registry with a stable provider ID, official-source URL, language, cost, sign-in requirement, licence, reviewer and genuine `last checked` date. Use it everywhere the same organization appears.
2. Replace YouTube search-result links with specific, human-reviewed videos or playlists. Search pages change and do not prove that an individual resource was reviewed.
3. Publish a limited first set of substantial, static pathway pages for the most useful stages and tasks. Give each one a real URL, original explanation, author or reviewer, breadcrumbs and related pathways. Do not generate one thin page per catalog card.
4. Add qualified review and primary citations to government-accountability, legal, health, finance and exam guidance before expanding those sections.
5. Create true `/hi/` pages for the highest-value pathways when they can be professionally reviewed. Browser translation helps visitors but does not create indexable Hindi pages; use reciprocal `en-IN`, `hi-IN` and `x-default` links only when both pages exist.
6. Keep PigBang pagination crawlable when it gains standalone media pages. A crawler must be able to reach every page through ordinary `<a href>` links without pressing “Load more”.

## Measure outcomes

Review monthly:

- indexed canonical pages and crawl errors;
- non-branded search impressions, clicks and queries by landing page;
- click-through rate after title or description improvements;
- Core Web Vitals at the 75th percentile: LCP, INP and CLS;
- broken-source reports, correction time and resources with a real verification date;
- independent references and links from relevant trusted organizations.

Do not use keyword stuffing, hidden content, doorway pages, fabricated reviews, fake structured data or unsupported "best in the world" claims. Follow Google's [people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) and [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).
