import workbookData from './workbookData.json';
import { createLocalizedText, getEnglishText, getLocalizedText } from './graphLocalization';

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

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

const PAGE_CONFIG = {
  academics: {
    title: 'Academics',
    path: '/academics',
    rootLabel: 'ACADEMICS',
  },
  vocational: {
    title: 'Vocational & Training',
    path: '/vocational-training',
    rootLabel: 'VOCATIONAL & SKILLS',
  },
  tools: {
    title: 'Tools',
    path: '/tools',
    rootLabel: 'TOOLS',
  },
  competition: {
    title: 'Competitive Exams',
    path: '/competitive-exams',
    rootLabel: 'COMP',
  },
  pigflix: {
    title: 'Pigflix',
    path: '/pigflix',
    rootLabel: 'PIGFLIX',
  },
};

const ACADEMICS_DESCRIPTIONS = {
  shaladarpanrscrtbooks15: 'Rajasthan board textbooks for foundational school classes.',
  samparkfoundation2links: 'Foundational literacy and numeracy learning support.',
  missiongyaan: 'Learning support resources for school learners and teachers.',
  bser: 'Rajasthan board syllabus, exams, and official school updates.',
  sportspt: 'Physical training and school sports reference material.',
  ncertbookssection112: 'Free NCERT textbooks across Classes 1 to 12.',
  dikshaportal: 'National classroom content and teacher learning platform.',
  pmevidya: 'Multi-channel digital learning support for school students.',
  nios: 'Open schooling resources and flexible certification pathways.',
  manodarpan: 'Student wellbeing and mental health guidance resources.',
  referenceschool: 'Reference school model from Kendriya Vidyalaya Sangathan.',
  swayamprabha: 'DTH learning channels for higher education.',
  cec: 'Curriculum-based university e-content and recorded lectures.',
  swayam: 'National MOOCs platform for college and university learning.',
  epgpathshala: 'Postgraduate subject modules in a structured digital format.',
  shodhganga: 'Repository of completed doctoral theses.',
  shodhshuddhi: 'Academic plagiarism detection support for research work.',
  bodhanai: 'AI-assisted support for research and academic workflows.',
  istem: 'Indian research facilities and equipment access network.',
  nptel: 'IIT and IISc online courses for higher studies.',
  egyaankosh: 'IGNOU digital repository of self-learning material.',
  vmou: 'Open university study material and distance-learning support.',
};

const TOOL_SLOT_LABELS = [
  { key: 'webApp', label: 'Web App' },
  { key: 'tutorial', label: 'Tutorial' },
  { key: 'app', label: 'App' },
];

const TOOL_WEB_HINTS = [
  'chatgpt',
  'claude',
  'gemini',
  'notebooklm',
  'studio',
  'figma',
  'canva',
  'colab',
  'drive',
  'docs',
  'online',
  'product hunt',
  'socialblade',
  'libgen',
  'library genesis',
  'veritasium',
  '91mobiles',
  'freepik',
  'remove.bg',
  'pixelcut',
  'pdf24',
  'sites',
  'postman',
];

const TOOL_APP_HINTS = [
  'browser',
  'desktop',
  'ide',
  'pydroid',
  'snapseed',
  'snaptube',
  'seal',
  'revanced',
  'telegram',
  'miro',
  'windows app',
  'cx file explorer',
  'chrome remote desktop',
];

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;
const DOMAIN_PATTERN = /\b(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"')]*)?/gi;

const LINK_LABEL_OVERRIDES = [
  { pattern: /youtube|youtu\.be/i, label: 'YouTube' },
  { pattern: /telegram|t\.me/i, label: 'Telegram' },
  { pattern: /pdf/i, label: 'PDF' },
  { pattern: /drive\.google/i, label: 'Drive' },
  { pattern: /docs\.google/i, label: 'Docs' },
  { pattern: /play\.google|app store|app\b/i, label: 'App' },
  { pattern: /tutorial/i, label: 'Tutorial' },
];

function decodeEntities(value = '') {
  return value.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (entity) => ENTITY_MAP[entity] || entity);
}

function parseAttrs(source = '') {
  const attrs = {};
  const pattern = /([:\w-]+)="([^"]*)"/g;

  for (const match of source.matchAll(pattern)) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
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

function stripHtmlToLines(value = '') {
  const decoded = decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|h\d)[^>]*>/gi, '\n')
    .replace(/<a\b[^>]*>/gi, '')
    .replace(/<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ');

  return decoded
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseGeometry(body = '') {
  const geometryMatch = body.match(/<mxGeometry\b([^>]*?)(?:\/>|>[\s\S]*?<\/mxGeometry>)/);
  if (!geometryMatch) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const attrs = parseAttrs(geometryMatch[1]);

  return {
    x: parseNumber(attrs.x),
    y: parseNumber(attrs.y),
    width: parseNumber(attrs.width),
    height: parseNumber(attrs.height),
  };
}

function parseDiagram(body) {
  const nodes = [];
  const edges = [];
  const cellPattern = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;

  for (const match of body.matchAll(cellPattern)) {
    const attrs = parseAttrs(match[1]);
    const inner = match[2] || '';

    if (attrs.vertex === '1') {
      const lines = stripHtmlToLines(attrs.value || '');
      const title = prettifyLabel(lines[0] || '');
      const geometry = parseGeometry(inner);
      const style = attrs.style || '';

      nodes.push({
        id: attrs.id,
        rawTitle: lines[0] || '',
        title,
        details: lines.slice(1),
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        style,
        isAnnotation: style.includes('text;') || normalizeKey(title).includes('linkscommon'),
        isBackground: !title,
      });
    }

    if (attrs.edge === '1' && attrs.source && attrs.target) {
      edges.push({
        id: attrs.id,
        source: attrs.source,
        target: attrs.target,
      });
    }
  }

  return { nodes, edges };
}

function normalizeLinkToken(token = '') {
  const trimmed = token.trim().replace(/[),.;]+$/, '');
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"')]*)?$/i.test(trimmed)) {
    return `https://${trimmed.replace(/^www\./i, 'www.')}`;
  }
  return null;
}

function extractLineLinks(line = '') {
  const matches = [...(line.match(URL_PATTERN) || []), ...(line.match(DOMAIN_PATTERN) || [])];
  const unique = [];
  const seen = new Set();

  matches.forEach((token) => {
    const href = normalizeLinkToken(token);
    if (href && !seen.has(href)) {
      seen.add(href);
      unique.push(href);
    }
  });

  URL_PATTERN.lastIndex = 0;
  DOMAIN_PATTERN.lastIndex = 0;
  return unique;
}

