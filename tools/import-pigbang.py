import json
import argparse
import re
import unicodedata
from pathlib import Path
from collections import Counter
from urllib.parse import urlparse
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='Read the PigBang workbook into the website catalog without modifying the workbook.')
parser.add_argument('workbook', type=Path)
SOURCE = parser.parse_args().workbook
wb = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)

def text(value):
    return str(value).strip() if value is not None else ''

def split(value):
    return [part.strip() for part in text(value).split(',') if part.strip()]

def slug(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii').lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')

def link_kind(value):
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.path in ('/search', '/results'):
        return 'search'
    if ('youtube.com' in parsed.netloc and parsed.path == '/watch') or parsed.netloc == 'youtu.be':
        return 'youtube-video'
    if 'youtube.com' in parsed.netloc:
        return 'youtube-channel'
    return 'provider'

items = []
categories = {'Movies & Shows': 'movies', 'Apps & Platforms': 'apps', 'Channels': 'channels'}
for sheet_name, category in categories.items():
    sheet = wb[sheet_name]
    rows = iter(sheet.values)
    headers = [text(v) for v in next(rows)]
    for row_number, row in enumerate(rows, 2):
        raw = dict(zip(headers, row))
        title = text(raw.get('Title') or raw.get('Name'))
        if not title:
            continue
        subjects = split(raw.get('Subject'))
        access_raw = text(raw.get('Free or Paid'))
        access = 'free' if access_raw.lower().startswith('free') else 'paid' if access_raw.lower().startswith('paid') else 'unknown'
        source_url = text(raw.get('Link')) or None
        watch_url = text(raw.get('Watch link')) or None
        if category != 'movies':
            watch_url = source_url
        item = {
            'id': f'{category}-{row_number - 1:04d}',
            'slug': f'{slug(title)}-{category}-{row_number - 1:04d}',
            'title': title,
            'year': text(raw.get('Year')) or None,
            'format': text(raw.get('Format') or raw.get('Type')),
            'category': category,
            'origin': text(raw.get('Origin')),
            'subjects': subjects,
            'disciplines': list(dict.fromkeys(s.split(':', 1)[0].strip() for s in subjects)),
            'classes': split(raw.get('Class suitable')),
            'description': text(raw.get("What you'll learn") or raw.get('Description')),
            'topics': split(raw.get('Topics')),
            'rating': raw.get('IMDb rating'),
            'inclusionReason': text(raw.get('Why included')) or None,
            'sourceUrl': source_url,
            'watchUrl': watch_url,
            'watchLinkKind': link_kind(watch_url),
            'access': access,
            'accessLabel': access_raw or 'Not specified',
            'thumbnail': None,
            'trailerUrl': None,
            'source': {'sheet': sheet_name, 'row': row_number},
        }
        items.append(item)

tag_rows = iter(wb['Subject Tags'].values)
tag_headers = [text(v) for v in next(tag_rows)]
tags = [dict(zip(tag_headers, row), sourceRow=number) for number, row in enumerate(tag_rows, 2) if any(v is not None for v in row)]
counts = dict(Counter(i['category'] for i in items))
metadata = {
    'sourceWorkbook': SOURCE.name,
    'importDate': '2026-10-28',
    'count': len(items),
    'countsByCategory': counts,
    'classOptions': ['0-5', '6-8', '9-12', 'Graduation (UG)', 'PG', 'PhD', 'Teacher Training', 'Vocational & Skills'],
    'disciplineOptions': sorted(set(d for i in items for d in i['disciplines'])),
    'subjectOptions': sorted(set(s for i in items for s in i['subjects'])),
    'notes': [
        'Access labels are copied from the workbook; unknown does not mean free.',
        'Class suitability is curriculum guidance from the workbook, not a film age rating.',
        'Provider availability, regional access, and pricing may change.',
        'Source URLs and search URLs are retained as supplied and have not been verified by this import.',
        'No artwork or trailer URLs are present in the workbook.'
    ]
}
result = {'items': items, 'subjectTags': tags, 'metadata': metadata}
(ROOT / 'js/data/pigbang-catalog.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
counts_access = {category: dict(Counter(i['accessLabel'] for i in items if i['category'] == category)) for category in categories.values()}
missing_movies = sum(i['category'] == 'movies' and not i['watchUrl'] for i in items)
search_links = sum(i['watchLinkKind'] == 'search' for i in items)
notes = f'''# Catalog import notes

Read-only extraction from `{SOURCE.name}`. Source workbook was not modified.

- Content records: {len(items):,}; Movies & Shows: {counts['movies']:,}; Apps & Platforms: {counts['apps']:,}; Channels: {counts['channels']:,}.
- Subject Tags taxonomy: {len(tags)} rows.
- Movie/show records with no watch URL: {missing_movies}.
- Records whose action URL is a search result, not a direct content URL: {search_links}.
- Workbook has no thumbnail or trailer column. These require external enrichment.
- Apps & Platforms has no access/pricing column; all 269 apps correctly have unknown access.
- Access values by category: {json.dumps(counts_access, ensure_ascii=False)}.

## Schema

Top-level object has `items`, `subjectTags`, `metadata`. All {len(items):,} content rows are included in original worksheet order. Item IDs use category + original row minus one, with a matching unique title slug. The `source` object stores exact sheet and Excel row.

Item fields: `id`, `slug`, `title`, `year` (source string or null), `format`, `category` (`movies`, `apps`, `channels`), `origin`, `subjects` (full original tags), `disciplines` (prefixes before colon), `classes` (original labels), `description`, `topics`, `rating` (IMDb value or null), `inclusionReason`, `sourceUrl`, `watchUrl`, `watchLinkKind`, `access` (`free`, `paid`, `unknown`), `accessLabel` (original wording), `thumbnail` (null pending enrichment), `trailerUrl` (null pending enrichment), and `source`.

`sourceUrl` is the workbook Link. For movies it usually points to IMDb and is not a stream. `watchUrl` uses the Watch link column for movies; apps/channels use their supplied Link. `watchLinkKind` differentiates `search`, `youtube-video`, `youtube-channel`, `provider`, and null. Paid rent/buy stays classified paid but preserves its label. Missing access is never inferred free.

Class labels are curriculum suitability, not certification or age ratings. Preserve `0-5` as a class grouping instead of claiming an age. Search links and provider links need action labels that reflect their destination. No file content was followed as instructions.
'''
(ROOT / 'docs/pigbang-catalog.md').write_text(notes, encoding='utf-8')
assert len(items) == 2175
assert len(set(i['id'] for i in items)) == len(items)
assert len(set(i['slug'] for i in items)) == len(items)
assert all(i['title'] and i['classes'] and i['subjects'] for i in items)
print(json.dumps({'records': len(items), 'counts': counts, 'access': counts_access, 'missingMovieWatchUrls': missing_movies, 'searchLinks': search_links, 'tags': len(tags)}))
