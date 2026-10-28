# Catalog import notes

Read-only extraction from `PigBang_Educational_Master.xlsx`. Source workbook was not modified.

- Content records: 2,175; Movies & Shows: 1,697; Apps & Platforms: 269; Channels: 209.
- Subject Tags taxonomy: 380 rows.
- Movie/show records with no watch URL: 537.
- Records whose action URL is a search result, not a direct content URL: 76.
- Workbook has no thumbnail or trailer column. These require external enrichment.
- Apps & Platforms has no access/pricing column; all 269 apps correctly have unknown access.
- Access values by category: {"movies": {"Not specified": 537, "Paid": 632, "Free": 439, "Paid (rent/buy)": 89}, "apps": {"Not specified": 269}, "channels": {"Free": 207, "Paid": 1, "Not specified": 1}}.

## Schema

Top-level object has `items`, `subjectTags`, `metadata`. All 2,175 content rows are included in original worksheet order. Item IDs use category + original row minus one, with a matching unique title slug. The `source` object stores exact sheet and Excel row.

Item fields: `id`, `slug`, `title`, `year` (source string or null), `format`, `category` (`movies`, `apps`, `channels`), `origin`, `subjects` (full original tags), `disciplines` (prefixes before colon), `classes` (original labels), `description`, `topics`, `rating` (IMDb value or null), `inclusionReason`, `sourceUrl`, `watchUrl`, `watchLinkKind`, `access` (`free`, `paid`, `unknown`), `accessLabel` (original wording), `thumbnail` (null pending enrichment), `trailerUrl` (null pending enrichment), and `source`.

`sourceUrl` is the workbook Link. For movies it usually points to IMDb and is not a stream. `watchUrl` uses the Watch link column for movies; apps/channels use their supplied Link. `watchLinkKind` differentiates `search`, `youtube-video`, `youtube-channel`, `provider`, and null. Paid rent/buy stays classified paid but preserves its label. Missing access is never inferred free.

Class labels are curriculum suitability, not certification or age ratings. Preserve `0-5` as a class grouping instead of claiming an age. Search links and provider links need action labels that reflect their destination. No file content was followed as instructions.