function inferLinkLabel(line, href, index) {
  const combined = `${line} ${href}`.toLowerCase();
  const matched = LINK_LABEL_OVERRIDES.find((item) => item.pattern.test(combined));
  if (matched) return matched.label;

  try {
    const host = new URL(href).hostname.replace(/^www\./, '');
    return host || (index === 0 ? 'Website' : `Link ${index + 1}`);
  } catch {
    return index === 0 ? 'Website' : `Link ${index + 1}`;
  }
}

function extractNodeLinks(node) {
  const lines = [node.rawTitle, ...node.details].filter(Boolean);
  const links = [];
  const seen = new Set();

  lines.forEach((line) => {
    extractLineLinks(line).forEach((href) => {
      if (!seen.has(href)) {
        seen.add(href);
        links.push({
          href,
          label: inferLinkLabel(line, href, links.length),
          primary: links.length === 0,
        });
      }
    });
  });

  return links;
}

function extractNodeNotes(node) {
  return node.details.filter((line) => extractLineLinks(line).length === 0);
}

function parseXmlDiagrams(xml) {
  const diagrams = {};
  const pattern = /<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g;

  for (const match of xml.matchAll(pattern)) {
    const attrs = parseAttrs(match[1]);
    const name = decodeEntities(attrs.name || '');
    const key = normalizeKey(name);
    diagrams[key] = parseDiagram(match[2]);
  }

  return diagrams;
}

function buildEdgeMaps(nodes, edges) {
  const incoming = new Map();
  const outgoing = new Map();

  nodes.forEach((node) => {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  });

  edges.forEach((edge) => {
    if (outgoing.has(edge.source) && incoming.has(edge.target)) {
      outgoing.get(edge.source).push(edge.target);
      incoming.get(edge.target).push(edge.source);
    }
  });

  return { incoming, outgoing };
}

function findRootId(nodes, edges, preferredLabel) {
  const { incoming, outgoing } = buildEdgeMaps(nodes, edges);
  const activeNodes = nodes.filter(
    (node) =>
      !node.isAnnotation &&
      !node.isBackground &&
      (outgoing.get(node.id)?.length || 0) > 0,
  );

  const preferredKey = normalizeKey(preferredLabel);
  const directMatch = activeNodes.find((node) => normalizeKey(node.title) === preferredKey);
  if (directMatch) return directMatch.id;

  const partialMatch = activeNodes.find(
    (node) =>
      normalizeKey(node.title).includes(preferredKey) &&
      !normalizeKey(node.title).endsWith('page'),
  );
  if (partialMatch) return partialMatch.id;

  const candidates = activeNodes.filter((node) => (incoming.get(node.id)?.length || 0) === 0);
  const nonPageCandidate = candidates.find((node) => !normalizeKey(node.title).endsWith('page'));
  return nonPageCandidate?.id || candidates[0]?.id || null;
}

function getDepths(rootId, outgoing) {
  const depths = new Map();
  if (!rootId) return depths;

  const queue = [{ id: rootId, depth: 0 }];
  depths.set(rootId, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    const children = outgoing.get(current.id) || [];

    children.forEach((childId) => {
      const nextDepth = current.depth + 1;
      if (!depths.has(childId) || nextDepth < depths.get(childId)) {
        depths.set(childId, nextDepth);
        queue.push({ id: childId, depth: nextDepth });
      }
    });
  }

  return depths;
}

function findNearestSharedHeading(node, annotations) {
  const candidates = annotations.filter((annotation) => normalizeKey(annotation.title).includes('common'));
  if (!candidates.length) return null;

  return candidates.reduce((nearest, candidate) => {
    const distance = Math.abs(candidate.y - node.y);
    if (!nearest || distance < nearest.distance) {
      return { title: candidate.title, id: candidate.id, distance };
    }
    return nearest;
  }, null);
}

function nodeKindFromDepth(depth) {
  if (depth <= 1) return 'category';
  if (depth === 2) return 'subcategory';
  return 'resource';
}

function findNodeByTitle(nodes, title) {
  const target = normalizeKey(title);
  return nodes.find((node) => normalizeKey(node.title) === target) || null;
}

function getSyntheticParentIds(sharedGroupTitle, nodes, outgoing) {
  const normalized = normalizeKey(sharedGroupTitle);
  let anchorNode = null;

  if (normalized.includes('schoolalllevels')) {
    anchorNode = findNodeByTitle(nodes, 'School');
  } else if (normalized.includes('highereducationalllevels')) {
    anchorNode = findNodeByTitle(nodes, 'Higher Education');
  } else if (normalized.includes('techskills')) {
    anchorNode = findNodeByTitle(nodes, 'Tech & Skills');
  }

  if (!anchorNode) {
    return [];
  }

  return (outgoing.get(anchorNode.id) || []).filter(Boolean);
}

