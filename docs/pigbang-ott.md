# PigBang Educational OTT

PigBang is rebuilt at `/watch/`, with complete Movies & Shows (`/watch/films/`), Games & Apps (`/watch/apps/`), and Channels (`/watch/channels/`) pages. It uses the supplied educational workbook as its catalog, rather than the smaller legacy Pigsfield resource list.

## Content and behavior

The source contains 2,175 records: 1,697 movies/shows, 269 apps/platforms and 209 channels, with 380 subject taxonomy rows. Every record retains its source sheet and row in `js/data/pigbang-catalog.json`. The original workbook is unchanged and is not committed to the repository.

Search composes with class, subject and free/paid filters. URLs preserve filters. My list is stored only in the current browser, without login. Detail dialogs have direct share links, original provider actions, related titles, keyboard focus handling and click-to-play privacy-enhanced YouTube embeds. Modified link clicks keep native browser behavior. No video loads before a play action.

The source gives no prices for apps. These remain “Check provider.” Classes describe curriculum relevance, not age ratings. Search-result destinations are labeled “Find on provider,” never full-film playback. Providers may restrict availability by region or subscription.

## Media coverage

`js/data/pigbang-media.json` is the separately reviewed enrichment layer. It records promotional media sources, publishers, verification dates, a TED-Ed link correction, 11 verified trailer/preview URLs and local artwork for 24 titles/platforms/channels. Local images are optimized WebP files. The existing bounded, cached `/api/poster?u=` Worker retrieves real provider artwork for the rest of the catalog when cards enter view. If a provider blocks metadata access or publishes no image, the card keeps a readable title fallback.

The workbook omits watch links for 537 films. Three of those have reviewed direct trailers in the enrichment layer. The other 534 provide explicitly labeled YouTube trailer searches. Those search links are discovery fallbacks and are not claimed to be verified trailers or full films. The remaining supplied provider links are preserved as catalog data; this change does not verify every provider's current regional availability.

## SEO

All 2,175 titles and descriptions appear in crawlable category HTML, including without JavaScript. The landing page links to the complete category directories instead of repeating the full catalog. Each route has distinct titles/descriptions, canonical URLs, Open Graph/Twitter previews, CollectionPage/ItemList and breadcrumb structured data. The sitemap records the actual update date. No invented ratings, ownership claims or ranking guarantees are added.

## Maintaining the catalog

From the repository root, with Python and `openpyxl` installed:

```text
python tools/import-pigbang.py "path/to/PigBang_Educational_Master.xlsx"
```

Review separately verified media entries before refreshing them. To fetch the editorial artwork selection again, then optimize it (Python with Pillow):

```text
node tools/fetch-pigbang-media.mjs
python tools/optimize-pigbang-media.py
python tools/build-pigbang-social.py
```

The social-card helper currently uses Windows Arial fonts. Use equivalent Arial font paths on another OS. It writes only the four PigBang social previews; the wider site's social-card generator remains available.

After source or media changes:

```text
npm run build:watch
npm run build:sitemap
npm run build:assets
npm run build:sw
npm run build
npm test
```

The older `js/data/pigbang.js` remains for other Pigsfield resource surfaces; the rebuilt OTT uses the new workbook catalog. Generated pages are committed because the existing Cloudflare deployment serves the repository directly. A pull request does not deploy to production; the repository's existing main-branch deployment runs after merge.
