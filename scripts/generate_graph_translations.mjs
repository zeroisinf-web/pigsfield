import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import workbookData from '../src/workbookData.json' with { type: 'json' };
import { GRAPH_TRANSLATION_SEEDS } from '../src/graphTranslationSeeds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, '../src/graphTranslations.generated.js');

const WORD_OVERRIDES = new Map([
  ['AI', 'AI'],
  ['APP', 'App'],
  ['APPSHEET', 'AppSheet'],
  ['BSER', 'BSER'],
  ['CEC', 'CEC'],
  ['CX', 'CX'],
  ['DIGILOCKER', 'DigiLocker'],
  ['EVS', 'EVS'],
  ['EYANTRA.ORG', 'eYantra.org'],
  ['FOSSEE', 'FOSSEE'],
  ['FIGMA', 'Figma'],
  ['HIBP', 'HIBP'],
  ['IDE', 'IDE'],
  ['ISTEM', 'I-STEM'],
  ['ML', 'ML'],
  ['MOOCS', 'MOOCs'],
  ['NCERT', 'NCERT'],
  ['NCTE', 'NCTE'],
  ['NDL', 'NDL'],
  ['NIOS', 'NIOS'],
  ['NPTEL', 'NPTEL'],
  ['PG', 'PG'],
  ['PHD', 'PhD'],
  ['PM', 'PM'],
  ['PT', 'PT'],
  ['PDF24', 'PDF24'],
  ['RSCRT', 'RSCRT'],
  ['RTI', 'RTI'],
  ['SLM', 'SLM'],
  ['STC', 'STC'],
  ['UG', 'UG'],
  ['URL', 'URL'],
  ['VMOU', 'VMOU'],
  ['WSL', 'WSL'],
  ['YT', 'YT'],
]);

const WORKBOOK_SECTION_LABELS = {
  'N-5': 'Nursery to 5',
  '6-8': 'Class 6 to 8',
  '9-12': 'Class 9 to 12',
  UG: 'UG',
  PG: 'PG',
  PHD: 'PhD',
  TT: 'Teacher Training',
  'Voc&Skill': 'Tech & Skills',
  Universal: 'Universal',
};

const ACADEMIC_WORKBOOK_GROUPS = [
  { title: 'School', sections: ['N-5', '6-8', '9-12'] },
  { title: 'Higher Education', sections: ['UG', 'PG', 'PHD'] },
];

const VOCATIONAL_WORKBOOK_GROUPS = [
  { sheet: 'TT', title: 'Teacher Training' },
  { sheet: 'Voc&Skill', title: 'Tech & Skills' },
  { sheet: 'Universal', title: 'Universal' },
];
const HINDI_TEXT_PATTERN = /[\u0900-\u097f]/;

function cleanWorkbookText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function titleCaseWord(word) {
  if (!word) return word;
  const upper = word.toUpperCase();

  if (WORD_OVERRIDES.has(upper)) {
    return WORD_OVERRIDES.get(upper);
  }

  if (/^[A-Z0-9.-]+\.[A-Z0-9.-]+$/.test(word)) {
    return word.toLowerCase();
  }

  if (/^[A-Z0-9]+$/.test(word)) {
    return word.charAt(0) + word.slice(1).toLowerCase();
  }

  return word;
}

function prettifyLabel(label = '') {
  const cleaned = label
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .replace(/\s*\/\s*/g, ' / ')
    .trim();

  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((word) => {
      if (word.includes('-') && !word.startsWith('http')) {
        return word.split('-').map(titleCaseWord).join('-');
      }
      return titleCaseWord(word);
    })
    .join(' ')
    .replace('Ai', 'AI')
    .replace('Ml', 'ML')
    .replace('Phd', 'PhD')
    .replace('And', '&')
    .replace(/^AI ML$/, 'AI / ML');
}

function prettifyWorkbookLabel(value = '') {
  return cleanWorkbookText(value) ? prettifyLabel(cleanWorkbookText(value)) : '';
}

function shortenWorkbookGroupTitle(value = '') {
  return prettifyWorkbookLabel(
    cleanWorkbookText(value)
      .replace(/\s+\(Universal\)$/i, '')
      .replace(/\s+\((?:GOV|YT|APP)\)$/i, ''),
  );
}

function shortenCompetitionPhaseTitle(value = '') {
  return prettifyWorkbookLabel(
    cleanWorkbookText(value)
      .replace(/^PHASE\s+\d+\s+—\s*/i, '')
      .replace(/\s+\([^)]*\)\s*$/i, ''),
  );
}

function splitWorkbookTitle(value = '') {
  const normalized = cleanWorkbookText(value);
  const match = normalized.match(/^(.{1,64}?)\s+[—-]\s+(.+)$/);

  if (!match) {
    return {
      title: prettifyWorkbookLabel(normalized),
      detail: '',
    };
  }

  return {
    title: prettifyWorkbookLabel(match[1]),
    detail: prettifyWorkbookLabel(match[2]),
  };
}