function buildGraphPage(diagram, config, descriptionMap = {}) {
  const baseNodes = diagram.nodes.filter((node) => !node.isBackground);
  const baseEdges = diagram.edges.filter(
    (edge) =>
      baseNodes.some((node) => node.id === edge.source) &&
      baseNodes.some((node) => node.id === edge.target),
  );
  const rootId = findRootId(baseNodes, baseEdges, config.rootLabel);
  const { incoming: realIncoming, outgoing: realOutgoing } = buildEdgeMaps(baseNodes, baseEdges);
  const depths = getDepths(rootId, realOutgoing);
  const annotations = baseNodes.filter((node) => node.isAnnotation);
  const visibleBaseNodes = baseNodes.filter((node) => !node.isAnnotation);
  const syntheticEdges = [];
  const syntheticKeySet = new Set();
  const sharedGroupMap = new Map();

  visibleBaseNodes.forEach((node) => {
    const parentIds = realIncoming.get(node.id) || [];
    const childIds = realOutgoing.get(node.id) || [];
    const isolated = node.id !== rootId && parentIds.length === 0 && childIds.length === 0;
    const nearestSharedHeading = isolated ? findNearestSharedHeading(node, annotations) : null;
    sharedGroupMap.set(node.id, nearestSharedHeading?.title || null);
    const syntheticParents =
      isolated && nearestSharedHeading
        ? getSyntheticParentIds(nearestSharedHeading.title, visibleBaseNodes, realOutgoing)
        : [];

    syntheticParents.forEach((parentId) => {
      const edgeId = `synthetic-${parentId}-${node.id}`;
      if (!syntheticKeySet.has(edgeId)) {
        syntheticKeySet.add(edgeId);
        syntheticEdges.push({
          id: edgeId,
          source: parentId,
          target: node.id,
          synthetic: true,
        });
      }
    });
  });

  const allEdges = [...baseEdges, ...syntheticEdges];
  const { incoming, outgoing } = buildEdgeMaps(visibleBaseNodes, allEdges);
  const nodeMap = new Map();

  visibleBaseNodes.forEach((node) => {
    const parentIds = incoming.get(node.id) || [];
    const childIds = outgoing.get(node.id) || [];
    const normalized = normalizeKey(node.title);
    const links = extractNodeLinks(node);
    const noteLines = extractNodeNotes(node);
    const derivedDescription =
      descriptionMap[normalized] || noteLines.join(' ') || null;
    const nearestSharedHeading = sharedGroupMap.get(node.id);
    const kind = node.id === rootId ? 'root' : nodeKindFromDepth(depths.get(node.id) ?? 99);

    nodeMap.set(node.id, {
      ...node,
      hidden: node.id === rootId,
      kind,
      description: derivedDescription,
      sharedGroup: nearestSharedHeading || null,
      isShared: parentIds.length > 1 || Boolean(nearestSharedHeading),
      depth: depths.get(node.id) ?? null,
      parentIds,
      childIds,
      links,
      searchableText: [
        node.title,
        derivedDescription,
        nearestSharedHeading || '',
        ...links.map((link) => `${link.label} ${link.href}`),
      ]
        .filter(Boolean)
        .join(' '),
    });
  });

  const visibleNodes = [...nodeMap.values()].filter((node) => !node.hidden);
  const renderableEdges = allEdges.filter((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    return source && target && !source.hidden && !target.hidden;
  });
  const relevantAnnotations = annotations.filter((annotation) =>
    visibleNodes.some((node) => node.sharedGroup === annotation.title),
  );

  const boundsSource = [...visibleNodes, ...relevantAnnotations];
  const minX = Math.min(...boundsSource.map((item) => item.x));
  const minY = Math.min(...boundsSource.map((item) => item.y));
  const maxX = Math.max(...boundsSource.map((item) => item.x + item.width));
  const maxY = Math.max(...boundsSource.map((item) => item.y + item.height));

  return {
    pageKey: normalizeKey(config.title),
    title: config.title,
    path: config.path,
    rootId,
    nodes: visibleNodes.sort((a, b) => (a.y - b.y) || (a.x - b.x)),
    nodeMap,
    edges: renderableEdges,
    annotations: relevantAnnotations,
    bounds: { minX, minY, maxX, maxY },
    rootChildren: (outgoing.get(rootId) || [])
      .map((id) => nodeMap.get(id))
      .filter(Boolean)
      .sort((a, b) => a.y - b.y),
    edgeKeyMap: new Map(renderableEdges.map((edge) => [`${edge.source}->${edge.target}`, edge])),
  };
}

function inferToolSlots(title, categoryTitle) {
  const lowerTitle = title.toLowerCase();
  const lowerCategory = categoryTitle.toLowerCase();
  const webApp =
    TOOL_WEB_HINTS.some((hint) => lowerTitle.includes(hint)) ||
    /\.[a-z]+/.test(lowerTitle) ||
    ['ai / ml', 'development', 'design', 'civic & security', 'research'].includes(lowerCategory);
  const app =
    TOOL_APP_HINTS.some((hint) => lowerTitle.includes(hint)) ||
    ['web browsing', 'file management', 'creativity'].includes(lowerCategory);
  const tutorial = lowerTitle.includes('tutorial');

  return {
    webApp,
    tutorial,
    app,
  };
}

function buildToolsPage(diagram, config) {
  const renderableNodes = diagram.nodes.filter((node) => !node.isAnnotation && !node.isBackground);
  const { outgoing } = buildEdgeMaps(renderableNodes, diagram.edges);
  const rootId = findRootId(renderableNodes, diagram.edges, config.rootLabel);
  const nodeById = new Map(renderableNodes.map((node) => [node.id, node]));
  const categories = (outgoing.get(rootId) || [])
    .map((id) => nodeById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.y - b.y)
    .map((category) => {
      const listNodes = (outgoing.get(category.id) || [])
        .map((id) => nodeById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.y - b.y);
      const tools = listNodes
        .flatMap((listNode) =>
          listNode.details.length ? [listNode.rawTitle, ...listNode.details] : [listNode.rawTitle],
        )
        .filter(Boolean)
        .map((line, index) => {
          const cleanTitle = prettifyLabel(line);
          return {
            id: `${normalizeKey(category.title)}-${normalizeKey(cleanTitle)}-${index}`,
            title: cleanTitle,
            category: category.title,
            slots: inferToolSlots(cleanTitle, category.title),
            searchableText: `${cleanTitle} ${category.title}`,
          };
        });

      return {
        id: category.id,
        title: category.title,
        tools,
      };
    });

  return {
    pageKey: normalizeKey(config.title),
    title: config.title,
    path: config.path,
    categories,
    previewItems: categories.map((category) => category.title),
  };
}

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
  {
    id: 'school',
    title: 'School',
    sections: ['N-5', '6-8', '9-12'],
  },
  {
    id: 'higher-education',
    title: 'Higher Education',
    sections: ['UG', 'PG', 'PHD'],
  },
];

const VOCATIONAL_WORKBOOK_GROUPS = [
  { sheet: 'TT', title: 'Teacher Training' },
  { sheet: 'Voc&Skill', title: 'Tech & Skills' },
  { sheet: 'Universal', title: 'Universal' },
];

