import { GRAPH_TRANSLATION_SEEDS } from './graphTranslationSeeds';
import GRAPH_TRANSLATIONS_GENERATED from './graphTranslations.generated';

const HINDI_TEXT_PATTERN = /[\u0900-\u097f]/;

function normalizeGraphText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function mergeTranslations() {
  const merged = new Map();

  [GRAPH_TRANSLATION_SEEDS, GRAPH_TRANSLATIONS_GENERATED].forEach((source) => {
    Object.entries(source || {}).forEach(([key, value]) => {
      const normalizedKey = normalizeGraphText(key);
      const normalizedValue = normalizeGraphText(value);
      if (normalizedKey) {
        merged.set(normalizedKey, normalizedValue);
      }
    });
  });

  return merged;
}

export const GRAPH_HI_TRANSLATIONS = mergeTranslations();

export function isLocalizedText(value) {
  return Boolean(value) && typeof value === 'object' && ('en' in value || 'hi' in value);
}

export function getEnglishText(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return normalizeGraphText(value);
  }

  return normalizeGraphText(value.en || value.hi || '');
}

function deriveHindiGraphText(value) {
  const englishValue = normalizeGraphText(value);
  if (!englishValue) {
    return '';
  }

  if (HINDI_TEXT_PATTERN.test(englishValue)) {
    return englishValue;
  }

  const directHit = GRAPH_HI_TRANSLATIONS.get(englishValue);
  if (directHit) {
    return directHit;
  }

  const classRangeMatch = englishValue.match(/^Class\s+(\d+)\s+to\s+(\d+)$/i);
  if (classRangeMatch) {
    return `कक्षा ${classRangeMatch[1]} से ${classRangeMatch[2]}`;
  }

  const compactClassRangeMatch = englishValue.match(/^Class\s+(\d+)\s*[-–]\s*(\d+)$/i);
  if (compactClassRangeMatch) {
    return `कक्षा ${compactClassRangeMatch[1]} से ${compactClassRangeMatch[2]}`;
  }

  const classMatch = englishValue.match(/^Class\s+(.+)$/i);
  if (classMatch) {
    return `कक्षा ${classMatch[1]}`;
  }

  const nurseryMatch = englishValue.match(/^Nursery\s+to\s+(\d+)$/i);
  if (nurseryMatch) {
    return `नर्सरी से कक्षा ${nurseryMatch[1]}`;
  }

  const commonLevelsMatch = englishValue.match(/^Common to (.+) all levels$/i);
  if (commonLevelsMatch) {
    return `${deriveHindiGraphText(commonLevelsMatch[1])} के सभी स्तरों में सामान्य`;
  }

  const sharedSpecificMatch = englishValue.match(/^Shared across (.+?): (.+)$/i);
  if (sharedSpecificMatch) {
    return `${deriveHindiGraphText(sharedSpecificMatch[1])} में साझा: ${sharedSpecificMatch[2]
      .split(/\s*,\s*|\s+and\s+/i)
      .map((part) => deriveHindiGraphText(part))
      .join(', ')}`;
  }

  const sharedMatch = englishValue.match(/^Shared across (.+)$/i);
  if (sharedMatch) {
    return `${deriveHindiGraphText(sharedMatch[1])} में साझा`;
  }

  return '';
}

export function createLocalizedText(value, hiOverride = '') {
  const englishValue = getEnglishText(value);
  const hindiValue = normalizeGraphText(
    hiOverride ||
      (isLocalizedText(value) ? value.hi || '' : '') ||
      deriveHindiGraphText(englishValue),
  );

  return {
    en: englishValue,
    hi: hindiValue,
  };
}

export function getLocalizedText(value, language = 'en', options = {}) {
  const { strict = false } = options;
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return normalizeGraphText(value);
  }

  const englishValue = normalizeGraphText(value.en || '');
  const hindiValue = normalizeGraphText(value.hi || '');

  if (language === 'hi') {
    if (hindiValue) {
      return hindiValue;
    }

    return strict ? '' : englishValue;
  }

  return englishValue || hindiValue;
}

export function hasHindiLocalization(value) {
  return Boolean(isLocalizedText(value) && normalizeGraphText(value.hi));
}

export function validateHindiCoverage(graphData) {
  const missing = [];

  if (!graphData) {
    return missing;
  }

  if (graphData.titleText && !hasHindiLocalization(graphData.titleText)) {
    missing.push(`page:${graphData.pageKey || 'unknown'}:title`);
  }

  (graphData.nodes || []).forEach((node) => {
    if (node.titleText && !hasHindiLocalization(node.titleText)) {
      missing.push(`node:${node.id}:title`);
    }

    if (node.descriptionText && !hasHindiLocalization(node.descriptionText)) {
      missing.push(`node:${node.id}:description`);
    }

    if (node.sharedGroupText && !hasHindiLocalization(node.sharedGroupText)) {
      missing.push(`node:${node.id}:sharedGroup`);
    }
  });

  (graphData.sharedGroups || []).forEach((group) => {
    if (group.labelText && !hasHindiLocalization(group.labelText)) {
      missing.push(`group:${group.id}:label`);
    }
  });

  (graphData.annotations || []).forEach((annotation) => {
    if (annotation.titleText && !hasHindiLocalization(annotation.titleText)) {
      missing.push(`annotation:${annotation.id}:title`);
    }
  });

  return missing;
}