function collectGraphStrings() {
  const strings = new Set();

  ACADEMIC_WORKBOOK_GROUPS.forEach((group) => {
    strings.add(group.title);
    group.sections.forEach((section) => strings.add(WORKBOOK_SECTION_LABELS[section] || section));
  });

  Object.entries(workbookData.resourceSheets || {}).forEach(([sheetName, sheet]) => {
    if (!sheet || !sheet.groups) return;

    sheet.groups.forEach((group) => {
      const shortenedGroupTitle = shortenWorkbookGroupTitle(group.title);
      if (shortenedGroupTitle) {
        strings.add(shortenedGroupTitle);
      }

      group.entries.forEach((entry) => {
        const { title, detail } = splitWorkbookTitle(entry.title);
        if (title) strings.add(title);
        if (detail) strings.add(detail);
        if (entry.description) strings.add(cleanWorkbookText(entry.description));

        (entry.alsoIn || [])
          .map((ref) => WORKBOOK_SECTION_LABELS[ref] || ref)
          .forEach((refTitle) => {
            if (refTitle) strings.add(refTitle);
          });
      });
    });
  });

  VOCATIONAL_WORKBOOK_GROUPS.forEach((group) => strings.add(group.title));

  (workbookData.tools?.categories || []).forEach((category) => {
    if (category.title) strings.add(cleanWorkbookText(category.title));
    (category.entries || []).forEach((tool) => {
      if (tool.title) strings.add(cleanWorkbookText(tool.title));
      if (tool.description) strings.add(cleanWorkbookText(tool.description));
      if (tool.platform) strings.add(cleanWorkbookText(tool.platform));
    });
  });

  (workbookData.competition?.phases || []).forEach((phase) => {
    const phaseTitle = shortenCompetitionPhaseTitle(phase.title);
    if (phaseTitle) strings.add(phaseTitle);

    (phase.subjects || []).forEach((subject) => {
      const subjectTitle = prettifyWorkbookLabel(subject.title);
      if (subjectTitle) strings.add(subjectTitle);

      (subject.entries || []).forEach((entry) => {
        const { title, detail } = splitWorkbookTitle(entry.topic);
        if (title) strings.add(title);
        if (detail) strings.add(detail);

        ['teacher', 'medium', 'bestForExams', 'pdfSource'].forEach((key) => {
          if (entry[key]) {
            strings.add(cleanWorkbookText(entry[key]));
          }
        });
      });
    });
  });

  if (workbookData.pigflix?.subtitle) strings.add(cleanWorkbookText(workbookData.pigflix.subtitle));
  if (workbookData.pigflix?.audience) strings.add(cleanWorkbookText(workbookData.pigflix.audience));

  (workbookData.pigflix?.tabs || []).forEach((tab) => {
    if (tab.title) strings.add(cleanWorkbookText(tab.title));
    (tab.subjects || []).forEach((subject) => {
      if (subject.title) strings.add(cleanWorkbookText(subject.title));
      if (subject.description) strings.add(cleanWorkbookText(subject.description));
      (subject.entries || []).forEach((entry) => {
        if (entry.title) strings.add(cleanWorkbookText(entry.title));
        if (entry.type) strings.add(cleanWorkbookText(entry.type));
        if (entry.age) strings.add(cleanWorkbookText(entry.age));
        if (entry.vibe) strings.add(cleanWorkbookText(entry.vibe));
        if (entry.description) strings.add(cleanWorkbookText(entry.description));
      });
    });
  });

  return [...strings]
    .map((value) => cleanWorkbookText(value))
    .filter(Boolean)
    .filter((value) => !GRAPH_TRANSLATION_SEEDS[value])
    .sort((a, b) => a.localeCompare(b));
}

async function translateOne(value) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', 'hi');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', value);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for "${value}"`);
  }

  const data = await response.json();
  const translated = Array.isArray(data?.[0])
    ? data[0].map((chunk) => chunk?.[0] || '').join('')
    : '';

  return cleanWorkbookText(translated);
}

async function readExistingTranslations() {
  try {
    const module = await import(`file://${OUTPUT_PATH}?t=${Date.now()}`);
    return module.default || {};
  } catch {
    return {};
  }
}

async function writeTranslationModule(translations) {
  const sortedEntries = Object.entries(translations).sort(([a], [b]) => a.localeCompare(b));
  const body = JSON.stringify(Object.fromEntries(sortedEntries), null, 2);
  const output = `const GRAPH_TRANSLATIONS_GENERATED = ${body};\n\nexport default GRAPH_TRANSLATIONS_GENERATED;\n`;
  await fs.writeFile(OUTPUT_PATH, output, 'utf8');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const strings = collectGraphStrings();
  const existing = await readExistingTranslations();
  const translated = { ...existing };

  strings.forEach((value) => {
    if (!translated[value] && HINDI_TEXT_PATTERN.test(value)) {
      translated[value] = value;
    }
  });

  const pending = strings.filter((value) => !translated[value]);

  console.log(`Localized strings: ${strings.length}`);
  console.log(`Existing translations: ${Object.keys(existing).length}`);
  console.log(`Pending translations: ${pending.length}`);

  if (dryRun || pending.length === 0) {
    if (!dryRun && Object.keys(translated).length !== Object.keys(existing).length) {
      await writeTranslationModule(translated);
    }
    return;
  }

  for (let index = 0; index < pending.length; index += 1) {
    const value = pending[index];
    const result = await translateOne(value);
    translated[value] = result || value;
    if ((index + 1) % 25 === 0 || index === pending.length - 1) {
      console.log(`Translated ${index + 1}/${pending.length}`);
      await writeTranslationModule(translated);
    }
  }

  await writeTranslationModule(translated);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