function cleanWorkbookText(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function localizeWorkbookText(value = '') {
  const cleaned = cleanWorkbookText(value);
  return cleaned ? createLocalizedText(cleaned) : null;
}

function prettifyWorkbookLabel(value = '') {
  return cleanWorkbookText(value) ? prettifyLabel(cleanWorkbookText(value)) : '';
}

function localizeWorkbookLabel(value = '') {
  const cleaned = prettifyWorkbookLabel(value);
  return cleaned ? createLocalizedText(cleaned) : null;
}

function shortenWorkbookGroupTitle(value = '') {
  return prettifyWorkbookLabel(
    cleanWorkbookText(value)
      .replace(/\s+\(Universal\)$/i, '')
      .replace(/\s+\((?:GOV|YT|APP)\)$/i, ''),
  );
}

function localizeShortWorkbookGroupTitle(value = '') {
  const cleaned = shortenWorkbookGroupTitle(value);
  return cleaned ? createLocalizedText(cleaned) : null;
}

function shortenCompetitionPhaseTitle(value = '') {
  return prettifyWorkbookLabel(
    cleanWorkbookText(value)
      .replace(/^PHASE\s+\d+\s+—\s*/i, '')
      .replace(/\s+\([^)]*\)\s*$/i, ''),
  );
}

function localizeCompetitionPhaseTitle(value = '') {
  const cleaned = shortenCompetitionPhaseTitle(value);
  return cleaned ? createLocalizedText(cleaned) : null;
}

function joinLocalizedDescriptionParts(parts = []) {
  const normalizedParts = parts
    .map((part) => {
      if (!part) return null;
      return typeof part === 'string' ? createLocalizedText(part) : part;
    })
    .filter(Boolean)
    .map((part) => ({
      en: cleanWorkbookText(getEnglishText(part)),
      hi: cleanWorkbookText(getLocalizedText(part, 'hi')),
    }))
    .filter((part) => part.en);

  if (normalizedParts.length === 0) {
    return null;
  }

  return {
    en: joinDescriptionParts(normalizedParts.map((part) => part.en)),
    hi: joinDescriptionParts(
      normalizedParts
        .map((part) => part.hi)
        .filter(Boolean),
    ),
  };
}

function createLocalizedDetailLabel(labelEn, labelHi, value) {
  const localizedValue = createLocalizedText(value);

  return {
    en: `${labelEn}: ${getEnglishText(localizedValue)}.`,
    hi: `${labelHi}: ${getLocalizedText(localizedValue, 'hi') || getEnglishText(localizedValue)}।`,
  };
}

function createAlsoListedDescription(refs = []) {
  if (!refs.length) {
    return null;
  }

  return {
    en: `Also listed in ${refs.map((ref) => getEnglishText(ref)).join(', ')}.`,
    hi: `इनमें भी सूचीबद्ध: ${refs.map((ref) => getLocalizedText(ref, 'hi') || getEnglishText(ref)).join(', ')}।`,
  };
}

