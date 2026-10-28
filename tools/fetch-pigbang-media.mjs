// Explicitly reviewed promotional media. Never infer a video ID from a title search.
// Run from repository root: node tools/fetch-pigbang-media.mjs
// This refreshes only the small editorial selection, not the entire provider catalog.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePoster } from '../worker/poster.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = [
  ['Our Planet', 'our-planet', 'aETNYyrqNYE', 'Netflix'],
  ['Planet Earth II', 'planet-earth-ii', 'c8aFcHFu8QM', 'BBC Earth'],
  ['The Social Dilemma', 'the-social-dilemma', 'uaaC57tcci0', 'Netflix'],
  ['Hidden Figures', 'hidden-figures', '5wfrDhgUMGI', '20th Century Studios'],
  ['Life on Our Planet', 'life-on-our-planet', 'xy1v0pzMP4g', 'Netflix'],
  ['WALL·E', 'wall-e', '81nYibxXWCo', 'Disney IT'],
  ['The Biggest Little Farm', 'the-biggest-little-farm', 'UfDTM4JxHl8', 'NEON'],
  ['Honeyland', 'honeyland', 'B27ORUHlp6E', 'NEON'],
  ['Fantastic Fungi', 'fantastic-fungi', 'bxABOiay6oA', 'Moving Art'],
  ['David Attenborough: A Life on Our Planet', 'a-life-on-our-planet', '64R2MYUt394', 'Netflix'],
  ['Cosmos: A Spacetime Odyssey', 'cosmos-a-spacetime-odyssey', 'Fm4UV5_HsPA', 'National Geographic'],
];

const mapPath = path.join(root, 'js/data/pigbang-media.json');
const output = JSON.parse(await fs.readFile(mapPath, 'utf8').catch(() => '{}'));
const refresh = process.argv.includes('--refresh');
delete output['Cosmos: Possible Worlds']; // Retired trailer no longer resolves.
await fs.mkdir(path.join(root, 'assets/pigbang'), { recursive: true });
for (const [title, slug, id, publisher] of entries) {
  if (!refresh && output[title]?.image?.startsWith('/assets/')) continue;
  const trailerUrl = `https://www.youtube.com/watch?v=${id}`;
  let thumbnailUrl = '';
  let saved = false;
  for (const size of ['maxresdefault', 'hqdefault']) {
    const candidate = `https://i.ytimg.com/vi/${id}/${size}.jpg`;
    try {
      const response = await fetch(candidate, { signal: AbortSignal.timeout(12000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 3000) continue;
      await fs.writeFile(path.join(root, `assets/pigbang/${slug}.jpg`), bytes);
      thumbnailUrl = candidate;
      saved = true;
      break;
    } catch (error) { console.error(`${title}: ${error.message}`); }
  }
  output[title] = {
    trailerUrl,
    trailerLabel: title === 'Cosmos: A Spacetime Odyssey' ? 'Watch preview' : 'Watch trailer',
    image: saved ? `/assets/pigbang/${slug}.jpg` : `/api/poster?u=${encodeURIComponent(trailerUrl)}`,
    backdrop: saved ? `/assets/pigbang/${slug}.jpg` : `/api/poster?u=${encodeURIComponent(trailerUrl)}`,
    sourceUrl: trailerUrl,
    thumbnailUrl,
    publisher,
    verifiedAt: '2026-10-28',
    mediaKind: 'Official promotional trailer thumbnail'
  };
  console.log(`${saved ? 'Saved' : 'Remote fallback'}: ${title}`);
}

// Workbook correction: the TED-Ed row linked to The Economist. Keep the original
// spreadsheet URL in catalog provenance and use this separately attributed correction.
output['TED-Ed'] = {
  ...output['TED-Ed'],
  watchUrl: 'https://www.youtube.com/@TEDEd/playlists',
  sourceUrl: 'https://blog.ted.com/teachers-animators-learners-ted-ed-wants-you/',
  publisher: 'TED',
  verifiedAt: '2026-10-28',
  correction: 'The source workbook incorrectly linked TED-Ed to The Economist channel.'
};

// Real publisher artwork for the other two sections. The same resolver serves the
// remaining catalog lazily at /api/poster; these selected images are stored locally
// for a fast initial page and for static preview without an edge worker.
const providers = [
  ['Civilization VI', 'civilization-vi', 'https://store.steampowered.com/app/289070'],
  ['Crusader Kings III', 'crusader-kings-iii', 'https://store.steampowered.com/app/1158310'],
  ['Democracy 4', 'democracy-4', 'https://store.steampowered.com/app/1410890'],
  ['Papers Please', 'papers-please', 'https://store.steampowered.com/app/239030'],
  ['Khan Academy', 'khan-academy', 'https://www.youtube.com/watch?v=JC82Il2cjqA'],
  ['Scratch', 'scratch', 'https://scratch.mit.edu/'],
  ['Khan Academy Kids', 'khan-academy-kids', 'https://www.youtube.com/watch?v=c9WZchczdXY'],
  ['Duolingo', 'duolingo', 'https://www.duolingo.com/'],
  ['GeoGebra', 'geogebra', 'https://www.geogebra.org/'],
  ['Minecraft: Education Ed.', 'minecraft-education', 'https://education.minecraft.net'],
  ['TED-Ed', 'ted-ed', 'https://ed.ted.com/'],
  ['Kurzgesagt – In a Nutshell', 'kurzgesagt', 'https://kurzgesagt.org/'],
  ['Veritasium', 'veritasium', 'https://www.youtube.com/watch?v=5THOUSvpCKk'],
  ['3Blue1Brown', '3blue1brown', 'https://www.3blue1brown.com/'],
  ['Crash Course Physics', 'crash-course-physics', 'https://thecrashcourse.com/topic/physics/'],
  ['National Geographic', 'national-geographic', 'https://www.youtube.com/@NatGeo/playlists'],
];
for (const [title, slug, sourceUrl] of providers) {
  if (!refresh && output[title]?.image?.startsWith('/assets/')) continue;
  const url = new URL(`https://pigsfield.com/api/poster?u=${encodeURIComponent(sourceUrl)}`);
  const response = await handlePoster(new Request(url), {}, url);
  if (!response.ok) { console.log(`Provider fallback: ${title}`); continue; }
  const extension = ({'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/avif': 'avif'})[response.headers.get('content-type')];
  if (!extension) continue;
  const relative = `/assets/pigbang/${slug}.${extension}`;
  await fs.writeFile(path.join(root, relative), new Uint8Array(await response.arrayBuffer()));
  output[title] = {...output[title], image: relative, backdrop: relative, artworkSourceUrl: sourceUrl, verifiedAt: '2026-10-28', mediaKind: 'Publisher link-preview artwork'};
  console.log(`Saved provider: ${title}`);
}
await fs.writeFile(path.join(root, 'js/data/pigbang-media.json'), JSON.stringify(output, null, 2) + '\n');
