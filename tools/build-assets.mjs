// Give every directly loaded script and stylesheet a content version, so new HTML
// cannot pick up old HTTP or service-worker cache entries after a deployment.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
let changed = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const source = fs.readFileSync(file, 'utf8');
    const next = source.replace(/\b(href|src)="([^"?:]+\.(?:css|js))(?:\?v=[a-f0-9]+)?"/g, (match, attribute, asset) => {
      const target = path.resolve(directory, asset);
      if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) return match;
      const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0, 12);
      return `${attribute}="${asset}?v=${hash}"`;
    });
    if (next !== source) {
      changed++;
      if (!check) fs.writeFileSync(file, next);
    }
  }
}
visit(root);
if (check && changed) { console.error(`${changed} pages need asset versions. Run npm run build:assets before build:sw.`); process.exitCode = 1; }
else console.log(check ? 'All page asset versions are current.' : `Versioned assets in ${changed} pages.`);
