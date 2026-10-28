export const categories = [
  { id: 'movies', slug: 'films', label: 'Movies & shows' },
  { id: 'apps', slug: 'apps', label: 'Games & apps' },
  { id: 'channels', slug: 'channels', label: 'Channels' }
];
export const levels = ['0-5','6-8','9-12','Graduation (UG)','PG','PhD','Vocational & Skills','Teacher Training'];
export const classLabel = value => ({'0-5':'Nursery–Class 5','6-8':'Class 6–8','9-12':'Class 9–12','Graduation (UG)':'Undergraduate','PG':'Postgraduate','PhD':'PhD & research'}[value] || value);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function videoId(value) {
  try { const u = new URL(value); const h = u.hostname.replace(/^(?:www|m)\./,''); if(u.protocol!=='https:'||u.username||u.password||u.port)return ''; let id = '';
    if (h === 'youtu.be') id = u.pathname.slice(1);
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') id = (u.pathname==='/watch' ? u.searchParams.get('v') : '') || u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    return /^[\w-]{11}$/.test(id || '') ? id : '';
  } catch { return ''; }
}
export function isSearch(value) { try { const u = new URL(value); return /\/(?:results|search)(?:\/|$)/.test(u.pathname) || u.searchParams.has('search_query'); } catch { return false; } }
export function enrich(items, media = {}) {
  return items.map(item => {
    const m = media[item.title] || {};
    const watchUrl = safeUrl(m.watchUrl || item.watchUrl);
    const trailerUrl = safeUrl(m.trailerUrl || item.trailerUrl);
    const sourceUrl = safeUrl(m.watchUrl ? m.watchUrl : item.sourceUrl);
    const posterSource = trailerUrl || (watchUrl && !isSearch(watchUrl) ? watchUrl : sourceUrl);
    const image = typeof m.image === 'string' && m.image.startsWith('/') && !m.image.startsWith('//') ? m.image : posterSource?.startsWith('https:') ? `/api/poster?u=${encodeURIComponent(posterSource)}` : '';
    return {...item, watchUrl, sourceUrl, trailerUrl, trailerLabel:m.trailerLabel || 'Watch trailer', image, backdrop: typeof m.backdrop === 'string' && m.backdrop.startsWith('/') && !m.backdrop.startsWith('//') ? m.backdrop : image,
      trailerSearch: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${item.title} ${item.year || ''} official trailer`)}`,
      haystack: [item.title,item.description,...item.subjects,...item.topics].join(' ').toLocaleLowerCase()};
  });
}
export function filterItems(items, state) {
  const terms = (state.q || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(x => (!state.category || x.category === state.category) && (!state.class || x.classes.includes(state.class)) &&
    (!state.subject || x.subjects.includes(state.subject) || x.disciplines.includes(state.subject)) && (!state.access || x.access === state.access) &&
    (!state.saved || state.savedIds?.has(x.id)) && terms.every(t => x.haystack.includes(t)));
}
export const accessLabel = item => item.access === 'free' ? 'Free' : item.access === 'paid' ? 'Paid' : 'Check provider';
export function action(item) {
  if (item.watchUrl) return {url:item.watchUrl, label:isSearch(item.watchUrl) ? 'Find on provider' : item.category === 'apps' ? 'Open app' : item.category === 'channels' ? 'Visit channel' : videoId(item.watchUrl) ? 'Watch now' : 'Watch on provider', kind:!isSearch(item.watchUrl) && videoId(item.watchUrl) ? 'video' : 'external'};
  return item.trailerUrl ? {url:item.trailerUrl,label:item.trailerLabel || 'Watch trailer',kind:'trailer'} : {url:item.trailerSearch,label:'Find trailer on YouTube',kind:'search'};
}
export const titleHref = item => `/watch/${categories.find(c=>c.id===item.category).slug}/#${item.slug}`;
export function card(item, eager = false) {
  return `<article class="title-card"><a class="cover-link" href="${titleHref(item)}" data-detail="${esc(item.id)}" aria-label="Explore ${esc(item.title)}"><div class="cover"><span class="cover-fallback" aria-hidden="true">${esc(item.title)}</span>${item.image ? `<img src="${esc(item.image)}" alt="" width="480" height="270" loading="${eager?'eager':'lazy'}" decoding="async">` : ''}<span class="price-tag ${item.access}">${accessLabel(item)}</span><span class="play-mark" aria-hidden="true">▶</span></div><h3>${esc(item.title)}</h3><p>${esc([item.year,item.format,item.disciplines[0]].filter(Boolean).join(' · '))}</p></a></article>`;
}
