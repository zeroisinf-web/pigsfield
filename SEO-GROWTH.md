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