function createWorkbookId(...parts) {
  return parts.map((part) => normalizeKey(String(part))).filter(Boolean).join('-');
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

function dedupeLinks(links = []) {
  const deduped = [];
  const seen = new Set();

  links.forEach((link) => {
    if (link?.href && !seen.has(link.href)) {
      seen.add(link.href);
      deduped.push({
        ...link,
        primary: deduped.length === 0,
      });
    }
  });

  return deduped;
}

function createWorkbookLinks(urls = [], context = '') {
  return dedupeLinks(
    urls.map((href, index) => ({
      href,
      label: inferLinkLabel(context || href, href, index),
    })),
  );
}

function createTypedWorkbookLinks(definitions = []) {
  const links = [];

  definitions.forEach(({ hrefs = [], label }) => {
    hrefs.forEach((href) => {
      links.push({ href, label });
    });
  });

  return dedupeLinks(links);
}

function joinDescriptionParts(parts = []) {
  return parts.map((part) => cleanWorkbookText(part)).filter(Boolean).join(' ');
}

function buildWorkbookGraphPage({ title, path, rootTitle, nodeFactory }) {
  const draftNodes = [];
  const draftEdges = [];
  let order = 0;
  const rootId = createWorkbookId(title, 'root');

  const pushNode = (node) => {
    order += 48;
    draftNodes.push({
      x: 0,
      y: order,
      width: 0,
      height: 0,
      style: '',
      isAnnotation: false,
      isBackground: false,
      links: [],
      description: '',
      searchableText: '',
      ...node,
    });
  };

  const pushEdge = (source, target, suffix = target) => {
    draftEdges.push({
      id: createWorkbookId(title, source, target, suffix),
      source,
      target,
    });
  };

  pushNode({
    id: rootId,
    title: rootTitle,
    titleText: createLocalizedText(rootTitle),
    rawTitle: rootTitle,
    hidden: true,
    kind: 'root',
  });

  nodeFactory({ pushNode, pushEdge, rootId });

  const incoming = new Map();
  const outgoing = new Map();

  draftNodes.forEach((node) => {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  });

  draftEdges.forEach((edge) => {
    if (incoming.has(edge.target) && outgoing.has(edge.source)) {
      incoming.get(edge.target).push(edge.source);
      outgoing.get(edge.source).push(edge.target);
    }
  });

  const finalNodes = draftNodes.map((node) => {
    const parentIds = incoming.get(node.id) || [];
    const childIds = outgoing.get(node.id) || [];

    return {
      ...node,
      hidden: node.id === rootId,
      parentIds,
      childIds,
      isShared: parentIds.length > 1,
      depth: node.kind === 'category' ? 1 : node.kind === 'subcategory' ? 2 : node.kind === 'resource' ? 3 : 0,
      titleText: createLocalizedText(node.titleText || node.title),
      descriptionText: node.description ? createLocalizedText(node.descriptionText || node.description) : null,
      sharedGroupText: node.sharedGroup ? createLocalizedText(node.sharedGroupText || node.sharedGroup) : null,
      searchableText: cleanWorkbookText(
        node.searchableText || [node.title, node.description].filter(Boolean).join(' '),
      ),
    };
  });

  const nodeMap = new Map(finalNodes.map((node) => [node.id, node]));
  const visibleNodes = finalNodes.filter((node) => !node.hidden).sort((a, b) => a.y - b.y);
  const renderableEdges = draftEdges.filter((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    return source && target && !source.hidden && !target.hidden;
  });

  return {
    pageKey: normalizeKey(title),
    title,
    titleText: createLocalizedText(title),
    path,
    rootId,
    nodes: visibleNodes,
    nodeMap,
    edges: renderableEdges,
    annotations: [],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    rootChildren: (outgoing.get(rootId) || [])
      .map((id) => nodeMap.get(id))
      .filter(Boolean)
      .sort((a, b) => a.y - b.y),
    edgeKeyMap: new Map(renderableEdges.map((edge) => [`${edge.source}->${edge.target}`, edge])),
  };
}

function buildWorkbookAcademicsPage(config) {
  const sectionNodeIdBySheet = {};
  const pageSheets = new Set(ACADEMIC_WORKBOOK_GROUPS.flatMap((group) => group.sections));

  return buildWorkbookGraphPage({
    title: config.title,
    path: config.path,
    rootTitle: config.rootLabel,
    nodeFactory: ({ pushNode, pushEdge, rootId }) => {
      ACADEMIC_WORKBOOK_GROUPS.forEach((group, groupIndex) => {
        const categoryId = createWorkbookId(config.title, group.id);
        pushNode({
          id: categoryId,
          rawTitle: group.title,
          title: group.title,
          titleText: createLocalizedText(group.title),
          kind: 'category',
        });
        pushEdge(rootId, categoryId, `category-${groupIndex}`);

        group.sections.forEach((sheetName, sectionIndex) => {
          const sectionTitle = WORKBOOK_SECTION_LABELS[sheetName] || sheetName;
          const sectionId = createWorkbookId(config.title, sheetName);
          sectionNodeIdBySheet[sheetName] = sectionId;

          pushNode({
            id: sectionId,
            rawTitle: sectionTitle,
            title: sectionTitle,
            titleText: createLocalizedText(sectionTitle),
            kind: 'subcategory',
            searchableText: `${sectionTitle} ${group.title}`,
          });
          pushEdge(categoryId, sectionId, `section-${sectionIndex}`);
        });
      });

      ACADEMIC_WORKBOOK_GROUPS.forEach((group) => {
        group.sections.forEach((sheetName) => {
          const sectionId = sectionNodeIdBySheet[sheetName];
          const sheet = workbookData.resourceSheets[sheetName];
          if (!sheet) return;

          sheet.groups.forEach((resourceGroup, groupOffset) => {
            resourceGroup.entries.forEach((entry, entryIndex) => {
              const { title, detail } = splitWorkbookTitle(entry.title);
              const crossPageRefs = entry.alsoIn
                .filter((ref) => !pageSheets.has(ref))
                .map((ref) => WORKBOOK_SECTION_LABELS[ref] || ref);
              const localizedCrossPageRefs = crossPageRefs.map((ref) => createLocalizedText(ref));
              const description = joinDescriptionParts([
                detail,
                entry.description,
                crossPageRefs.length > 0 ? `Also listed in ${crossPageRefs.join(', ')}.` : '',
              ]);
              const descriptionText = joinLocalizedDescriptionParts([
                detail ? createLocalizedText(detail) : null,
                entry.description ? createLocalizedText(entry.description) : null,
                createAlsoListedDescription(localizedCrossPageRefs),
              ]);
              const links = createWorkbookLinks(entry.links, `${entry.title} ${entry.description}`);
              const resourceId = createWorkbookId(config.title, sheetName, resourceGroup.title, entry.index, entry.title);
              const parentIds = [
                sectionId,
                ...entry.alsoIn
                  .filter((ref) => pageSheets.has(ref) && ref !== sheetName)
                  .map((ref) => sectionNodeIdBySheet[ref])
                  .filter(Boolean),
              ];

              pushNode({
                id: resourceId,
                rawTitle: entry.title,
                title: title || prettifyWorkbookLabel(entry.title),
                titleText: createLocalizedText(title || prettifyWorkbookLabel(entry.title)),
                kind: 'resource',
                description,
                descriptionText,
                links,
                searchableText: [
                  entry.title,
                  detail,
                  entry.description,
                  resourceGroup.title,
                  group.title,
                  ...crossPageRefs,
                  ...links.map((link) => `${link.label} ${link.href}`),
                ].join(' '),
              });

              parentIds.forEach((parentId, parentIndex) => {
                pushEdge(parentId, resourceId, `resource-${groupOffset}-${entryIndex}-${parentIndex}`);
              });
            });
          });
        });
      });
    },
  });
}

function buildWorkbookVocationalPage(config) {
  const categoryNodeIds = {};

  return buildWorkbookGraphPage({
    title: config.title,
    path: config.path,
    rootTitle: config.rootLabel,
    nodeFactory: ({ pushNode, pushEdge, rootId }) => {
      VOCATIONAL_WORKBOOK_GROUPS.forEach((category, categoryIndex) => {
        const categoryId = createWorkbookId(config.title, category.sheet);
        categoryNodeIds[category.sheet] = categoryId;

        pushNode({
          id: categoryId,
          rawTitle: category.title,
          title: category.title,
          titleText: createLocalizedText(category.title),
          kind: 'category',
        });
        pushEdge(rootId, categoryId, `category-${categoryIndex}`);
      });

      VOCATIONAL_WORKBOOK_GROUPS.forEach((category) => {
        const categoryId = categoryNodeIds[category.sheet];
        const sheet = workbookData.resourceSheets[category.sheet];
        if (!sheet) return;

        sheet.groups.forEach((group, groupIndex) => {
          const subcategoryId = createWorkbookId(config.title, category.sheet, group.title);
          pushNode({
            id: subcategoryId,
            rawTitle: group.title,
            title: shortenWorkbookGroupTitle(group.title),
            titleText: createLocalizedText(shortenWorkbookGroupTitle(group.title)),
            kind: 'subcategory',
            searchableText: `${group.title} ${category.title}`,
          });
          pushEdge(categoryId, subcategoryId, `subcategory-${groupIndex}`);

          group.entries.forEach((entry, entryIndex) => {
            const { title, detail } = splitWorkbookTitle(entry.title);
            const links = createWorkbookLinks(entry.links, `${entry.title} ${entry.description}`);
            const extraRefs = entry.alsoIn
              .map((ref) => WORKBOOK_SECTION_LABELS[ref] || ref)
              .filter(Boolean);
            const localizedExtraRefs = extraRefs.map((ref) => createLocalizedText(ref));
            const description = joinDescriptionParts([
              detail,
              entry.description,
              extraRefs.length > 0 ? `Also listed in ${extraRefs.join(', ')}.` : '',
            ]);
            const descriptionText = joinLocalizedDescriptionParts([
              detail ? createLocalizedText(detail) : null,
              entry.description ? createLocalizedText(entry.description) : null,
              createAlsoListedDescription(localizedExtraRefs),
            ]);
            const resourceId = createWorkbookId(config.title, category.sheet, group.title, entry.index, entry.title);

            pushNode({
              id: resourceId,
              rawTitle: entry.title,
              title: title || prettifyWorkbookLabel(entry.title),
              titleText: createLocalizedText(title || prettifyWorkbookLabel(entry.title)),
              kind: 'resource',
              description,
              descriptionText,
              links,
              searchableText: [
                entry.title,
                detail,
                entry.description,
                group.title,
                category.title,
                ...extraRefs,
                ...links.map((link) => `${link.label} ${link.href}`),
              ].join(' '),
            });
            pushEdge(subcategoryId, resourceId, `resource-${entryIndex}`);
          });
        });
      });
    },
  });
}

function buildWorkbookCompetitionPage(config) {
  return buildWorkbookGraphPage({
    title: config.title,
    path: config.path,
    rootTitle: config.rootLabel,
    nodeFactory: ({ pushNode, pushEdge, rootId }) => {
      workbookData.competition.phases.forEach((phase, phaseIndex) => {
        const phaseId = createWorkbookId(config.title, phase.title);
        pushNode({
          id: phaseId,
          rawTitle: phase.title,
          title: shortenCompetitionPhaseTitle(phase.title),
          titleText: createLocalizedText(shortenCompetitionPhaseTitle(phase.title)),
          kind: 'category',
          searchableText: phase.title,
        });
        pushEdge(rootId, phaseId, `phase-${phaseIndex}`);

        phase.subjects.forEach((subject, subjectIndex) => {
          const subjectId = createWorkbookId(config.title, phase.title, subject.title);
          pushNode({
            id: subjectId,
            rawTitle: subject.title,
            title: prettifyWorkbookLabel(subject.title),
            titleText: createLocalizedText(prettifyWorkbookLabel(subject.title)),
            kind: 'subcategory',
            searchableText: `${subject.title} ${phase.title}`,
          });
          pushEdge(phaseId, subjectId, `subject-${subjectIndex}`);

          subject.entries.forEach((entry, entryIndex) => {
            const { title, detail } = splitWorkbookTitle(entry.topic);
            const links = createTypedWorkbookLinks([
              { hrefs: entry.youtubeLinks, label: 'YouTube' },
              { hrefs: entry.pdfLinks, label: 'PDF' },
            ]);
            const description = joinDescriptionParts([
              detail,
              entry.teacher ? `Teacher: ${entry.teacher}.` : '',
              entry.medium ? `Medium: ${entry.medium}.` : '',
              entry.bestForExams ? `Best for: ${entry.bestForExams}.` : '',
              entry.pdfSource ? `PDF source: ${entry.pdfSource}.` : '',
            ]);
            const descriptionText = joinLocalizedDescriptionParts([
              detail ? createLocalizedText(detail) : null,
              entry.teacher ? createLocalizedDetailLabel('Teacher', 'शिक्षक', entry.teacher) : null,
              entry.medium ? createLocalizedDetailLabel('Medium', 'माध्यम', entry.medium) : null,
              entry.bestForExams ? createLocalizedDetailLabel('Best for', 'इन परीक्षाओं के लिए उपयुक्त', entry.bestForExams) : null,
              entry.pdfSource ? createLocalizedDetailLabel('PDF source', 'पीडीएफ स्रोत', entry.pdfSource) : null,
            ]);
            const resourceId = createWorkbookId(config.title, phase.title, subject.title, entry.index, entry.topic);

            pushNode({
              id: resourceId,
              rawTitle: entry.topic,
              title: title || prettifyWorkbookLabel(entry.topic),
              titleText: createLocalizedText(title || prettifyWorkbookLabel(entry.topic)),
              kind: 'resource',
              description,
              descriptionText,
              links,
              searchableText: [
                entry.subject,
                entry.topic,
                entry.teacher,
                entry.medium,
                entry.bestForExams,
                entry.pdfSource,
                ...links.map((link) => `${link.label} ${link.href}`),
              ].join(' '),
            });
            pushEdge(subjectId, resourceId, `resource-${entryIndex}`);
          });
        });
      });
    },
  });
}

function buildWorkbookToolsPage(config) {
  const categories = workbookData.tools.categories.map((category, categoryIndex) => ({
    id: createWorkbookId(config.title, category.title, categoryIndex),
    title: category.title,
    titleText: createLocalizedText(category.title),
    tools: category.entries.map((tool, toolIndex) => {
      const links = createTypedWorkbookLinks([
        { hrefs: tool.webLinks, label: 'Web' },
        { hrefs: tool.appLinks, label: 'App' },
        { hrefs: tool.tutorialLinks, label: 'Tutorial' },
      ]);
      const titleText = createLocalizedText(tool.title);
      const categoryText = createLocalizedText(category.title);
      const descriptionText = tool.description ? createLocalizedText(tool.description) : null;
      const platformText = tool.platform ? createLocalizedText(tool.platform) : null;

      return {
        id: createWorkbookId(config.title, category.title, tool.title, tool.index, toolIndex),
        title: tool.title,
        titleText,
        category: category.title,
        categoryText,
        description: tool.description,
        descriptionText,
        platform: tool.platform,
        platformText,
        links,
        slots: {
          webApp: tool.webLinks.length > 0,
          tutorial: tool.tutorialLinks.length > 0,
          app: tool.appLinks.length > 0,
        },
        searchableText: [
          tool.title,
          tool.description,
          tool.platform,
          category.title,
          getLocalizedText(titleText, 'hi'),
          getLocalizedText(categoryText, 'hi'),
          getLocalizedText(descriptionText, 'hi'),
          getLocalizedText(platformText, 'hi'),
          ...links.map((link) => `${link.label} ${link.href}`),
        ].filter(Boolean).join(' '),
      };
    }),
  }));

  return {
    pageKey: normalizeKey(config.title),
    title: config.title,
    titleText: createLocalizedText(config.title),
    path: config.path,
    categories,
    previewItems: categories.map((category) => category.title),
  };
}

function buildWorkbookPigflixPage(config) {
  const tabs = workbookData.pigflix.tabs.map((tab, tabIndex) => {
    const tabId = createWorkbookId(config.title, tab.title, tabIndex);
    const tabTitleText = createLocalizedText(tab.title);
    const subjects = tab.subjects.map((subject, subjectIndex) => {
      const subjectId = createWorkbookId(config.title, tab.title, subject.title, subjectIndex);
      const subjectTitleText = createLocalizedText(subject.title);
      const subjectDescriptionText = subject.description ? createLocalizedText(subject.description) : null;
      const items = subject.entries.map((entry, entryIndex) => {
        const links = createWorkbookLinks(entry.links, `${entry.title} ${entry.description} ${entry.vibe}`);
        const classTitle = cleanWorkbookText(entry.age) || workbookData.pigflix.audience || 'All Classes';
        const classTabId = createWorkbookId(config.title, 'class', classTitle);
        const titleText = createLocalizedText(cleanWorkbookText(entry.title));
        const typeText = createLocalizedText(cleanWorkbookText(entry.type || tab.title));
        const ageText = entry.age ? createLocalizedText(cleanWorkbookText(entry.age)) : null;
        const classTitleText = createLocalizedText(classTitle);
        const vibeText = entry.vibe ? createLocalizedText(cleanWorkbookText(entry.vibe)) : null;
        const descriptionText = entry.description ? createLocalizedText(cleanWorkbookText(entry.description)) : null;

        return {
          id: createWorkbookId(config.title, tab.title, subject.title, entry.title, entry.index, entryIndex),
          index: entry.index,
          title: cleanWorkbookText(entry.title),
          titleText,
          type: cleanWorkbookText(entry.type || tab.title),
          typeText,
          age: cleanWorkbookText(entry.age),
          ageText,
          classTitle,
          classTitleText,
          classTabId,
          vibe: cleanWorkbookText(entry.vibe),
          vibeText,
          description: cleanWorkbookText(entry.description),
          descriptionText,
          links,
          tabId,
          tabTitle: tab.title,
          tabTitleText,
          subjectId,
          subjectTitle: subject.title,
          subjectTitleText,
          subjectDescription: subject.description,
          subjectDescriptionText,
          searchableText: [
            entry.title,
            entry.type,
            entry.age,
            entry.vibe,
            entry.description,
            tab.title,
            subject.title,
            subject.description,
            getLocalizedText(titleText, 'hi'),
            getLocalizedText(typeText, 'hi'),
            getLocalizedText(ageText, 'hi'),
            getLocalizedText(classTitleText, 'hi'),
            getLocalizedText(vibeText, 'hi'),
            getLocalizedText(descriptionText, 'hi'),
            getLocalizedText(tabTitleText, 'hi'),
            getLocalizedText(subjectTitleText, 'hi'),
            getLocalizedText(subjectDescriptionText, 'hi'),
            ...links.map((link) => `${link.label} ${link.href}`),
          ]
            .filter(Boolean)
            .join(' '),
        };
      });

      return {
        id: subjectId,
        title: subject.title,
        titleText: subjectTitleText,
        description: subject.description,
        descriptionText: subjectDescriptionText,
        items,
        featuredItemId: items[0]?.id || null,
      };
    });

    return {
      id: tabId,
      title: tab.title,
      titleText: tabTitleText,
      subjects,
      featuredItemId: subjects.flatMap((subject) => subject.items)[0]?.id || null,
      itemCount: subjects.reduce((count, subject) => count + subject.items.length, 0),
    };
  });
  const items = tabs.flatMap((tab) => tab.subjects.flatMap((subject) => subject.items));
  const classMap = new Map();

  items.forEach((item) => {
    let classTab = classMap.get(item.classTabId);

    if (!classTab) {
      classTab = {
        id: item.classTabId,
        title: item.classTitle,
        titleText: item.classTitleText,
        subjects: [],
        itemCount: 0,
        featuredItemId: item.id,
        sortValue: Number(item.classTitle.match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER),
        subjectMap: new Map(),
      };
      classMap.set(item.classTabId, classTab);
    }

    let subject = classTab.subjectMap.get(item.subjectTitle);
    if (!subject) {
      subject = {
        id: createWorkbookId(config.title, item.classTitle, item.subjectTitle),
        title: item.subjectTitle,
        titleText: item.subjectTitleText,
        description: item.subjectDescription,
        descriptionText: item.subjectDescriptionText,
        items: [],
        featuredItemId: item.id,
      };
      classTab.subjectMap.set(item.subjectTitle, subject);
      classTab.subjects.push(subject);
    } else if (!subject.description && item.subjectDescription) {
      subject.description = item.subjectDescription;
      subject.descriptionText = item.subjectDescriptionText;
    }

    subject.items.push(item);
    classTab.itemCount += 1;
  });

  const classTabs = [...classMap.values()]
    .sort((a, b) => a.sortValue - b.sortValue || a.title.localeCompare(b.title))
    .map((tab) => {
      const { subjectMap, sortValue, ...rest } = tab;
      return rest;
    });

  return {
    pageKey: normalizeKey(config.title),
    title: config.title,
    titleText: createLocalizedText(config.title),
    path: config.path,
    subtitle: workbookData.pigflix.subtitle,
    subtitleText: workbookData.pigflix.subtitle ? createLocalizedText(workbookData.pigflix.subtitle) : null,
    audience: workbookData.pigflix.audience,
    audienceText: workbookData.pigflix.audience ? createLocalizedText(workbookData.pigflix.audience) : null,
    note: workbookData.pigflix.note,
    tabs,
    classTabs,
    items,
    itemMap: new Map(items.map((item) => [item.id, item])),
    tabMap: new Map(tabs.map((tab) => [tab.id, tab])),
    featuredItemId: items[0]?.id || null,
  };
}

function createGraphPreviewChildren(page, limit = 3) {
  return page.rootChildren.slice(0, limit).map((node) => ({
    id: node.id,
    title: node.title,
    titleText: node.titleText || createLocalizedText(node.title),
    path: page.path,
    state: { focusId: node.id, seedQuery: node.title },
  }));
}

function getNodePathTargets(page, nodeId, trail = new Set(), cache = new Map()) {
  if (cache.has(nodeId)) return cache.get(nodeId);
  if (trail.has(nodeId)) {
    const node = page.nodeMap.get(nodeId);
    return [[node ? { id: node.id, type: 'node', label: node.titleText || createLocalizedText(node.title) } : null].filter(Boolean)];
  }

  const node = page.nodeMap.get(nodeId);
  if (!node) return [];

  const nextTrail = new Set(trail);
  nextTrail.add(nodeId);
  const currentTarget = {
    id: node.id,
    type: 'node',
    label: node.titleText || createLocalizedText(node.title),
  };

  let paths;
  if (node.parentIds.length === 0) {
    if (node.hidden) {
      paths = [[]];
    } else {
      paths = [[currentTarget]];
    }
  } else {
    paths = node.parentIds.flatMap((parentId) => {
      const parent = page.nodeMap.get(parentId);
      if (!parent || parent.hidden) {
        return [[currentTarget]];
      }

      return getNodePathTargets(page, parentId, nextTrail, cache).map((path) => [...path, currentTarget]);
    });
  }

  cache.set(nodeId, paths);
  return paths;
}

function getNodePaths(page, nodeId, trail = new Set(), cache = new Map()) {
  return getNodePathTargets(page, nodeId, trail, cache).map((path) =>
    path.map((segment) => getEnglishText(segment?.label)).filter(Boolean),
  );
}

function buildHomeGraph(pages) {
  const academicsChildren = createGraphPreviewChildren(pages.academics, 2);
  const vocationalChildren = createGraphPreviewChildren(pages.vocational, 3);
  const competitionChildren = createGraphPreviewChildren(pages.competition, 3);
  const toolsChildren = pages.tools.categories.slice(0, 4).map((category) => ({
    id: category.id,
    title: category.title,
    titleText: category.titleText || createLocalizedText(category.title),
    path: pages.tools.path,
    state: { seedQuery: category.title },
  }));
  const pigflixChildren = pages.pigflix.classTabs.slice(0, 5).map((tab) => ({
    id: tab.id,
    title: tab.title,
    titleText: tab.titleText || createLocalizedText(tab.title),
    path: pages.pigflix.path,
    state: {
      activeTabId: tab.id,
      focusId: tab.featuredItemId,
    },
  }));

  return {
    root: {
      id: 'home-root',
      title: 'PIGSFIELD',
      titleText: createLocalizedText('PIGSFIELD', 'पिग्सफील्ड'),
    },
    branches: [
      {
        id: 'home-branch-academics',
        title: pages.academics.title,
        titleText: pages.academics.titleText || createLocalizedText(pages.academics.title),
        path: pages.academics.path,
        children: academicsChildren,
      },
      {
        id: 'home-branch-vocational',
        title: pages.vocational.title,
        titleText: pages.vocational.titleText || createLocalizedText(pages.vocational.title),
        path: pages.vocational.path,
        children: vocationalChildren,
      },
      {
        id: 'home-branch-competition',
        title: pages.competition.title,
        titleText: pages.competition.titleText || createLocalizedText(pages.competition.title),
        path: pages.competition.path,
        children: competitionChildren,
      },
      {
        id: 'home-branch-tools',
        title: pages.tools.title,
        titleText: pages.tools.titleText || createLocalizedText(pages.tools.title),
        path: pages.tools.path,
        children: toolsChildren,
      },
      {
        id: 'home-branch-pigflix',
        title: pages.pigflix.title,
        titleText: pages.pigflix.titleText || createLocalizedText(pages.pigflix.title),
        path: pages.pigflix.path,
        children: pigflixChildren,
      },
    ],
  };
}

function buildSiteSearchIndex(pages) {
  const graphPages = [pages.academics, pages.vocational, pages.competition];
  const graphEntries = graphPages.flatMap((page) =>
    page.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      titleText: node.titleText || createLocalizedText(node.title),
      summary: node.description,
      summaryText: node.descriptionText || (node.description ? createLocalizedText(node.description) : null),
      pageTitle: page.title,
      pageTitleText: page.titleText || createLocalizedText(page.title),
      path: page.path,
      context: getNodePaths(page, node.id)[0]?.join(' / ') || page.title,
      contextSegments: getNodePathTargets(page, node.id)[0] || [],
      searchText: node.searchableText,
      type: node.kind,
    })),
  );
  const toolEntries = pages.tools.categories.flatMap((category) =>
    category.tools.map((tool) => ({
      id: tool.id,
      title: tool.title,
      titleText: tool.titleText || createLocalizedText(tool.title),
      summary: tool.description || category.title,
      summaryText: tool.descriptionText || tool.categoryText || (tool.description ? createLocalizedText(tool.description) : createLocalizedText(category.title)),
      pageTitle: pages.tools.title,
      pageTitleText: pages.tools.titleText || createLocalizedText(pages.tools.title),
      path: pages.tools.path,
      context: `${category.title} / ${tool.title}`,
      contextSegments: [
        { id: category.id, type: 'tool-category', label: category.titleText || createLocalizedText(category.title) },
        { id: tool.id, type: 'tool', label: tool.titleText || createLocalizedText(tool.title) },
      ],
      searchText: tool.searchableText,
      type: 'tool',
    })),
  );
  const pigflixEntries = pages.pigflix.items.map((item) => ({
    id: item.id,
    title: item.title,
    titleText: item.titleText || createLocalizedText(item.title),
    summary: item.description || item.vibe || item.subjectTitle,
    summaryText:
      item.descriptionText ||
      item.vibeText ||
      item.subjectTitleText ||
      (item.description ? createLocalizedText(item.description) : createLocalizedText(item.vibe || item.subjectTitle)),
    pageTitle: pages.pigflix.title,
    pageTitleText: pages.pigflix.titleText || createLocalizedText(pages.pigflix.title),
    path: pages.pigflix.path,
    context: `${item.tabTitle} / ${item.subjectTitle}`,
    contextSegments: [
      { id: item.tabId, type: 'pigflix-tab', label: item.tabTitleText || createLocalizedText(item.tabTitle) },
      { id: item.subjectId, type: 'pigflix-subject', label: item.subjectTitleText || createLocalizedText(item.subjectTitle) },
    ],
    searchText: item.searchableText,
    type: 'pigflix',
  }));

  return [...graphEntries, ...toolEntries, ...pigflixEntries];
}

const sitemapPages = {
  academics: buildWorkbookAcademicsPage(PAGE_CONFIG.academics),
  vocational: buildWorkbookVocationalPage(PAGE_CONFIG.vocational),
  competition: buildWorkbookCompetitionPage(PAGE_CONFIG.competition),
  tools: buildWorkbookToolsPage(PAGE_CONFIG.tools),
  pigflix: buildWorkbookPigflixPage(PAGE_CONFIG.pigflix),
};

const homeGraph = buildHomeGraph(sitemapPages);
const siteSearchIndex = buildSiteSearchIndex(sitemapPages);

export { TOOL_SLOT_LABELS, getNodePathTargets, getNodePaths, homeGraph, siteSearchIndex, sitemapPages };
