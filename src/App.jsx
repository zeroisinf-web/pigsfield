import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { aboutLinks, aboutNarrative, frameworkItems, officialHandles, teamMembers } from './aboutContent';
import { navItems } from './data';
import { createLocalizedText, getLocalizedText, validateHindiCoverage } from './graphLocalization';
import { TOOL_SLOT_LABELS, getNodePathTargets, getNodePaths, homeGraph, siteSearchIndex, sitemapPages } from './sitemap';

const LanguageContext = React.createContext({ language: 'en', setLanguage: () => {} });
const LANGUAGE_STORAGE_KEY = 'pigsfield-language';
const UI_TEXT = {
  en: {
    search: 'Search',
    searchResults: 'Search results',
    noResults: 'No results found for “{query}”.',
    noMapNodes: 'No map nodes found for “{query}”.',
    noTools: 'No tools found for “{query}”.',
    pageOverview: 'Page overview',
    pageOverviewCopy: 'Use this panel to jump into the main branches of the map and inspect shared groupings.',
    startingPoints: 'Starting points',
    sharedGroups: 'Shared Groups',
    sharedGrouping: 'Shared grouping',
    sharedGroupingCopy: 'This label groups resources that are shared across multiple branches in {pageTitle}.',
    sharedGroupings: 'Shared groupings',
    appearsAcross: 'Appears across',
    relatedResources: 'Related resources',
    sharedResource: 'Shared resource',
    metadata: 'Metadata',
    page: 'Page',
    resourceType: 'Resource type',
    connectedTo: 'Connected to',
    inTheMap: 'In the map',
    links: 'Links',
    linkUnavailable: 'Link unavailable',
    branchingTo: 'Branching to',
    backTo: 'Back to {label}',
    selectTool: 'Select a tool to inspect its details.',
    category: 'Category',
    platform: 'Platform',
    notListed: 'Not listed',
    toolLinks: 'Tool links',
    pigflixFilters: 'Pigflix filters',
    pigflixClassTabs: 'Pigflix class filters',
    pigflixFormatTabs: 'Pigflix format filters',
    class: 'Class',
    format: 'Format',
    picks: 'picks',
    resourceSearchPlaceholder: 'Search resources, courses, tools...',
    pigflixSearchPlaceholder: 'Search apps, games, videos...',
  },
  hi: {
    search: 'खोजें',
    searchResults: 'खोज परिणाम',
    noResults: '“{query}” के लिए कोई परिणाम नहीं मिला।',
    noMapNodes: '“{query}” के लिए कोई मैप नोड नहीं मिला।',
    noTools: '“{query}” के लिए कोई टूल नहीं मिला।',
    pageOverview: 'पेज अवलोकन',
    pageOverviewCopy: 'इस पैनल से मैप की मुख्य शाखाओं और साझा समूहों तक जाएं।',
    startingPoints: 'शुरुआती बिंदु',
    sharedGroups: 'साझा समूह',
    sharedGrouping: 'साझा समूह',
    sharedGroupingCopy: 'यह लेबल {pageTitle} में कई शाखाओं में साझा संसाधनों को समूहित करता है।',
    sharedGroupings: 'साझा समूह',
    appearsAcross: 'इनमें दिखाई देता है',
    relatedResources: 'संबंधित संसाधन',
    sharedResource: 'साझा संसाधन',
    metadata: 'जानकारी',
    page: 'पेज',
    resourceType: 'संसाधन प्रकार',
    connectedTo: 'इनसे जुड़ा',
    inTheMap: 'मैप में',
    links: 'लिंक',
    linkUnavailable: 'लिंक उपलब्ध नहीं है',
    branchingTo: 'आगे जुड़ता है',
    backTo: '{label} पर वापस जाएं',
    selectTool: 'उसका विवरण देखने के लिए कोई टूल चुनें।',
    category: 'श्रेणी',
    platform: 'प्लेटफ़ॉर्म',
    notListed: 'उपलब्ध नहीं',
    toolLinks: 'टूल लिंक',
    pigflixFilters: 'पिगफ्लिक्स फ़िल्टर',
    pigflixClassTabs: 'पिगफ्लिक्स कक्षा फ़िल्टर',
    pigflixFormatTabs: 'पिगफ्लिक्स फ़ॉर्मैट फ़िल्टर',
    class: 'कक्षा',
    format: 'फ़ॉर्मैट',
    picks: 'चयन',
    resourceSearchPlaceholder: 'संसाधन, पाठ्यक्रम, टूल खोजें...',
    pigflixSearchPlaceholder: 'ऐप, गेम, वीडियो खोजें...',
  },
};
function interpolateText(template, variables = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? '');
}

function translateUiText(language, key, variables = {}) {
  const dictionary = UI_TEXT[language] || UI_TEXT.en;
  return interpolateText(dictionary[key] || UI_TEXT.en[key] || key, variables);
}

function translateDisplayText(language, value, options = {}) {
  if (!value) {
    return '';
  }

  const localizedValue = typeof value === 'string' ? createLocalizedText(value) : value;
  return getLocalizedText(localizedValue, language, options);
}

function translatePathText(language, value) {
  if (!value) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((segment) => translateDisplayText(language, segment?.label || segment?.title || segment))
      .filter(Boolean)
      .join(' / ');
  }

  return value
    .split(' / ')
    .map((segment) => translateDisplayText(language, segment))
    .join(' / ');
}

function useLanguage() {
  return React.useContext(LanguageContext);
}

function App() {
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') {
      return 'en';
    }

    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === 'hi' ? 'hi' : 'en';
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/academics" element={<GraphPage page={sitemapPages.academics} />} />
          <Route path="/vocational-training" element={<GraphPage page={sitemapPages.vocational} />} />
          <Route path="/competitive-exams" element={<GraphPage page={sitemapPages.competition} />} />
          <Route path="/tools" element={<ToolsPage page={sitemapPages.tools} />} />
          <Route path="/pigflix" element={<PigflixPage page={sitemapPages.pigflix} />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </div>
    </LanguageContext.Provider>
  );
}

function buildHomeGraphLayout(graph) {
  const rootBox = { width: 104, height: 92 };
  const branchWidth = 244;
  const childWidth = 184;
  const childGap = 14;
  const laneGap = 38;
  const sidePadding = 28;
  const topPadding = 24;
  const rootX = sidePadding;
  const branchX = rootX + rootBox.width + 92;
  const childX = branchX + branchWidth + 132;

  const branchSlots = graph.branches.map((branch) => {
    const branchTitleLines = estimateLineCount(branch.title, 20, 2);
    const branchHeight = Math.max(82, 32 + branchTitleLines * 18 + 22);
    const branchBox = { width: branchWidth, height: branchHeight };
    const childCount = branch.children.length;
    const measuredChildren = branch.children.map((child) => {
      const childTitleLines = estimateLineCount(child.title, 18, 2);
      const childHeight = Math.max(62, 22 + childTitleLines * 18 + 18);

      return {
        ...child,
        width: childWidth,
        height: childHeight,
      };
    });
    const childrenHeight = childCount > 0
      ? measuredChildren.reduce((total, child, index) => total + child.height + (index > 0 ? childGap : 0), 0)
      : 62;

    return {
      ...branch,
      branchBox,
      measuredChildren,
      childrenHeight,
      laneHeight: Math.max(branchBox.height, childrenHeight),
    };
  });

  const totalLaneHeight =
    branchSlots.reduce((total, branch) => total + branch.laneHeight, 0) +
    Math.max(branchSlots.length - 1, 0) * laneGap;
  const height = totalLaneHeight + topPadding * 2;
  const width = childX + childWidth + sidePadding;
  const root = {
    ...graph.root,
    x: rootX,
    y: (height - rootBox.height) / 2,
    ...rootBox,
  };

  let cursorY = topPadding;
  const branches = branchSlots.map((branch) => {
    const branchY = cursorY + (branch.laneHeight - branch.branchBox.height) / 2;
    const childStartY = cursorY + (branch.laneHeight - branch.childrenHeight) / 2;
    let childCursorY = childStartY;
    const children = branch.measuredChildren.map((child) => {
      const positionedChild = {
        ...child,
        x: childX,
        y: childCursorY,
      };
      childCursorY += child.height + childGap;

      return positionedChild;
    });

    const layoutBranch = {
      ...branch,
      x: branchX,
      y: branchY,
      width: branch.branchBox.width,
      height: branch.branchBox.height,
      children,
    };

    cursorY += branch.laneHeight + laneGap;
    return layoutBranch;
  });

  return {
    width,
    height,
    root,
    branches,
    corridors: {
      rootToBranch: rootX + rootBox.width + 42,
      branchToChild: branchX + branchWidth + 58,
    },
  };
}

function getHomeGraphHighlight(graph, hoveredId) {
  const highlightedNodes = new Set();
  const highlightedEdges = new Set();

  if (!hoveredId) {
    return { highlightedNodes, highlightedEdges };
  }

  highlightedNodes.add(hoveredId);

  if (hoveredId === graph.root.id) {
    graph.branches.forEach((branch) => {
      highlightedEdges.add(`root:${branch.id}`);
    });
    return { highlightedNodes, highlightedEdges };
  }

  const branch = graph.branches.find((item) => item.id === hoveredId || item.children.some((child) => child.id === hoveredId));
  if (!branch) {
    return { highlightedNodes, highlightedEdges };
  }

  highlightedNodes.add(branch.id);
  highlightedEdges.add(`root:${branch.id}`);

  if (branch.id === hoveredId) {
    branch.children.forEach((child) => {
      highlightedEdges.add(`${branch.id}:${child.id}`);
    });
  } else {
    highlightedEdges.add(`${branch.id}:${hoveredId}`);
  }

  return { highlightedNodes, highlightedEdges };
}

function HomeUnifiedGraph({ graph }) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState(null);
  const layout = useMemo(() => buildHomeGraphLayout(graph), [graph]);
  const { highlightedNodes, highlightedEdges } = useMemo(
    () => getHomeGraphHighlight(graph, hoveredId),
    [graph, hoveredId],
  );

  const homeNodeClassName = (baseClass, nodeId) =>
    `${baseClass}${highlightedNodes.has(nodeId) ? ' is-hovered' : hoveredId && !highlightedNodes.has(nodeId) ? ' is-muted' : ''}`;

  const homeEdgeClassName = (edgeId) =>
    `graph-edge${highlightedEdges.has(edgeId) ? ' is-hovered' : hoveredId && !highlightedEdges.has(edgeId) ? ' is-muted' : ''}`;

  return (
    <div className="home-graph-frame">
      <div className="home-unified-graph" style={{ width: `${layout.width}px`, height: `${layout.height}px` }}>
        <svg className="graph-lines home-graph-lines" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.branches.map((branch) => {
            const rootToBranch = getDirectionalEdgeAnchors(layout.root, branch, 0, 0);

            return (
              <g key={branch.id}>
                <path
                  className={homeEdgeClassName(`root:${branch.id}`)}
                  d={buildOrthogonalEdgePath(rootToBranch.source, rootToBranch.target, layout.corridors.rootToBranch)}
                />

                {branch.children.map((child) => {
                  const branchToChild = getDirectionalEdgeAnchors(branch, child, 0, 0);

                  return (
                    <path
                      key={`${branch.id}:${child.id}`}
                      className={homeEdgeClassName(`${branch.id}:${child.id}`)}
                      d={buildOrthogonalEdgePath(branchToChild.source, branchToChild.target, layout.corridors.branchToChild)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>

        <div
          className={`home-root-mark${highlightedNodes.has(graph.root.id) ? ' is-hovered' : hoveredId && !highlightedNodes.has(graph.root.id) ? ' is-muted' : ''}`}
          style={{
            left: `${layout.root.x}px`,
            top: `${layout.root.y}px`,
            width: `${layout.root.width}px`,
            height: `${layout.root.height}px`,
            animationDelay: '40ms',
          }}
          onMouseEnter={() => setHoveredId(graph.root.id)}
          onMouseLeave={() => setHoveredId(null)}
          onFocus={() => setHoveredId(graph.root.id)}
          onBlur={() => setHoveredId(null)}
        >
          <img className="home-root-logo" src="/pigsfield-logo.svg" alt="PIGSFIELD" />
        </div>

        {layout.branches.map((branch, branchIndex) => (
          <React.Fragment key={branch.id}>
            <button
              type="button"
              className={homeNodeClassName('graph-node graph-node--category home-graph-node home-graph-node--branch', branch.id)}
              style={{
                left: `${branch.x}px`,
                top: `${branch.y}px`,
                width: `${branch.width}px`,
                height: `${branch.height}px`,
                animationDelay: `${120 + branchIndex * 90}ms`,
              }}
              onClick={() => navigate(branch.path)}
              onMouseEnter={() => setHoveredId(branch.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(branch.id)}
              onBlur={() => setHoveredId(null)}
            >
              <span className="graph-node-surface" aria-hidden="true" />
              <span className="graph-node-content">
                <span className="graph-node-title">{translateDisplayText(language, branch.titleText || branch.title, { strict: true })}</span>
              </span>
            </button>

            {branch.children.map((child, childIndex) => (
              <button
                type="button"
                key={child.id}
                className={homeNodeClassName('graph-node graph-node--subcategory home-graph-node home-graph-node--child', child.id)}
                style={{
                  left: `${child.x}px`,
                  top: `${child.y}px`,
                  width: `${child.width}px`,
                  height: `${child.height}px`,
                  animationDelay: `${250 + branchIndex * 90 + childIndex * 70}ms`,
                }}
                onClick={() => navigate(child.path, { state: child.state })}
                onMouseEnter={() => setHoveredId(child.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(child.id)}
                onBlur={() => setHoveredId(null)}
              >
                <span className="graph-node-surface" aria-hidden="true" />
                <span className="graph-node-content">
                  <span className="graph-node-title">{translateDisplayText(language, child.titleText || child.title, { strict: true })}</span>
                </span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function HomePage() {
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return siteSearchIndex
      .filter((entry) =>
        [entry.title, entry.summary, entry.context, entry.pageTitle]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(q)),
      )
      .slice(0, 14);
  }, [q]);

  return (
    <div className="page-shell">
      <TopBar
        query={query}
        setQuery={setQuery}
        searchVariant="home"
        searchPlaceholder={translateUiText(language, 'resourceSearchPlaceholder')}
      />
      <main className="page-main home-main">

        {q ? (
          <SectionSearchResults
            title={translateUiText(language, 'searchResults')}
            items={results}
            emptyLabel={translateUiText(language, 'noResults', { query })}
          />
        ) : null}

        <section className="home-graph-shell" aria-label="PIGSFIELD system map">
          <HomeUnifiedGraph graph={homeGraph} />
        </section>

        <p className="home-guidance">
          {language === 'hi' ? 'पूरा मैप देखने के लिए किसी शाखा को चुनें।' : 'Select a branch to explore the full map.'}
        </p>
        <p className="home-signoff">
          {language === 'hi'
            ? 'इस प्लेटफ़ॉर्म पर ज्ञान को सरल तरीके से खोजने के लिए बनाया गया है।'
            : 'Built to simplify how knowledge is explored on this platform.'}
        </p>
      </main>
    </div>
  );
}

const ANNOTATION_SELECTION_PREFIX = 'annotation:';

function getAnnotationSelectionId(annotationId) {
  return `${ANNOTATION_SELECTION_PREFIX}${annotationId}`;
}

function getAnnotationIdFromSelection(selectionId) {
  return typeof selectionId === 'string' && selectionId.startsWith(ANNOTATION_SELECTION_PREFIX)
    ? selectionId.slice(ANNOTATION_SELECTION_PREFIX.length)
    : null;
}

function getAnnotationRelatedNodes(page, annotation) {
  if (Array.isArray(annotation.relatedNodeIds)) {
    return annotation.relatedNodeIds
      .map((nodeId) => page.nodeMap.get(nodeId))
      .filter(Boolean)
      .sort((a, b) => (a.y - b.y) || a.title.localeCompare(b.title));
  }

  const annotationTitle = formatAnnotation(annotation.title);

  return page.nodes
    .filter((node) => formatAnnotation(node.sharedGroup || '') === annotationTitle)
    .sort((a, b) => (a.y - b.y) || a.title.localeCompare(b.title));
}

function buildGraphAnnotationItems(page) {
  const sharedClusterItems = buildSharedClusterDefinitions(page).map((cluster) => ({
    id: `annotation-${cluster.key}`,
    type: 'shared-group',
    title: formatAnnotation(cluster.label),
    titleText: createLocalizedText(formatAnnotation(cluster.label)),
    targetNodeId: cluster.nodes[0]?.id || null,
    memberNodeIds: cluster.nodes.map((node) => node.id),
    relatedNodeIds: cluster.nodes.map((node) => node.id),
  }));
  const existingTitles = new Set(sharedClusterItems.map((item) => item.title));
  const manualItems = page.annotations
    .map((annotation) => formatAnnotation(annotation.title))
    .filter((title) => !existingTitles.has(title))
    .map((title) => ({
      id: `annotation-manual-${normalizeGraphKey(title)}`,
      type: 'shared-group',
      title,
      titleText: createLocalizedText(title),
      targetNodeId:
        page.nodes.find((node) => formatAnnotation(node.sharedGroup || '') === title)?.id || null,
      memberNodeIds: page.nodes
        .filter((node) => formatAnnotation(node.sharedGroup || '') === title)
        .map((node) => node.id),
      relatedNodeIds: page.nodes
        .filter((node) => formatAnnotation(node.sharedGroup || '') === title)
        .map((node) => node.id),
    }))
    .filter((item) => item.relatedNodeIds.length > 0);

  return [...sharedClusterItems, ...manualItems].sort((a, b) => a.title.localeCompare(b.title));
}

function createNodeNavigationTarget(node) {
  if (!node) {
    return null;
  }

  return {
    id: node.id,
    type: 'node',
    label: node.titleText || createLocalizedText(node.title),
  };
}

function createPageOverviewTarget(page) {
  return {
    type: 'page-overview',
    label: page.titleText || createLocalizedText(page.title),
  };
}

function getBackNavigationTarget(page, node) {
  if (!node) {
    return null;
  }

  const firstPath = getNodePathTargets(page, node.id).find((path) => path.length > 0) || [];
  const directParentId = firstPath.length > 1 ? firstPath[firstPath.length - 2]?.id : null;
  const directParent = directParentId ? page.nodeMap.get(directParentId) : null;

  if (directParent && !directParent.hidden) {
    return createNodeNavigationTarget(directParent);
  }

  const fallbackParent = node.parentIds
    .map((parentId) => page.nodeMap.get(parentId))
    .filter((parent) => parent && !parent.hidden)
    .sort((a, b) => a.y - b.y || a.title.localeCompare(b.title))[0];

  if (fallbackParent) {
    return createNodeNavigationTarget(fallbackParent);
  }

  return createPageOverviewTarget(page);
}

function resolveSelectionId(target) {
  if (!target) {
    return null;
  }

  if (typeof target === 'string') {
    return target;
  }

  if (target.type === 'shared-group') {
    return getAnnotationSelectionId(target.id);
  }

  if (target.type === 'page-overview') {
    return null;
  }

  return target.targetNodeId || target.id || null;
}

function getSelectionTargetNodeIds(page, selectedId, annotationItems) {
  const annotationId = getAnnotationIdFromSelection(selectedId);
  if (annotationId) {
    const annotation = annotationItems.find((item) => item.annotation.id === annotationId)?.annotation || null;
    return annotation ? getAnnotationRelatedNodes(page, annotation).map((node) => node.id) : [];
  }

  return selectedId && page.nodeMap.has(selectedId) ? [selectedId] : [];
}

function getNodeFocusBounds(layout, nodeIds) {
  const boxes = nodeIds
    .map((nodeId) => layout.positions.get(nodeId))
    .filter(Boolean)
    .map((box) => ({
      left: box.x + layout.offsetX,
      top: box.y + layout.offsetY,
      right: box.x + box.width + layout.offsetX,
      bottom: box.y + box.height + layout.offsetY,
    }));

  if (boxes.length === 0) {
    return null;
  }

  return boxes.reduce(
    (bounds, box) => ({
      left: Math.min(bounds.left, box.left),
      top: Math.min(bounds.top, box.top),
      right: Math.max(bounds.right, box.right),
      bottom: Math.max(bounds.bottom, box.bottom),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
}

function buildCombinedHighlightState(states = []) {
  const nodeIds = new Set();
  const edgeIds = new Set();

  states.forEach((state) => {
    state?.nodeIds?.forEach((id) => nodeIds.add(id));
    state?.edgeIds?.forEach((id) => edgeIds.add(id));
  });

  return { nodeIds, edgeIds };
}

function GraphPage({ page }) {
  const { language } = useLanguage();
  const location = useLocation();
  const incomingQuery = typeof location.state?.seedQuery === 'string' ? location.state.seedQuery : '';
  const incomingSelection = typeof location.state?.focusId === 'string' ? location.state.focusId : null;
  const [query, setQuery] = useState(incomingQuery);
  const [selectedId, setSelectedId] = useState(incomingSelection || null);
  const [hoveredId, setHoveredId] = useState(null);
  const graphScrollRef = useRef(null);
  const q = query.trim().toLowerCase();
  const layout = useMemo(() => buildGraphLayout(page, language), [page, language]);

  useEffect(() => {
    setQuery(incomingQuery || '');
    setSelectedId(incomingSelection || null);
  }, [incomingQuery, incomingSelection, page.pageKey]);

  const matches = useMemo(
    () =>
      q
        ? page.nodes.filter((node) => node.searchableText.toLowerCase().includes(q))
        : [],
    [page, q],
  );
  const annotationItems = useMemo(
    () => buildGraphAnnotationItems(page)
      .map((annotation) => ({
        annotation,
        title: annotation.title,
        titleText: annotation.titleText || createLocalizedText(annotation.title),
        relatedCount: getAnnotationRelatedNodes(page, annotation).length,
      }))
      .filter((item) => item.relatedCount > 0),
    [page],
  );
  const selectedAnnotation = useMemo(() => {
    const annotationId = getAnnotationIdFromSelection(selectedId);
    return annotationId ? annotationItems.find((item) => item.annotation.id === annotationId)?.annotation || null : null;
  }, [annotationItems, selectedId]);
  const selectedAnnotationRelatedNodeIds = useMemo(
    () => new Set(selectedAnnotation ? getAnnotationRelatedNodes(page, selectedAnnotation).map((node) => node.id) : []),
    [page, selectedAnnotation],
  );
  const selectedAnnotationState = useMemo(
    () =>
      buildCombinedHighlightState(
        selectedAnnotation
          ? getAnnotationRelatedNodes(page, selectedAnnotation).map((node) => collectAncestorState(page, node.id))
          : [],
      ),
    [page, selectedAnnotation],
  );

  const selectedNode = selectedAnnotation
    ? null
    : page.nodeMap.get(selectedId) ||
      (matches[0] ? page.nodeMap.get(matches[0].id) : null) ||
      null;

  useEffect(() => {
    if (!import.meta.env.DEV || language !== 'hi') {
      return;
    }

    const missing = validateHindiCoverage({
      ...page,
      sharedGroups: annotationItems.map((item) => ({
        id: item.annotation.id,
        labelText: item.titleText,
      })),
    });

    if (missing.length > 0) {
      console.warn(`[pigsfield] Missing Hindi graph translations for ${page.pageKey}:`, missing);
    }
  }, [annotationItems, language, page]);

  useEffect(() => {
    if (!selectedId || typeof window === 'undefined') {
      return;
    }

    const targetNodeIds = getSelectionTargetNodeIds(page, selectedId, annotationItems);
    const bounds = getNodeFocusBounds(layout, targetNodeIds);
    if (!bounds || !graphScrollRef.current) {
      return;
    }

    const container = graphScrollRef.current;
    const desiredLeft = Math.max(0, (bounds.left + bounds.right) / 2 - container.clientWidth / 2);
    const containerPageTop = container.getBoundingClientRect().top + window.scrollY;
    const desiredTop = Math.max(0, containerPageTop + (bounds.top + bounds.bottom) / 2 - window.innerHeight / 2);
    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({
        left: desiredLeft,
        behavior: 'smooth',
      });
      window.scrollTo({
        top: desiredTop,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [annotationItems, layout, page, selectedId]);

  const handleSelect = useCallback((target) => {
    if (!target || target.type === 'page-overview') {
      setSelectedId(null);

      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (graphScrollRef.current) {
            const container = graphScrollRef.current;
            container.scrollTo({
              left: 0,
              behavior: 'smooth',
            });
            const targetTop = Math.max(0, container.getBoundingClientRect().top + window.scrollY - 96);
            window.scrollTo({
              top: targetTop,
              behavior: 'smooth',
            });
          }
        });
      }
      return;
    }

    const nextSelectionId = resolveSelectionId(target);
    if (!nextSelectionId) {
      return;
    }

    setSelectedId(nextSelectionId);
  }, []);

  return (
    <div className="page-shell">
      <TopBar query={query} setQuery={setQuery} />
      <main className="page-main map-main">
        <section className="page-heading map-page-heading">
          <h1>{translateDisplayText(language, page.titleText || page.title, { strict: true })}</h1>
        </section>

        <section className="map-layout">
          <DetailPanel page={page} node={selectedNode} annotation={selectedAnnotation} onSelect={handleSelect} />

          <div className="map-column">
            {q ? (
              <SectionSearchResults
                title={translateUiText(language, 'searchResults')}
                items={matches.map((node) => ({
                  id: node.id,
                  title: node.title,
                  titleText: node.titleText || createLocalizedText(node.title),
                  summary: node.description,
                  summaryText: node.descriptionText || (node.description ? createLocalizedText(node.description) : null),
                  context: getNodePaths(page, node.id)[0]?.join(' / '),
                  contextSegments: getNodePathTargets(page, node.id)[0] || [],
                }))}
                emptyLabel={translateUiText(language, 'noMapNodes', { query })}
                onSelect={handleSelect}
                activeId={selectedNode?.id}
              />
            ) : null}

            {annotationItems.length > 0 ? (
              <section className="map-annotation-bar" aria-label="Shared groups">
                <p className="map-annotation-kicker">{translateUiText(language, 'sharedGroups')}</p>
                <div className="map-annotation-list">
                  {annotationItems.map((item) => {
                    const isActive = selectedAnnotation?.id === item.annotation.id;

                    return (
                      <button
                        type="button"
                        key={item.annotation.id}
                        className={`map-annotation-chip${isActive ? ' is-active' : ''}`}
                        onClick={() => handleSelect(item.annotation)}
                      >
                        {translateDisplayText(language, item.titleText || item.title, { strict: true })}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div className="graph-scroll" ref={graphScrollRef}>
              <GraphCanvas
                page={page}
                layout={layout}
                query={q}
                selectedId={selectedNode?.id}
                selectedAnnotationRelatedNodeIds={selectedAnnotationRelatedNodeIds}
                selectedAnnotationState={selectedAnnotationState}
                onSelect={handleSelect}
                hoveredId={hoveredId}
                onHover={setHoveredId}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function GraphCanvas({
  page,
  layout,
  query,
  selectedId,
  selectedAnnotationRelatedNodeIds,
  selectedAnnotationState,
  onSelect,
  hoveredId,
  onHover,
}) {
  const { language } = useLanguage();
  const matchingIds = new Set(
    query
      ? page.nodes
          .filter((node) => node.searchableText.toLowerCase().includes(query))
          .map((node) => node.id)
      : [],
  );
  const selectedBranch = useMemo(
    () => collectAncestorState(page, selectedId),
    [page, selectedId],
  );
  const hoveredBranch = useMemo(
    () => collectDirectConnectionState(page, hoveredId),
    [page, hoveredId],
  );
  const hasSelection = Boolean(selectedId || selectedAnnotationState?.nodeIds?.size);
  const annotationObstacles = useMemo(
    () =>
      layout.annotationObstacles.map((box) => ({
        ...box,
        x: box.x + layout.offsetX,
        y: box.y + layout.offsetY,
      })),
    [layout],
  );
  const nodeObstacles = useMemo(
    () =>
      new Map(
        [...layout.nodeObstacleBoxes.entries()].map(([nodeId, box]) => [
          nodeId,
          {
            ...box,
            x: box.x + layout.offsetX,
            y: box.y + layout.offsetY,
          },
        ]),
      ),
    [layout],
  );

  return (
    <div className="graph-canvas" style={{ width: `${layout.width}px`, height: `${layout.height}px` }}>
      <svg className="graph-lines" width={layout.width} height={layout.height} aria-hidden="true">
        {page.edges
          .filter((edge) => !layout.sharedClusterByNode.has(edge.target))
          .map((edge) => {
            const source = page.nodeMap.get(edge.source);
            const target = page.nodeMap.get(edge.target);
            const sourceBox = layout.positions.get(source.id);
            const targetBox = layout.positions.get(target.id);
            const { source: sourceAnchor, target: targetAnchor } = getDirectionalEdgeAnchors(
              sourceBox,
              targetBox,
              layout.offsetX,
              layout.offsetY,
            );
            const edgeObstacles = [...annotationObstacles];

            nodeObstacles.forEach((box, nodeId) => {
              if (nodeId !== source.id && nodeId !== target.id) {
                edgeObstacles.push(box);
              }
            });

            const d = buildOrthogonalEdgePath(
              sourceAnchor,
              targetAnchor,
              getEdgeRoute(layout, edge, sourceAnchor, targetAnchor),
              edgeObstacles,
            );
            const isAnnotationEdge = selectedAnnotationState?.edgeIds?.has(edge.id);
            const isBranch = selectedBranch.edgeIds.has(edge.id) || isAnnotationEdge;
            const isHovered = hoveredBranch.edgeIds.has(edge.id);
            const isMuted = hasSelection && !isBranch && !isHovered;

            return (
              <path
                key={edge.id}
                className={`graph-edge${source.isShared || target.isShared ? ' is-shared' : ''}${edge.synthetic ? ' is-synthetic' : ''}${isBranch ? ' is-branch' : ''}${isHovered ? ' is-hovered' : ''}${isMuted ? ' is-muted' : ''}`}
                d={d}
              />
            );
          })}

        {layout.sharedClusters.map((cluster) => {
          const parentReferenceY = average(
            cluster.nodeIds.map((nodeId) => centerY(layout.positions.get(nodeId)) + layout.offsetY),
          );
          const nodeReferenceY = average(
            cluster.parentIds.map((parentId) => centerY(layout.positions.get(parentId)) + layout.offsetY),
          );
          const parentAnchors = cluster.parentIds.map((parentId) => {
            const box = layout.positions.get(parentId);
            return {
              id: parentId,
              anchor: getNodeSideAnchor(box, 'right', layout.offsetX, layout.offsetY, parentReferenceY),
            };
          });
          const nodeAnchors = cluster.nodeIds.map((nodeId) => {
            const box = layout.positions.get(nodeId);
            return {
              id: nodeId,
              anchor: getNodeSideAnchor(box, 'left', layout.offsetX, layout.offsetY, nodeReferenceY),
            };
          });
          const allAnchorsY = [...parentAnchors.map((item) => item.anchor.y), ...nodeAnchors.map((item) => item.anchor.y)];
          const edgeIds = cluster.edgeIds;
          const isBranch =
            edgeIds.some((id) => selectedBranch.edgeIds.has(id)) ||
            edgeIds.some((id) => selectedAnnotationState?.edgeIds?.has(id)) ||
            cluster.nodeIds.some((nodeId) => selectedAnnotationRelatedNodeIds?.has(nodeId));
          const isHovered = edgeIds.some((id) => hoveredBranch.edgeIds.has(id));
          const isMuted = hasSelection && !isBranch && !isHovered;
          const railClass = `graph-edge is-shared is-shared-rail${isBranch ? ' is-branch' : ''}${isHovered ? ' is-hovered' : ''}${isMuted ? ' is-muted' : ''}`;

          return (
            <g key={cluster.key}>
              <path
                className={railClass}
                d={`M ${cluster.railX + layout.offsetX} ${Math.min(...allAnchorsY)} V ${Math.max(...allAnchorsY)}`}
              />
              {parentAnchors.map((parent) => (
                <path
                  key={`${cluster.key}-parent-${parent.id}`}
                  className={railClass}
                  d={`M ${parent.anchor.x} ${parent.anchor.y} H ${cluster.railX + layout.offsetX}`}
                />
              ))}
              {nodeAnchors.map((nodeAnchor) => (
                <path
                  key={`${cluster.key}-node-${nodeAnchor.id}`}
                  className={railClass}
                  d={`M ${cluster.railX + layout.offsetX} ${nodeAnchor.anchor.y} H ${nodeAnchor.anchor.x}`}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {page.nodes.map((node) => {
        const box = layout.positions.get(node.id);
        const showDescription = page.pageKey === 'academics' && node.kind === 'resource' && node.description;
        const isAnnotationNode = selectedAnnotationState?.nodeIds?.has(node.id);
        const isBranch = selectedBranch.nodeIds.has(node.id) || isAnnotationNode;
        const isHovered = hoveredBranch.nodeIds.has(node.id);
        const isMuted = hasSelection && !isBranch && !isHovered && selectedId !== node.id;

        return (
          <button
            key={node.id}
            id={`graph-node-${node.id}`}
            type="button"
            className={`graph-node graph-node--${node.kind}${node.isShared ? ' is-shared' : ''}${selectedId === node.id ? ' is-selected' : ''}${matchingIds.has(node.id) ? ' is-match' : ''}${isBranch ? ' is-branch' : ''}${isHovered ? ' is-hovered' : ''}${isMuted ? ' is-muted' : ''}`}
            style={{
              left: `${box.x + layout.offsetX}px`,
              top: `${box.y + layout.offsetY}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
            onClick={() => onSelect(node.id)}
            onMouseEnter={() => onHover(node.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(node.id)}
            onBlur={() => onHover(null)}
          >
            <span className="graph-node-surface" aria-hidden="true" />
            <span className="graph-node-content">
              {node.isShared ? <span className="graph-node-kicker">{translateDisplayText(language, 'Shared')}</span> : null}
              <span className="graph-node-title">{translateDisplayText(language, node.titleText || node.title, { strict: true })}</span>
              {showDescription ? (
                <span className="graph-node-description">{translateDisplayText(language, node.descriptionText || node.description, { strict: true })}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function dedupeNavigationPaths(paths = []) {
  const seen = new Set();

  return paths.filter((path) => {
    const key = path.map((segment) => `${segment.type}:${segment.id}`).join('>');
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function DetailPathList({ paths, onSelect }) {
  const { language } = useLanguage();

  return (
    <ul className="detail-path-list">
      {paths.map((path) => (
        <li key={path.map((segment) => segment.id).join('>')}>
          <div className="detail-path-row">
            {path.map((segment, index) => (
              <React.Fragment key={`${segment.id}-${index}`}>
                <button
                  type="button"
                  className="detail-path-button"
                  onClick={() => onSelect(segment)}
                >
                  {translateDisplayText(language, segment.label, { strict: true })}
                </button>
                {index < path.length - 1 ? <span className="detail-path-separator">/</span> : null}
              </React.Fragment>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DetailPanel({ page, node, annotation, onSelect }) {
  const { language } = useLanguage();
  const overviewAnnotations = buildGraphAnnotationItems(page)
    .map((item) => ({
      ...item,
      relatedCount: getAnnotationRelatedNodes(page, item).length,
    }))
    .filter((item) => item.relatedCount > 0);
  const backTarget = annotation
    ? createPageOverviewTarget(page)
    : node
      ? getBackNavigationTarget(page, node)
      : null;

  if (annotation) {
    const relatedNodes = getAnnotationRelatedNodes(page, annotation);
    const relatedPathTargets = dedupeNavigationPaths(
      relatedNodes.flatMap((relatedNode) =>
        getNodePathTargets(page, relatedNode.id)
          .map((path) => path.slice(0, -1))
          .filter((path) => path.length > 0),
      ),
    );

    return (
      <aside className="detail-panel">
        <div className="detail-panel-inner" key={annotation.id}>
          {backTarget ? (
            <button type="button" className="detail-back-button" onClick={() => onSelect(backTarget)}>
              {translateUiText(language, 'backTo', {
                label: translateDisplayText(language, backTarget.label, { strict: true }),
              })}
            </button>
          ) : null}
          <p className="detail-kicker">{translateUiText(language, 'sharedGrouping')}</p>
          <h2>{translateDisplayText(language, annotation.titleText || formatAnnotation(annotation.title), { strict: true })}</h2>
          <p className="detail-copy">
            {translateUiText(language, 'sharedGroupingCopy', {
              pageTitle: translateDisplayText(language, page.titleText || page.title, { strict: true }),
            })}
          </p>

          {relatedPathTargets.length > 0 ? (
            <div className="detail-group">
              <h3>{translateUiText(language, 'appearsAcross')}</h3>
              <DetailPathList paths={relatedPathTargets} onSelect={onSelect} />
            </div>
          ) : null}

          {relatedNodes.length > 0 ? (
            <div className="detail-group">
              <h3>{translateUiText(language, 'relatedResources')}</h3>
              <ul>
                {relatedNodes.map((relatedNode) => (
                  <li key={relatedNode.id}>
                    <button
                      type="button"
                      className="detail-nav-button"
                      onClick={() => onSelect(createNodeNavigationTarget(relatedNode))}
                    >
                      {translateDisplayText(language, relatedNode.titleText || relatedNode.title, { strict: true })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="detail-panel">
        <div className="detail-panel-inner">
          <p className="detail-kicker">{translateUiText(language, 'pageOverview')}</p>
          <h2>{translateDisplayText(language, page.titleText || page.title, { strict: true })}</h2>
          <p className="detail-copy">{translateUiText(language, 'pageOverviewCopy')}</p>

          {page.rootChildren.length > 0 ? (
            <div className="detail-group">
              <h3>{translateUiText(language, 'startingPoints')}</h3>
              <ul>
                {page.rootChildren.map((child) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      className="detail-nav-button"
                      onClick={() => onSelect(createNodeNavigationTarget(child))}
                    >
                      {translateDisplayText(language, child.titleText || child.title, { strict: true })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {overviewAnnotations.length > 0 ? (
            <div className="detail-group">
              <h3>{translateUiText(language, 'sharedGroupings')}</h3>
              <ul>
                {overviewAnnotations.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="detail-nav-button"
                      onClick={() => onSelect(item)}
                    >
                      {translateDisplayText(language, item.titleText || item.title, { strict: true })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  const pathTargets = dedupeNavigationPaths(getNodePathTargets(page, node.id));
  const parentPathTargets = dedupeNavigationPaths(
    pathTargets.map((path) => path.slice(0, -1)).filter((path) => path.length > 0),
  );
  const resourcePaths = node.isShared ? parentPathTargets : pathTargets;
  const children = node.childIds
    .map((childId) => page.nodeMap.get(childId))
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
  const showActions = node.kind === 'resource';
  const links = node.links || [];

  return (
    <aside className="detail-panel">
      <div className="detail-panel-inner" key={node.id}>
        {backTarget ? (
          <button type="button" className="detail-back-button" onClick={() => onSelect(backTarget)}>
            {translateUiText(language, 'backTo', {
              label: translateDisplayText(language, backTarget.label, { strict: true }),
            })}
          </button>
        ) : null}
        <p className="detail-kicker">
          {node.isShared ? translateUiText(language, 'sharedResource') : formatKindLabel(node.kind, language)}
        </p>
        <h2>{translateDisplayText(language, node.titleText || node.title, { strict: true })}</h2>
        {node.description ? <p className="detail-copy">{translateDisplayText(language, node.descriptionText || node.description, { strict: true })}</p> : null}
        {!node.description && node.sharedGroup ? (
          <p className="detail-copy">{translateDisplayText(language, node.sharedGroupText || formatAnnotation(node.sharedGroup), { strict: true })}</p>
        ) : null}

        <div className="detail-group">
          <h3>{translateUiText(language, 'metadata')}</h3>
          <ul>
            <li>{translateUiText(language, 'page')}: {translateDisplayText(language, page.titleText || page.title, { strict: true })}</li>
            <li>{translateUiText(language, 'resourceType')}: {formatDetailType(node, language)}</li>
          </ul>
        </div>

        {resourcePaths.length > 0 ? (
          <div className="detail-group">
            <h3>{node.isShared ? translateUiText(language, 'connectedTo') : translateUiText(language, 'inTheMap')}</h3>
            <DetailPathList paths={resourcePaths} onSelect={onSelect} />
          </div>
        ) : null}

        {showActions ? (
          <div className="detail-group detail-group--actions">
            <h3>{translateUiText(language, 'links')}</h3>
            {links.length ? (
              <div className="detail-action-list">
                {links.map((link) => (
                  <a
                    key={`${node.id}-${link.href}`}
                    className="detail-action-link"
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{link.label}</span>
                    <span className="detail-action-meta">{formatActionHost(link.href)}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="detail-action-empty">{translateUiText(language, 'linkUnavailable')}</p>
            )}
          </div>
        ) : null}

        {children.length > 0 ? (
          <div className="detail-group">
            <h3>{translateUiText(language, 'branchingTo')}</h3>
              <ul>
                {children.map((child) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      className="detail-nav-button"
                      onClick={() => onSelect(createNodeNavigationTarget(child))}
                    >
                      {translateDisplayText(language, child.titleText || child.title, { strict: true })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
        ) : null}
      </div>
    </aside>
  );
}

function ToolsPage({ page }) {
  const { language } = useLanguage();
  const location = useLocation();
  const incomingQuery = typeof location.state?.seedQuery === 'string' ? location.state.seedQuery : '';
  const incomingSelection = typeof location.state?.focusId === 'string' ? location.state.focusId : null;
  const [query, setQuery] = useState(incomingQuery);
  const [selectedId, setSelectedId] = useState(
    incomingSelection || page.categories[0]?.tools[0]?.id || null,
  );
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (incomingQuery) {
      setQuery(incomingQuery);
    }

    if (incomingSelection) {
      setSelectedId(incomingSelection);
    }
  }, [incomingQuery, incomingSelection]);

  const filteredCategories = useMemo(() => {
    if (!q) return page.categories;
    return page.categories
      .map((category) => ({
        ...category,
        tools: category.tools.filter(
          (tool) => tool.searchableText.toLowerCase().includes(q),
        ),
      }))
      .filter((category) => category.tools.length > 0);
  }, [page.categories, q]);

  const searchItems = useMemo(
    () =>
      filteredCategories.flatMap((category) =>
        category.tools.map((tool) => ({
          id: tool.id,
          title: tool.title,
          titleText: tool.titleText || createLocalizedText(tool.title),
          summary: tool.description || category.title,
          summaryText:
            tool.descriptionText ||
            tool.categoryText ||
            (tool.description ? createLocalizedText(tool.description) : createLocalizedText(category.title)),
          context: `${category.title} / ${tool.title}`,
          contextSegments: [
            { id: category.id, type: 'tool-category', label: category.titleText || createLocalizedText(category.title) },
            { id: tool.id, type: 'tool', label: tool.titleText || createLocalizedText(tool.title) },
          ],
        })),
      ),
    [filteredCategories],
  );

  const selectedTool =
    findTool(page, selectedId) ||
    (searchItems[0] ? findTool(page, searchItems[0].id) : null);

  return (
    <div className="page-shell">
      <TopBar query={query} setQuery={setQuery} />
      <main className="page-main map-main">
        <section className="page-heading map-page-heading">
          <h1>{translateDisplayText(language, page.titleText || page.title, { strict: true })}</h1>
        </section>

        <section className="map-layout tools-layout">
          <ToolDetailPanel tool={selectedTool} />

          <div className="map-column">
            {q ? (
              <SectionSearchResults
                title={translateUiText(language, 'searchResults')}
                items={searchItems}
                emptyLabel={translateUiText(language, 'noTools', { query })}
                onSelect={(id) => setSelectedId(id)}
                activeId={selectedTool?.id}
              />
            ) : null}

            <div className="tools-map">
              {filteredCategories.map((category) => (
                <section className="tools-category" key={category.id}>
                  <div className="tools-category-head">
                    <h2>{translateDisplayText(language, category.titleText || category.title, { strict: true })}</h2>
                  </div>

                  <div className="tools-category-body">
                    <div className="tools-category-line" aria-hidden="true" />
                    <div className="tool-grid">
                      {category.tools.map((tool) => (
                        <button
                          type="button"
                          key={tool.id}
                          className={`tool-card${selectedTool?.id === tool.id ? ' is-selected' : ''}`}
                          onClick={() => setSelectedId(tool.id)}
                        >
                          <span className="tool-card-title">{translateDisplayText(language, tool.titleText || tool.title, { strict: true })}</span>
                          <span className="tool-slot-list">
                            {TOOL_SLOT_LABELS.map((slot) => (
                              <span
                                key={`${tool.id}-${slot.key}`}
                                className={`tool-slot${tool.slots[slot.key] ? '' : ' is-disabled'}`}
                              >
                                {translateDisplayText(language, slot.label)}
                              </span>
                            ))}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ToolDetailPanel({ tool }) {
  const { language } = useLanguage();
  if (!tool) {
    return (
      <aside className="detail-panel">
        <div className="detail-panel-inner">
          <p className="detail-empty">{translateUiText(language, 'selectTool')}</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <div className="detail-panel-inner" key={tool.id}>
        <p className="detail-kicker">{translateDisplayText(language, tool.categoryText || tool.category, { strict: true })}</p>
        <h2>{translateDisplayText(language, tool.titleText || tool.title, { strict: true })}</h2>
        {tool.description ? <p className="detail-copy">{translateDisplayText(language, tool.descriptionText || tool.description, { strict: true })}</p> : null}

        <div className="detail-group">
          <h3>{translateUiText(language, 'metadata')}</h3>
          <ul>
            <li>{translateUiText(language, 'category')}: {translateDisplayText(language, tool.categoryText || tool.category, { strict: true })}</li>
            <li>{translateUiText(language, 'platform')}: {tool.platform ? translateDisplayText(language, tool.platformText || tool.platform, { strict: true }) : translateUiText(language, 'notListed')}</li>
          </ul>
        </div>

        <div className="detail-group detail-group--actions">
          <h3>{translateUiText(language, 'toolLinks')}</h3>
          {tool.links?.length ? (
            <div className="detail-action-list">
              {tool.links.map((link) => (
                <a
                  key={`${tool.id}-${link.href}`}
                  className="detail-action-link"
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{translateDisplayText(language, link.label)}</span>
                  <span className="detail-action-meta">{formatActionHost(link.href)}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="detail-action-empty">{translateUiText(language, 'linkUnavailable')}</p>
          )}
        </div>
      </div>
    </aside>
  );
}

function PigflixPage({ page }) {
  const { language } = useLanguage();
  const location = useLocation();
  const incomingQuery = typeof location.state?.seedQuery === 'string' ? location.state.seedQuery : '';
  const incomingSelection = typeof location.state?.focusId === 'string' ? location.state.focusId : null;
  const incomingTab = typeof location.state?.activeTabId === 'string' ? location.state.activeTabId : null;
  const incomingContentTab =
    typeof location.state?.contentTabId === 'string'
      ? location.state.contentTabId
      : (typeof location.state?.sourceTabId === 'string' ? location.state.sourceTabId : null);
  const [query, setQuery] = useState(incomingQuery);
  const [selectedId, setSelectedId] = useState(incomingSelection || null);
  const [activeTabId, setActiveTabId] = useState(incomingTab || page.classTabs[0]?.id || null);
  const [activeContentTabId, setActiveContentTabId] = useState(incomingContentTab || null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (incomingQuery) {
      setQuery(incomingQuery);
    }

    if (incomingSelection) {
      setSelectedId(incomingSelection);
    }

    if (incomingTab) {
      setActiveTabId(incomingTab);
    }

    if (incomingContentTab) {
      setActiveContentTabId(incomingContentTab);
    }
  }, [incomingQuery, incomingSelection, incomingTab, incomingContentTab]);

  const filteredTabs = useMemo(() => {
    if (!q) {
      return page.classTabs;
    }

    return page.classTabs
      .map((tab) => ({
        ...tab,
        subjects: tab.subjects
          .map((subject) => ({
            ...subject,
            items: subject.items.filter((item) => item.searchableText.toLowerCase().includes(q)),
          }))
          .filter((subject) => subject.items.length > 0),
      }))
      .filter((tab) => tab.subjects.length > 0);
  }, [page.classTabs, q]);

  const activeTab =
    filteredTabs.find((tab) => tab.id === activeTabId) ||
    filteredTabs.find((tab) =>
      tab.subjects.some((subject) => subject.items.some((item) => item.id === selectedId)),
    ) ||
    filteredTabs[0] ||
    null;
  const contentTabs = useMemo(() => {
    if (!activeTab) {
      return [];
    }

    const itemCountByTabId = new Map();
    activeTab.subjects.forEach((subject) => {
      subject.items.forEach((item) => {
        itemCountByTabId.set(item.tabId, (itemCountByTabId.get(item.tabId) || 0) + 1);
      });
    });

    return page.tabs
      .map((tab) => ({
        id: tab.id,
        title: tab.title,
        titleText: tab.titleText,
        itemCount: itemCountByTabId.get(tab.id) || 0,
      }))
      .filter((tab) => tab.itemCount > 0);
  }, [activeTab, page.tabs]);
  const activeContentTab =
    contentTabs.find((tab) => tab.id === activeContentTabId) ||
    contentTabs.find((tab) =>
      activeTab?.subjects.some((subject) =>
        subject.items.some((item) => item.id === selectedId && item.tabId === tab.id),
      ),
    ) ||
    contentTabs[0] ||
    null;
  const visibleSubjects = useMemo(() => {
    if (!activeTab) {
      return [];
    }

    return activeTab.subjects
      .map((subject) => ({
        ...subject,
        items: activeContentTab
          ? subject.items.filter((item) => item.tabId === activeContentTab.id)
          : subject.items,
      }))
      .filter((subject) => subject.items.length > 0);
  }, [activeTab, activeContentTab]);

  return (
    <div className="page-shell">
      <TopBar
        query={query}
        setQuery={setQuery}
        searchPlaceholder={translateUiText(language, 'pigflixSearchPlaceholder')}
      />
      <main className="page-main pigflix-main">
        <section className="pigflix-intro">
          <section className="page-heading map-page-heading pigflix-page-head">
            <p className="pigflix-page-kicker">{translateDisplayText(language, page.audienceText || page.audience || 'Class 1-5', { strict: Boolean(page.audienceText) })}</p>
            <h1>{translateDisplayText(language, page.titleText || page.title, { strict: true })}</h1>
            {page.subtitle ? <p className="pigflix-page-copy">{translateDisplayText(language, page.subtitleText || page.subtitle, { strict: Boolean(page.subtitleText) })}</p> : null}
          </section>

          <section className="pigflix-filterbar" aria-label={translateUiText(language, 'pigflixFilters')}>
            <div className="pigflix-filter-group">
              <p className="pigflix-section-kicker">{translateUiText(language, 'class')}</p>
              <div className="pigflix-tabbar" aria-label={translateUiText(language, 'pigflixClassTabs')}>
              {filteredTabs.map((tab) => {
                const isActive = activeTab?.id === tab.id;

                return (
                  <button
                    type="button"
                    key={tab.id}
                    className={`pigflix-tab${isActive ? ' is-active' : ''}`}
                    onClick={() => {
                      const nextContentTabIds = new Set(
                        tab.subjects.flatMap((subject) => subject.items.map((item) => item.tabId)),
                      );
                      setActiveTabId(tab.id);
                      setActiveContentTabId(
                        activeContentTabId && nextContentTabIds.has(activeContentTabId)
                          ? activeContentTabId
                          : [...nextContentTabIds][0] || null,
                      );
                      if (!tab.subjects.some((subject) => subject.items.some((item) => item.id === selectedId))) {
                        setSelectedId(null);
                      }
                    }}
                  >
                    <span>{translateDisplayText(language, tab.titleText || tab.title, { strict: Boolean(tab.titleText) })}</span>
                  </button>
                );
              })}
              </div>
            </div>

            {contentTabs.length ? (
              <div className="pigflix-filter-group">
                <p className="pigflix-section-kicker">{translateUiText(language, 'format')}</p>
                <div className="pigflix-tabbar" aria-label={translateUiText(language, 'pigflixFormatTabs')}>
                  {contentTabs.map((tab) => {
                    const isActive = activeContentTab?.id === tab.id;

                    return (
                      <button
                        type="button"
                        key={tab.id}
                        className={`pigflix-tab${isActive ? ' is-active' : ''}`}
                        onClick={() => setActiveContentTabId(tab.id)}
                      >
                        <span>{translateDisplayText(language, tab.titleText || tab.title, { strict: Boolean(tab.titleText) })}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        </section>

        {activeTab ? (
          <section className="pigflix-shelf-stack">
            {visibleSubjects.map((subject) => (
              <section className="pigflix-shelf" key={subject.id}>
                <div className="pigflix-shelf-head">
                  <div>
                    <h3>{translateDisplayText(language, subject.titleText || subject.title, { strict: Boolean(subject.titleText) })}</h3>
                  </div>
                  <span>{subject.items.length} {translateUiText(language, 'picks')}</span>
                </div>

                <div className="pigflix-card-rail">
                  {subject.items.map((item) => {
                    const isSelected = selectedId === item.id;
                    const cardContent = (
                      <>
                        <span className="pigflix-card-kicker">{translateDisplayText(language, item.typeText || item.type || item.tabTitleText || item.tabTitle, { strict: Boolean(item.typeText || item.tabTitleText) })}</span>
                        <strong className="pigflix-card-title">{translateDisplayText(language, item.titleText || item.title, { strict: Boolean(item.titleText) })}</strong>
                        <span className="pigflix-card-copy">
                          {translateDisplayText(
                            language,
                            item.descriptionText ||
                              item.description ||
                              item.vibeText ||
                              item.vibe ||
                              item.subjectDescriptionText ||
                              item.subjectDescription,
                            {
                              strict: Boolean(item.descriptionText || item.vibeText || item.subjectDescriptionText),
                            },
                          )}
                        </span>
                        <span className="pigflix-card-meta">
                          <span>{translateDisplayText(language, item.ageText || item.age || item.subjectTitleText || item.subjectTitle, { strict: Boolean(item.ageText || item.subjectTitleText) })}</span>
                          {item.vibe || item.tabTitle ? (
                            <span>{translateDisplayText(language, item.vibeText || item.vibe || item.tabTitleText || item.tabTitle, { strict: Boolean(item.vibeText || item.tabTitleText) })}</span>
                          ) : null}
                        </span>
                      </>
                    );

                    return item.links?.[0] ? (
                      <a
                        key={item.id}
                        className={`pigflix-card${isSelected ? ' is-selected' : ''}`}
                        href={item.links[0].href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          setSelectedId(item.id);
                          setActiveTabId(item.classTabId);
                          setActiveContentTabId(item.tabId);
                        }}
                      >
                        {cardContent}
                      </a>
                    ) : (
                      <article
                        key={item.id}
                        className={`pigflix-card pigflix-card--disabled${isSelected ? ' is-selected' : ''}`}
                      >
                        {cardContent}
                        <span className="pigflix-card-note">{translateUiText(language, 'linkUnavailable')}</span>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function AboutPage() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filterText = (value) => value.toLowerCase().includes(q);
  const narrativeSections = q
    ? aboutNarrative.sections.filter(
        (section) => filterText(section.title) || section.paragraphs.some(filterText),
      )
    : aboutNarrative.sections;
  const filteredFramework = q
    ? frameworkItems.filter(
        (item) =>
          filterText(item.title) ||
          filterText(item.subtitle) ||
          filterText(item.description) ||
          filterText(item.descriptionHindi),
      )
    : frameworkItems;
  const filteredTeam = q
    ? teamMembers.filter(
        (member) =>
          filterText(member.agent) ||
          filterText(member.name) ||
          filterText(member.role) ||
          member.links.some((link) => filterText(link.label) || filterText(link.href)),
      )
    : teamMembers;
  const filteredHandles = q
    ? officialHandles.filter((handle) => filterText(handle.label) || filterText(handle.href))
    : officialHandles;
  const filteredLinks = q
    ? aboutLinks.filter(
        (item) =>
          filterText(item.title) ||
          filterText(item.value) ||
          (item.note ? filterText(item.note) : false),
      )
    : aboutLinks;
  const hasResults =
    !q ||
    narrativeSections.length > 0 ||
    filteredFramework.length > 0 ||
    filteredTeam.length > 0 ||
    filteredHandles.length > 0 ||
    filteredLinks.length > 0;

  return (
    <div className="page-shell">
      <TopBar query={query} setQuery={setQuery} />
      <main className="page-main about-main">
        <article className="about-editorial">
          <header className="about-hero">
            <h1>{aboutNarrative.bannerTitle}</h1>
            {aboutNarrative.bannerLines.map((line) => (
              <p className="about-hero-copy" key={line}>{line}</p>
            ))}
          </header>

          {narrativeSections.map((section) => (
            <section className="about-section" key={section.title}>
              <h2>{section.title}</h2>
              <div className="about-prose">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          {filteredFramework.length > 0 ? (
            <section className="about-section">
              <h2>Our Framework | हमारी रूपरेखा</h2>
              <div className="about-framework-list">
                {filteredFramework.map((item) => (
                  <div className="about-framework-item" key={item.title}>
                    <h3>{item.title}</h3>
                    <p className="about-framework-subtitle">{item.subtitle}</p>
                    <p>{item.description}</p>
                    <p>{item.descriptionHindi}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {filteredTeam.length > 0 ? (
            <section className="about-section">
              <h2>People behind this</h2>
              <div className="about-team-table-wrap">
                <table className="about-team-table">
                  <thead>
                    <tr>
                      <th scope="col">Agent</th>
                      <th scope="col">Name</th>
                      <th scope="col">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeam.map((member) => (
                      <tr key={member.agent}>
                        <td>{member.agent}</td>
                        <td>{member.name}</td>
                        <td>
                          <div className="about-role-cell">
                            <span>{member.role}</span>
                            {member.links.length > 0 ? (
                              <span className="about-role-links">
                                {member.links.map((link, index) => (
                                  <React.Fragment key={link.href}>
                                    {index > 0 ? ' · ' : ''}
                                    <a href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
                                  </React.Fragment>
                                ))}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {filteredHandles.length > 0 ? (
            <section className="about-section">
              <h2>Find us on</h2>
              <div className="about-social-row">
                {filteredHandles.map((handle) => (
                  <a
                    className="about-social-link"
                    key={handle.href}
                    href={handle.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={handle.label}
                    title={handle.label}
                  >
                    <SocialIcon label={handle.label} />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {filteredLinks.length > 0 ? (
            <section className="about-section">
              <h2>Connect & Contribute | जुड़ें और योगदान दें</h2>
              <div className="about-contact-lines">
                {filteredLinks.map((item) => (
                  <div className="about-contact-line" key={item.title}>
                    <span className="about-contact-label">{item.title}</span>
                    <a
                      href={item.href}
                      target={item.href.startsWith('http') ? '_blank' : undefined}
                      rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
                    >
                      {item.value}
                    </a>
                    {item.note ? <span className="about-line-note">{item.note}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!hasResults ? (
            <section className="about-section">
              <p className="about-empty">No About page results found for “{query}”.</p>
            </section>
          ) : null}
        </article>
      </main>
    </div>
  );
}

function SocialIcon({ label }) {
  switch (label) {
    case 'Facebook':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13.5 21v-7h2.8l.4-3h-3.2V9.2c0-.9.3-1.6 1.7-1.6H17V4.9c-.3 0-.9-.1-2-.1-2.9 0-4.5 1.5-4.5 4.5V11H8v3h2.5v7z" fill="currentColor" />
        </svg>
      );
    case 'YouTube':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21.2 7.2a2.8 2.8 0 0 0-2-2c-1.8-.5-7.2-.5-7.2-.5s-5.4 0-7.2.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2.5 12a29 29 0 0 0 .3 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.2.5 7.2.5s5.4 0 7.2-.5a2.8 2.8 0 0 0 2-2 29 29 0 0 0 .3-4.8 29 29 0 0 0-.3-4.8M10 15.5v-7l6 3.5z" fill="currentColor" />
        </svg>
      );
    case 'Instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3m0 1.8a2.7 2.7 0 0 0-2.7 2.7v9a2.7 2.7 0 0 0 2.7 2.7h9a2.7 2.7 0 0 0 2.7-2.7v-9a2.7 2.7 0 0 0-2.7-2.7zm9.6 1.4a1.1 1.1 0 1 1-1.1 1.1 1.1 1.1 0 0 1 1.1-1.1M12 7.4A4.6 4.6 0 1 1 7.4 12 4.6 4.6 0 0 1 12 7.4m0 1.8A2.8 2.8 0 1 0 14.8 12 2.8 2.8 0 0 0 12 9.2" fill="currentColor" />
        </svg>
      );
    case 'LinkedIn':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.1 8.4H3.2V21h2.9zM4.6 3A1.7 1.7 0 1 0 6.3 4.7 1.7 1.7 0 0 0 4.6 3m16.2 10.1c0-3.2-1.7-4.7-4-4.7a3.5 3.5 0 0 0-3.1 1.7V8.4h-2.9V21h2.9v-7c0-1.8.4-3.5 2.6-3.5s2.2 2 2.2 3.6V21h2.9z" fill="currentColor" />
        </svg>
      );
    case 'X':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18.9 4H21l-4.6 5.3L22 20h-4.7l-3.7-7-6 7H5.5l5-5.8L2 4h4.8l3.3 6.4zM18 18.4h1.3L6.1 5.5H4.7z" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

function SectionSearchResults({ title, items, emptyLabel, onSelect, activeId }) {
  const { language } = useLanguage();
  return (
    <section className="search-results">
      <div className="search-results-head">
        <h2>{title}</h2>
      </div>

      {items.length === 0 ? (
        <p className="search-empty">{emptyLabel}</p>
      ) : (
        <div className="search-result-list">
          {items.map((item) => {
            const titleValue = item.titleText || item.title;
            const summaryValue = item.summaryText || item.summary;
            const strictTitle = Boolean(item.titleText);
            const strictSummary = Boolean(item.summaryText);

            return onSelect ? (
              <button
                type="button"
                key={item.id}
                className={`search-result${activeId === item.id ? ' is-active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <span className="search-result-title">{translateDisplayText(language, titleValue, { strict: strictTitle })}</span>
                {item.context || item.contextSegments ? (
                  <span className="search-result-context">{translatePathText(language, item.contextSegments || item.context)}</span>
                ) : null}
                {summaryValue ? (
                  <span className="search-result-summary">{translateDisplayText(language, summaryValue, { strict: strictSummary })}</span>
                ) : null}
              </button>
            ) : (
              <Link
                key={item.id}
                className="search-result"
                to={item.path}
                state={{ focusId: item.id, seedQuery: item.title }}
              >
                <span className="search-result-title">{translateDisplayText(language, titleValue, { strict: strictTitle })}</span>
                {item.context || item.contextSegments ? (
                  <span className="search-result-context">{translatePathText(language, item.contextSegments || item.context)}</span>
                ) : null}
                {summaryValue ? (
                  <span className="search-result-summary">{translateDisplayText(language, summaryValue, { strict: strictSummary })}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TopBar({ query = '', setQuery = () => {}, showSearch = true, searchVariant = 'default', searchPlaceholder = 'Search' }) {
  const { language, setLanguage } = useLanguage();
  return (
    <header className="topbar">
      <div className="topbar-zone topbar-zone--brand">
        <NavLink to="/" className="brand-block brand-home-link" aria-label="PIGSFIELD home">
          <img className="brand-logo" src="/pigsfield-logo.svg" alt="PIGSFIELD" />
        </NavLink>
      </div>

      <div className="topbar-zone topbar-zone--nav">
        <nav className="topnav" aria-label="Primary navigation">
          {navItems.map((item) =>
            item.path ? (
              <NavLink
                key={item.label}
                to={item.path}
                className={({ isActive }) => `nav-button${isActive ? ' active' : ''}`}
              >
                {translateDisplayText(language, item.label)}
              </NavLink>
            ) : (
              <a key={item.label} className="nav-button" href={item.href}>
                {translateDisplayText(language, item.label)}
              </a>
            ),
          )}
        </nav>
      </div>

      <div className="topbar-zone topbar-zone--search">
        <div className="topbar-tools">
          <div className="language-switch" aria-label="Language">
            <button
              type="button"
              className={`language-button${language === 'en' ? ' is-active' : ''}`}
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
            >
              EN
            </button>
            <button
              type="button"
              className={`language-button${language === 'hi' ? ' is-active' : ''}`}
              onClick={() => setLanguage('hi')}
              aria-pressed={language === 'hi'}
            >
              हिन्दी
            </button>
          </div>

        {showSearch ? (
          <label
            className={`searchbox${searchVariant !== 'default' ? ` searchbox--${searchVariant}` : ''}`}
            aria-label={translateUiText(language, 'search')}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
        ) : null}
        </div>
      </div>
    </header>
  );
}

function formatKindLabel(kind, language = 'en') {
  const label =
    kind === 'category'
      ? 'Main branch'
      : kind === 'subcategory'
        ? 'Subgroup'
        : kind === 'resource'
          ? 'Resource'
          : 'Node';

  return translateDisplayText(language, label);
}

function formatDetailType(node, language = 'en') {
  if (node.kind === 'resource') {
    return translateDisplayText(language, node.isShared ? 'Shared resource' : 'External resource');
  }

  return formatKindLabel(node.kind, language);
}

function formatActionHost(href) {
  try {
    const host = new URL(href).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return href;
  }
}

function formatAnnotation(title) {
  return title
    .replace(/^Links common to /i, 'Common to ')
    .replace(/\.\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findTool(page, toolId) {
  for (const category of page.categories) {
    const tool = category.tools.find((item) => item.id === toolId);
    if (tool) {
      return tool;
    }
  }

  return null;
}

function findPigflixItem(page, itemId) {
  return page.itemMap?.get(itemId) || null;
}

const TEXT_MEASURE_CACHE = new Map();

function getNodeBox(node, pageKey, language = 'en') {
  const isAcademicResource = pageKey === 'academics' && node.kind === 'resource';
  const contentWidth =
    node.kind === 'category'
      ? 200
      : node.kind === 'subcategory'
        ? 186
        : isAcademicResource
          ? 250
          : 220;
  const paddingX = node.kind === 'category' ? 20 : 16;
  const paddingY = node.kind === 'category' ? 20 : 16;
  const titleLineHeight =
    node.kind === 'category' ? 28 : node.kind === 'subcategory' ? 21 : 19;
  const displayTitle = translateDisplayText(language, node.titleText || node.title, { strict: true }) || node.title;
  const displayDescription =
    isAcademicResource && node.description
      ? translateDisplayText(language, node.descriptionText || node.description, { strict: true }) || node.description
      : '';
  const titleMeasure = getNodeTextMeasure(node, pageKey, 'title', contentWidth);
  const titleLines = estimateWrappedLineCount(displayTitle, titleMeasure);
  const descriptionLines =
    isAcademicResource && displayDescription
      ? estimateWrappedLineCount(
          displayDescription,
          getNodeTextMeasure(node, pageKey, 'description', contentWidth),
        )
      : 0;
  const kickerHeight = node.isShared ? 16 : 0;
  const gapBeforeDescription = descriptionLines > 0 ? 7 : 0;
  const sharedGap = node.isShared ? 7 : 0;
  const height =
    paddingY * 2 +
    titleLines * titleLineHeight +
    descriptionLines * 15 +
    kickerHeight +
    gapBeforeDescription +
    sharedGap;

  return {
    width: contentWidth + paddingX * 2,
    height: Math.max(height, node.kind === 'resource' ? 80 : 66),
  };
}

function getNodeTextMeasure(node, pageKey, part, width) {
  if (part === 'description') {
    return {
      width,
      font: '400 13px "Noto Sans", sans-serif',
      maxLines: 2,
      fallbackCharsPerLine: 34,
    };
  }

  if (node.kind === 'category') {
    return {
      width,
      font: '700 20px "Noto Serif", serif',
      maxLines: 2,
      fallbackCharsPerLine: 16,
    };
  }

  if (node.kind === 'subcategory') {
    return {
      width,
      font: '600 16px "Noto Sans", sans-serif',
      maxLines: 2,
      fallbackCharsPerLine: 20,
    };
  }

  return {
    width,
    font: pageKey === 'academics' ? '600 15px "Noto Sans", sans-serif' : '600 15px "Noto Sans", sans-serif',
    maxLines: 2,
    fallbackCharsPerLine: pageKey === 'academics' ? 28 : 24,
  };
}

function getTextWidth(value = '', font = '400 14px sans-serif') {
  const key = `${font}::${value}`;
  if (TEXT_MEASURE_CACHE.has(key)) {
    return TEXT_MEASURE_CACHE.get(key);
  }

  let width = value.length * 7;

  if (typeof document !== 'undefined') {
    if (!getTextWidth.canvas) {
      getTextWidth.canvas = document.createElement('canvas');
      getTextWidth.context = getTextWidth.canvas.getContext('2d');
    }

    if (getTextWidth.context) {
      getTextWidth.context.font = font;
      width = getTextWidth.context.measureText(value).width;
    }
  }

  TEXT_MEASURE_CACHE.set(key, width);
  return width;
}

function estimateWrappedLineCount(value = '', measure = {}) {
  if (!value) return 0;

  const {
    width = 200,
    font = '400 14px sans-serif',
    maxLines = 2,
    fallbackCharsPerLine = 26,
  } = measure;

  if (typeof document === 'undefined') {
    return estimateLineCount(value, fallbackCharsPerLine, maxLines);
  }

  const tokens = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }

  let lines = 1;
  let currentWidth = 0;

  tokens.forEach((token) => {
    const tokenWidth = getTextWidth(token, font);
    const nextWidth = currentWidth === 0 ? tokenWidth : currentWidth + getTextWidth(' ', font) + tokenWidth;

    if (nextWidth <= width) {
      currentWidth = nextWidth;
      return;
    }

    if (tokenWidth > width) {
      lines += Math.max(1, Math.ceil(tokenWidth / Math.max(width, 1))) - (currentWidth === 0 ? 0 : 1);
      currentWidth = tokenWidth % width;
      return;
    }

    lines += 1;
    currentWidth = tokenWidth;
  });

  return Math.min(maxLines, Math.max(lines, 1));
}

function getAnnotationBox(title) {
  const formattedTitle = formatAnnotation(title);
  const font = '500 12px "Noto Sans", sans-serif';
  const minWidth = 188;
  const maxWidth = 312;
  const measuredWidth = getTextWidth(formattedTitle.toUpperCase(), font) + 34;
  const width = clamp(measuredWidth, minWidth, maxWidth);
  const lines = estimateWrappedLineCount(formattedTitle.toUpperCase(), {
    width: width - 28,
    font,
    maxLines: 3,
    fallbackCharsPerLine: 24,
  });

  return {
    width,
    height: 18 + lines * 17,
  };
}

function getPlacementDepth(node) {
  if (Number.isFinite(node.depth)) {
    return clamp(node.depth, 1, 3);
  }

  if (node.kind === 'category') return 1;
  if (node.kind === 'subcategory') return 2;
  return 3;
}

function getSiblingGap(parentNode, childBoxes = []) {
  const averageChildHeight = average(childBoxes.map((box) => box.height));
  const base = parentNode.kind === 'category' ? 30 : 22;
  return clamp(Math.round(base + averageChildHeight * 0.22), 26, 72);
}

function getSectionGap(subtreeHeight) {
  return clamp(Math.round(subtreeHeight * 0.18), 92, 188);
}

function getSharedNodeGap(nodeBoxes = []) {
  const averageHeight = average(nodeBoxes.map((box) => box.height));
  return clamp(Math.round(averageHeight * 0.18), 24, 54);
}

function buildDepthColumns(page, nodeBoxes) {
  const widthByDepth = new Map([
    [1, 0],
    [2, 0],
    [3, 0],
  ]);
  const fanoutByDepth = new Map([
    [1, 0],
    [2, 0],
  ]);

  page.nodes.forEach((node) => {
    const depth = getPlacementDepth(node);
    widthByDepth.set(depth, Math.max(widthByDepth.get(depth) || 0, nodeBoxes.get(node.id)?.width || 0));

    if (depth <= 2) {
      fanoutByDepth.set(
        depth,
        Math.max(fanoutByDepth.get(depth) || 0, node.childIds.length || 0),
      );
    }
  });

  const laneBandOne = clamp(126 + (fanoutByDepth.get(1) || 0) * 10, 140, 244);
  const laneBandTwo = clamp(140 + (fanoutByDepth.get(2) || 0) * 10, 152, 272);
  const xByDepth = {
    1: 72,
    2: 72 + (widthByDepth.get(1) || 0) + laneBandOne,
  };

  xByDepth[3] = xByDepth[2] + (widthByDepth.get(2) || 0) + laneBandTwo;

  return {
    xByDepth,
    widthByDepth,
    laneBands: {
      1: laneBandOne,
      2: laneBandTwo,
    },
  };
}

function buildExclusiveChildMap(page, sharedNodeIds) {
  const exclusiveChildren = new Map();

  page.nodes.forEach((node) => {
    const children = node.childIds
      .map((childId) => page.nodeMap.get(childId))
      .filter((child) => child && !sharedNodeIds.has(child.id) && child.parentIds.length <= 1)
      .sort((a, b) => a.y - b.y || a.title.localeCompare(b.title));

    exclusiveChildren.set(node.id, children);
  });

  return exclusiveChildren;
}

function collectAncestorIds(page, nodeId, cache = new Map(), trail = new Set()) {
  if (cache.has(nodeId)) {
    return cache.get(nodeId);
  }

  if (trail.has(nodeId)) {
    return new Set();
  }

  const node = page.nodeMap.get(nodeId);
  if (!node) {
    return new Set();
  }

  const nextTrail = new Set(trail);
  nextTrail.add(nodeId);
  const ancestors = new Set();

  node.parentIds.forEach((parentId) => {
    ancestors.add(parentId);
    collectAncestorIds(page, parentId, cache, nextTrail).forEach((ancestorId) => ancestors.add(ancestorId));
  });

  cache.set(nodeId, ancestors);
  return ancestors;
}

function findSharedGroupAncestor(page, parentIds) {
  if (parentIds.length === 0) {
    return null;
  }

  const ancestorCache = new Map();
  const sharedAncestors = parentIds
    .map((parentId) => collectAncestorIds(page, parentId, ancestorCache))
    .reduce((intersection, ancestors) => {
      if (!intersection) {
        return new Set(ancestors);
      }

      return new Set([...intersection].filter((ancestorId) => ancestors.has(ancestorId)));
    }, null);

  if (!sharedAncestors || sharedAncestors.size === 0) {
    return null;
  }

  return [...sharedAncestors]
    .map((ancestorId) => page.nodeMap.get(ancestorId))
    .filter(Boolean)
    .sort((a, b) => getPlacementDepth(b) - getPlacementDepth(a))[0] || null;
}

function joinLabels(values = []) {
  if (values.length <= 1) {
    return values[0] || '';
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function deriveSharedGroupLabel(page, parentIds, nodes) {
  const explicitTitles = [...new Set(nodes.map((node) => node.sharedGroup).filter(Boolean))];
  if (explicitTitles.length === 1) {
    return formatAnnotation(explicitTitles[0]);
  }

  const parentNodes = parentIds
    .map((parentId) => page.nodeMap.get(parentId))
    .filter(Boolean);
  const parentTitles = parentNodes.map((parent) => parent.title);
  const commonAncestor = findSharedGroupAncestor(page, parentIds);

  if (commonAncestor && commonAncestor.kind === 'category') {
    const sameKindChildren = commonAncestor.childIds
      .map((childId) => page.nodeMap.get(childId))
      .filter((child) => child && child.kind === parentNodes[0]?.kind)
      .map((child) => child.id)
      .sort();
    const normalizedParents = [...parentIds].sort();

    if (
      sameKindChildren.length > 1 &&
      sameKindChildren.length === normalizedParents.length &&
      sameKindChildren.every((childId, index) => childId === normalizedParents[index])
    ) {
      return `Common to ${commonAncestor.title.toLowerCase()} all levels`;
    }

    return `Shared across ${commonAncestor.title}: ${joinLabels(parentTitles)}`;
  }

  return `Shared across ${joinLabels(parentTitles)}`;
}

function buildSharedClusterDefinitions(page) {
  const grouped = new Map();

  page.nodes
    .filter((node) => node.parentIds.length > 1)
    .forEach((node) => {
      const sortedParentIds = [...node.parentIds].sort();
      const explicitKey = normalizeGraphKey(node.sharedGroup || '');
      const key = `${sortedParentIds.join('|')}::${getPlacementDepth(node)}::${explicitKey}`;

      if (!grouped.has(key)) {
        const maxParentDepth = Math.max(
          ...sortedParentIds.map((parentId) => getPlacementDepth(page.nodeMap.get(parentId) || { kind: 'category' })),
        );

        grouped.set(key, {
          key,
          parentIds: sortedParentIds,
          nodes: [],
          depth: Math.max(getPlacementDepth(node), maxParentDepth + 1),
        });
      }

      grouped.get(key).nodes.push(node);
    });

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      nodes: group.nodes.sort((a, b) => a.y - b.y || a.title.localeCompare(b.title)),
      label: deriveSharedGroupLabel(page, group.parentIds, group.nodes),
    }))
    .sort((a, b) => {
      const aTitles = a.parentIds.map((parentId) => page.nodeMap.get(parentId)?.title || '').join('|');
      const bTitles = b.parentIds.map((parentId) => page.nodeMap.get(parentId)?.title || '').join('|');
      return aTitles.localeCompare(bTitles);
    });
}

function buildColumnReservations(page, positions) {
  const reservations = new Map([
    [1, []],
    [2, []],
    [3, []],
  ]);

  page.nodes.forEach((node) => {
    const box = positions.get(node.id);
    if (!box) return;

    reservations.get(getPlacementDepth(node)).push({
      start: box.y,
      end: box.y + box.height,
    });
  });

  reservations.forEach((segments, depth) => {
    reservations.set(
      depth,
      segments.sort((a, b) => a.start - b.start),
    );
  });

  return reservations;
}

function reserveVerticalSlot(segments = [], desiredStart, height, gap = 28) {
  let start = desiredStart;

  segments.forEach((segment) => {
    if (start + height + gap <= segment.start) {
      return;
    }

    if (start < segment.end + gap) {
      start = segment.end + gap;
    }
  });

  segments.push({ start, end: start + height });
  segments.sort((a, b) => a.start - b.start);
  return start;
}

function getBalancedLaneOffset(index, total, spacing) {
  return (index - (total - 1) / 2) * spacing;
}

function buildSharedCluster(page, definition, positions, nodeBoxes, layoutColumns, reservations, railMeta) {
  const clusterNodeBoxes = definition.nodes.map((node) => nodeBoxes.get(node.id)).filter(Boolean);
  const nodeGap = getSharedNodeGap(clusterNodeBoxes);
  const clusterHeight = clusterNodeBoxes.reduce(
    (total, box, index) => total + box.height + (index > 0 ? nodeGap : 0),
    0,
  );
  const parentCenters = definition.parentIds
    .map((parentId) => positions.get(parentId))
    .filter(Boolean)
    .map((box) => centerY(box));
  const desiredCenter = average(parentCenters);
  const desiredStart = desiredCenter - clusterHeight / 2;
  const depth = clamp(definition.depth, 1, 3);
  const columnSegments = reservations.get(depth) || [];
  const startY = reserveVerticalSlot(columnSegments, desiredStart, clusterHeight, 32);
  let cursorY = startY;
  const nodeIds = [];
  const edgeIds = [];

  definition.nodes.forEach((node, index) => {
    const box = nodeBoxes.get(node.id);
    positions.set(node.id, {
      x: layoutColumns.xByDepth[depth],
      y: cursorY,
      ...box,
    });
    nodeIds.push(node.id);
    cursorY += box.height + (index < definition.nodes.length - 1 ? nodeGap : 0);

    definition.parentIds.forEach((parentId) => {
      const edge = page.edgeKeyMap.get(`${parentId}->${node.id}`);
      if (edge) {
        edgeIds.push(edge.id);
      }
    });
  });

  const parentBoxes = definition.parentIds
    .map((parentId) => positions.get(parentId))
    .filter(Boolean);
  const clusterBoxes = nodeIds
    .map((nodeId) => positions.get(nodeId))
    .filter(Boolean);
  const corridorLeft = Math.max(...parentBoxes.map((box) => box.x + box.width)) + 42;
  const corridorRight = Math.min(...clusterBoxes.map((box) => box.x)) - 42;
  const laneOffset = getBalancedLaneOffset(railMeta.index, railMeta.total, 22);
  const baseRailX = corridorLeft + Math.min(118, Math.max(48, (corridorRight - corridorLeft) * 0.5));
  const railX = clamp(baseRailX + laneOffset, corridorLeft, Math.max(corridorLeft, corridorRight));

  return {
    key: definition.key,
    label: definition.label,
    parentIds: definition.parentIds,
    nodeIds,
    edgeIds,
    railX,
    minY: startY,
    maxY: startY + clusterHeight,
  };
}

function boxesOverlap(boxA, boxB, gapX = 0, gapY = gapX) {
  return !(
    boxA.x + boxA.width + gapX <= boxB.x ||
    boxB.x + boxB.width + gapX <= boxA.x ||
    boxA.y + boxA.height + gapY <= boxB.y ||
    boxB.y + boxB.height + gapY <= boxA.y
  );
}

function placeFloatingAnnotation(baseBox, staticObstacles, placedAnnotations) {
  const verticalStep = 18;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = {
      ...baseBox,
      y: baseBox.y - attempt * verticalStep,
    };
    const collides =
      staticObstacles.some((obstacle) => boxesOverlap(candidate, obstacle, 10, 10)) ||
      placedAnnotations.some((annotation) => boxesOverlap(candidate, annotation, 12, 12));

    if (!collides) {
      return candidate;
    }
  }

  let y = baseBox.y;
  while (
    staticObstacles.some((obstacle) => boxesOverlap({ ...baseBox, y }, obstacle, 10, 10)) ||
    placedAnnotations.some((annotation) => boxesOverlap({ ...baseBox, y }, annotation, 12, 12))
  ) {
    y += verticalStep;
  }

  return {
    ...baseBox,
    y,
  };
}

function buildAnnotationPositions(page, sharedClusters, positions) {
  const staticObstacles = [...positions.values()].map((box) => expandBox(box, 12, 10));
  const annotations = [];

  sharedClusters.forEach((cluster) => {
    const labelBox = getAnnotationBox(cluster.label);
    const parentBoxes = cluster.parentIds
      .map((parentId) => positions.get(parentId))
      .filter(Boolean);
    const nodeBoxes = cluster.nodeIds
      .map((nodeId) => positions.get(nodeId))
      .filter(Boolean);

    if (parentBoxes.length === 0 || nodeBoxes.length === 0) {
      return;
    }

    const corridorLeft = Math.max(...parentBoxes.map((box) => box.x + box.width)) + 24;
    const corridorRight = Math.min(...nodeBoxes.map((box) => box.x)) - 24;
    const x =
      corridorRight - corridorLeft > labelBox.width
        ? corridorLeft + (corridorRight - corridorLeft - labelBox.width) / 2
        : Math.max(cluster.railX + 20, Math.min(...nodeBoxes.map((box) => box.x)) - labelBox.width - 18);
    const parentReferenceY = average(cluster.nodeIds.map((nodeId) => centerY(positions.get(nodeId))));
    const nodeReferenceY = average(cluster.parentIds.map((parentId) => centerY(positions.get(parentId))));
    const anchorTop = Math.min(
      ...cluster.parentIds.map((parentId) =>
        getNodeSideAnchor(positions.get(parentId), 'right', 0, 0, parentReferenceY).y,
      ),
      ...cluster.nodeIds.map((nodeId) =>
        getNodeSideAnchor(positions.get(nodeId), 'left', 0, 0, nodeReferenceY).y,
      ),
      ...nodeBoxes.map((box) => box.y),
    );
    const annotation = placeFloatingAnnotation(
      {
        id: `annotation-${cluster.key}`,
        title: cluster.label,
        x,
        y: anchorTop - labelBox.height - 28,
        ...labelBox,
      },
      staticObstacles,
      annotations,
    );

    annotations.push(annotation);
  });

  const matchedTitles = new Set(sharedClusters.map((cluster) => formatAnnotation(cluster.label)));
  page.annotations
    .map((annotation) => formatAnnotation(annotation.title))
    .filter((title) => !matchedTitles.has(title))
    .forEach((title) => {
      const relatedNodes = page.nodes.filter((node) => formatAnnotation(node.sharedGroup || '') === title);
      const relatedBoxes = relatedNodes.map((node) => positions.get(node.id)).filter(Boolean);

      if (relatedBoxes.length === 0) {
        return;
      }

      const labelBox = getAnnotationBox(title);
      const base = placeFloatingAnnotation(
        {
          id: `annotation-manual-${normalizeGraphKey(title)}`,
          title,
          x: Math.min(...relatedBoxes.map((box) => box.x)) - 6,
          y: Math.min(...relatedBoxes.map((box) => box.y)) - labelBox.height - 28,
          ...labelBox,
        },
        staticObstacles,
        annotations,
      );

      annotations.push(base);
    });

  return annotations;
}

function buildEdgeLaneMap(page, positions, sharedClusterByNode) {
  const edgeLaneMap = new Map();
  const outgoing = new Map();
  const incoming = new Map();
  const directEdges = page.edges.filter((edge) => !sharedClusterByNode.has(edge.target));

  directEdges.forEach((edge) => {
    if (!outgoing.has(edge.source)) {
      outgoing.set(edge.source, []);
    }
    if (!incoming.has(edge.target)) {
      incoming.set(edge.target, []);
    }

    outgoing.get(edge.source).push(edge);
    incoming.get(edge.target).push(edge);
  });

  const outgoingMeta = new Map();
  const incomingMeta = new Map();

  outgoing.forEach((edges, sourceId) => {
    const ordered = edges
      .slice()
      .sort((a, b) => centerY(positions.get(a.target)) - centerY(positions.get(b.target)));
    ordered.forEach((edge, index) => {
      outgoingMeta.set(edge.id, { index, total: ordered.length, sourceId });
    });
  });

  incoming.forEach((edges, targetId) => {
    const ordered = edges
      .slice()
      .sort((a, b) => centerY(positions.get(a.source)) - centerY(positions.get(b.source)));
    ordered.forEach((edge, index) => {
      incomingMeta.set(edge.id, { index, total: ordered.length, targetId });
    });
  });

  directEdges.forEach((edge) => {
    const sourceBox = positions.get(edge.source);
    const targetBox = positions.get(edge.target);
    if (!sourceBox || !targetBox) {
      return;
    }

    const span = targetBox.x - (sourceBox.x + sourceBox.width);
    const laneSpacing = span > 260 ? 22 : 18;
    const outMeta = outgoingMeta.get(edge.id) || { index: 0, total: 1 };
    const inMeta = incomingMeta.get(edge.id) || { index: 0, total: 1 };

    edgeLaneMap.set(edge.id, {
      startX:
        sourceBox.x + sourceBox.width + 46 + getBalancedLaneOffset(outMeta.index, outMeta.total, laneSpacing),
      endX:
        targetBox.x - 46 + getBalancedLaneOffset(inMeta.index, inMeta.total, laneSpacing),
    });
  });

  return edgeLaneMap;
}

function buildGraphLayout(page, language = 'en') {
  const positions = new Map();
  const sharedClusters = [];
  const sharedClusterByNode = new Map();
  const nodeBoxes = new Map(page.nodes.map((node) => [node.id, getNodeBox(node, page.pageKey, language)]));
  const layoutColumns = buildDepthColumns(page, nodeBoxes);
  const sharedDefinitions = buildSharedClusterDefinitions(page);
  const sharedNodeIds = new Set(sharedDefinitions.flatMap((group) => group.nodes.map((node) => node.id)));
  const exclusiveChildren = buildExclusiveChildMap(page, sharedNodeIds);
  const subtreeHeightCache = new Map();

  const measureSubtree = (nodeId) => {
    if (subtreeHeightCache.has(nodeId)) {
      return subtreeHeightCache.get(nodeId);
    }

    const node = page.nodeMap.get(nodeId);
    const box = nodeBoxes.get(nodeId);
    const children = exclusiveChildren.get(nodeId) || [];

    if (!node || !box || children.length === 0) {
      subtreeHeightCache.set(nodeId, box?.height || 0);
      return box?.height || 0;
    }

    const childHeights = children.map((child) => measureSubtree(child.id));
    const gap = getSiblingGap(node, children.map((child) => nodeBoxes.get(child.id)).filter(Boolean));
    const childrenHeight = childHeights.reduce(
      (total, height, index) => total + height + (index > 0 ? gap : 0),
      0,
    );
    const subtreeHeight = Math.max(box.height, childrenHeight);
    subtreeHeightCache.set(nodeId, subtreeHeight);
    return subtreeHeight;
  };

  const placeSubtree = (nodeId, topY, allocatedHeight) => {
    const node = page.nodeMap.get(nodeId);
    const box = nodeBoxes.get(nodeId);
    const children = exclusiveChildren.get(nodeId) || [];
    const depth = getPlacementDepth(node);
    const x = layoutColumns.xByDepth[depth];

    if (children.length === 0) {
      positions.set(nodeId, {
        x,
        y: topY + (allocatedHeight - box.height) / 2,
        ...box,
      });
      return;
    }

    const childHeights = children.map((child) => measureSubtree(child.id));
    const gap = getSiblingGap(node, children.map((child) => nodeBoxes.get(child.id)).filter(Boolean));
    const childrenHeight = childHeights.reduce(
      (total, height, index) => total + height + (index > 0 ? gap : 0),
      0,
    );
    let childCursor = topY + (allocatedHeight - childrenHeight) / 2;

    children.forEach((child, index) => {
      const childHeight = childHeights[index];
      placeSubtree(child.id, childCursor, childHeight);
      childCursor += childHeight + gap;
    });

    const childCenters = children
      .map((child) => positions.get(child.id))
      .filter(Boolean)
      .map((childBox) => centerY(childBox));
    const targetCenter = childCenters.length > 0 ? average(childCenters) : topY + allocatedHeight / 2;

    positions.set(nodeId, {
      x,
      y: targetCenter - box.height / 2,
      ...box,
    });
  };

  let yCursor = 72;

  [...page.rootChildren]
    .sort((a, b) => a.y - b.y || a.title.localeCompare(b.title))
    .forEach((category) => {
      const subtreeHeight = measureSubtree(category.id);
      placeSubtree(category.id, yCursor, subtreeHeight);
      yCursor += subtreeHeight + getSectionGap(subtreeHeight);
    });

  const reservations = buildColumnReservations(page, positions);
  const sharedDefinitionsByDepth = new Map();

  sharedDefinitions.forEach((definition) => {
    const depth = clamp(definition.depth, 1, 3);
    if (!sharedDefinitionsByDepth.has(depth)) {
      sharedDefinitionsByDepth.set(depth, []);
    }
    sharedDefinitionsByDepth.get(depth).push(definition);
  });

  sharedDefinitionsByDepth.forEach((definitions, depth) => {
    definitions
      .sort((a, b) => {
        const aCenter = average(
          a.parentIds.map((parentId) => centerY(positions.get(parentId))).filter(Boolean),
        );
        const bCenter = average(
          b.parentIds.map((parentId) => centerY(positions.get(parentId))).filter(Boolean),
        );
        return aCenter - bCenter;
      })
      .forEach((definition, index) => {
        const cluster = buildSharedCluster(
          page,
          definition,
          positions,
          nodeBoxes,
          layoutColumns,
          reservations,
          { index, total: definitions.length, depth },
        );

        sharedClusters.push(cluster);
        cluster.nodeIds.forEach((nodeId) => {
          sharedClusterByNode.set(nodeId, cluster);
        });
      });
  });

  page.nodes
    .filter((node) => !positions.has(node.id))
    .sort((a, b) => a.y - b.y || a.title.localeCompare(b.title))
    .forEach((node) => {
      const depth = getPlacementDepth(node);
      const box = nodeBoxes.get(node.id);
      const columnSegments = reservations.get(depth) || [];
      const topY = reserveVerticalSlot(columnSegments, yCursor, box.height, 32);

      positions.set(node.id, {
        x: layoutColumns.xByDepth[depth],
        y: topY,
        ...box,
      });
      yCursor = topY + box.height + 42;
    });

  const padding = 48;
  const boundsSource = [...positions.values()];
  const minX = Math.min(...boundsSource.map((item) => item.x));
  const minY = Math.min(...boundsSource.map((item) => item.y));
  const maxX = Math.max(...boundsSource.map((item) => item.x + item.width));
  const maxY = Math.max(...boundsSource.map((item) => item.y + item.height));
  const nodeObstacleBoxes = new Map(
    [...positions.entries()].map(([nodeId, box]) => [nodeId, expandBox(box, 18, 12)]),
  );

  return {
    positions,
    sharedClusters,
    sharedClusterByNode,
    annotationPositions: [],
    nodeObstacleBoxes,
    annotationObstacles: [],
    edgeLaneMap: buildEdgeLaneMap(page, positions, sharedClusterByNode),
    offsetX: padding - minX,
    offsetY: padding - minY,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    columns: layoutColumns.xByDepth,
  };
}

function estimateLineCount(value = '', charsPerLine = 26, maxLines = 2) {
  if (!value) return 0;
  return Math.min(maxLines, Math.max(1, Math.ceil(value.length / charsPerLine)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getNodeSideAnchor(box, side, offsetX, offsetY, preferredY = null) {
  const x = box.x + offsetX;
  const y = box.y + offsetY;
  const centerY = y + box.height / 2;
  const inset = Math.min(18, Math.max(10, box.height * 0.22));
  const minY = y + inset;
  const maxY = y + box.height - inset;
  let anchorY = preferredY ?? centerY;

  if (Math.abs(anchorY - centerY) < 2) {
    anchorY = centerY + (side === 'right' ? inset * 0.65 : -inset * 0.65);
  }

  return {
    x: side === 'left' ? x : x + box.width,
    y: clamp(anchorY, minY, maxY),
  };
}

function getDirectionalEdgeAnchors(sourceBox, targetBox, offsetX, offsetY) {
  const sourceCenterY = centerY(sourceBox) + offsetY;
  const targetCenterY = centerY(targetBox) + offsetY;

  return {
    source: getNodeSideAnchor(sourceBox, 'right', offsetX, offsetY, targetCenterY),
    target: getNodeSideAnchor(targetBox, 'left', offsetX, offsetY, sourceCenterY),
  };
}

function expandBox(box, expandX = 0, expandY = expandX) {
  return {
    x: box.x - expandX,
    y: box.y - expandY,
    width: box.width + expandX * 2,
    height: box.height + expandY * 2,
  };
}

function buildOrthogonalEdgePath(sourceAnchor, targetAnchor, lane, obstacles = []) {
  const laneSpec =
    typeof lane === 'number'
      ? { startX: lane, endX: lane }
      : lane || {
          startX: sourceAnchor.x + Math.max(48, (targetAnchor.x - sourceAnchor.x) / 3),
          endX: targetAnchor.x - Math.max(48, (targetAnchor.x - sourceAnchor.x) / 3),
        };
  const minCorridor = sourceAnchor.x + 28;
  const maxCorridor = targetAnchor.x - 28;
  const preferredStartX = clamp(laneSpec.startX ?? laneSpec.endX ?? sourceAnchor.x + 56, minCorridor, maxCorridor);
  const preferredEndX = clamp(laneSpec.endX ?? laneSpec.startX ?? targetAnchor.x - 56, minCorridor, maxCorridor);
  const xCandidates = [
    preferredStartX,
    preferredEndX,
    (preferredStartX + preferredEndX) / 2,
  ];

  obstacles.forEach((box) => {
    xCandidates.push(clamp(box.x - 20, minCorridor, maxCorridor));
    xCandidates.push(clamp(box.x + box.width + 20, minCorridor, maxCorridor));
  });

  const uniqueX = [...new Set(xCandidates.map((value) => value.toFixed(2)))]
    .map(Number)
    .sort((a, b) => Math.abs(a - preferredStartX) - Math.abs(b - preferredStartX))
    .slice(0, 12);

  const directSegments = uniqueX
    .map((candidate) => ({
      candidate,
      segments: normalizePathSegments([
        { axis: 'H', x1: sourceAnchor.x, x2: candidate, y: sourceAnchor.y },
        { axis: 'V', x: candidate, y1: sourceAnchor.y, y2: targetAnchor.y },
        { axis: 'H', x1: candidate, x2: targetAnchor.x, y: targetAnchor.y },
      ]),
    }))
    .find(({ segments }) => !pathIntersectsAnyBox(segments, obstacles));

  if (directSegments) {
    return segmentsToPath(directSegments.segments);
  }

  const detourCandidates = [
    sourceAnchor.y,
    targetAnchor.y,
    average([sourceAnchor.y, targetAnchor.y]),
  ];

  obstacles.forEach((box) => {
    detourCandidates.push(box.y - 22);
    detourCandidates.push(box.y + box.height + 22);
  });

  const uniqueDetours = [...new Set(detourCandidates.map((value) => value.toFixed(2)))]
    .map(Number)
    .sort((a, b) => Math.abs(a - average([sourceAnchor.y, targetAnchor.y])) - Math.abs(b - average([sourceAnchor.y, targetAnchor.y])))
    .slice(0, 14);

  let bestSegments = null;
  let bestScore = Number.POSITIVE_INFINITY;

  uniqueX.forEach((startX) => {
    uniqueX.forEach((endX) => {
      uniqueDetours.forEach((detourY) => {
        const segments = normalizePathSegments([
          { axis: 'H', x1: sourceAnchor.x, x2: startX, y: sourceAnchor.y },
          { axis: 'V', x: startX, y1: sourceAnchor.y, y2: detourY },
          { axis: 'H', x1: startX, x2: endX, y: detourY },
          { axis: 'V', x: endX, y1: detourY, y2: targetAnchor.y },
          { axis: 'H', x1: endX, x2: targetAnchor.x, y: targetAnchor.y },
        ]);

        if (pathIntersectsAnyBox(segments, obstacles)) {
          return;
        }

        const score =
          pathLength(segments) +
          Math.abs(startX - preferredStartX) +
          Math.abs(endX - preferredEndX) +
          Math.abs(detourY - average([sourceAnchor.y, targetAnchor.y])) * 0.45;

        if (score < bestScore) {
          bestScore = score;
          bestSegments = segments;
        }
      });
    });
  });

  if (bestSegments) {
    return segmentsToPath(bestSegments);
  }

  return segmentsToPath(
    normalizePathSegments([
      { axis: 'H', x1: sourceAnchor.x, x2: preferredStartX, y: sourceAnchor.y },
      { axis: 'V', x: preferredStartX, y1: sourceAnchor.y, y2: targetAnchor.y },
      { axis: 'H', x1: preferredStartX, x2: targetAnchor.x, y: targetAnchor.y },
    ]),
  );
}

function normalizePathSegments(segments = []) {
  return segments.reduce((normalized, segment) => {
    if (segment.axis === 'H' && Math.abs(segment.x2 - segment.x1) < 0.5) {
      return normalized;
    }

    if (segment.axis === 'V' && Math.abs(segment.y2 - segment.y1) < 0.5) {
      return normalized;
    }

    const previous = normalized[normalized.length - 1];

    if (
      previous &&
      previous.axis === segment.axis &&
      ((segment.axis === 'H' && previous.y === segment.y) ||
        (segment.axis === 'V' && previous.x === segment.x))
    ) {
      if (segment.axis === 'H') {
        previous.x2 = segment.x2;
      } else {
        previous.y2 = segment.y2;
      }

      return normalized;
    }

    normalized.push({ ...segment });
    return normalized;
  }, []);
}

function segmentsToPath(segments = []) {
  if (segments.length === 0) {
    return '';
  }

  const [first, ...rest] = segments;
  const parts = [
    `M ${first.axis === 'H' ? first.x1 : first.x} ${first.axis === 'H' ? first.y : first.y1}`,
    first.axis === 'H'
      ? `H ${first.x2}`
      : `V ${first.y2}`,
  ];

  rest.forEach((segment) => {
    parts.push(
      segment.axis === 'H'
        ? `H ${segment.x2}`
        : `V ${segment.y2}`,
    );
  });

  return parts.join(' ');
}

function pathLength(segments = []) {
  return segments.reduce((total, segment) => {
    if (segment.axis === 'H') {
      return total + Math.abs(segment.x2 - segment.x1);
    }

    return total + Math.abs(segment.y2 - segment.y1);
  }, 0);
}

function pathIntersectsAnyBox(segments = [], obstacles = []) {
  return obstacles.some((box) =>
    segments.some((segment) =>
      segment.axis === 'H'
        ? horizontalSegmentIntersectsBox(segment.x1, segment.x2, segment.y, box)
        : verticalSegmentIntersectsBox(segment.x, segment.y1, segment.y2, box),
    ),
  );
}

function horizontalSegmentIntersectsBox(x1, x2, y, box) {
  if (y <= box.y || y >= box.y + box.height) {
    return false;
  }

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return maxX > box.x && minX < box.x + box.width;
}

function verticalSegmentIntersectsBox(x, y1, y2, box) {
  if (x <= box.x || x >= box.x + box.width) {
    return false;
  }

  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return maxY > box.y && minY < box.y + box.height;
}

function getEdgeRoute(layout, edge, sourceAnchor, targetAnchor) {
  const lane = layout.edgeLaneMap.get(edge.id);

  return {
    startX: lane?.startX != null ? lane.startX + layout.offsetX : (sourceAnchor.x + targetAnchor.x) / 2,
    endX: lane?.endX != null ? lane.endX + layout.offsetX : (sourceAnchor.x + targetAnchor.x) / 2,
  };
}

function collectAncestorState(page, nodeId, trail = new Set()) {
  if (!nodeId || trail.has(nodeId)) {
    return { nodeIds: new Set(), edgeIds: new Set() };
  }

  const node = page.nodeMap.get(nodeId);
  if (!node) {
    return { nodeIds: new Set(), edgeIds: new Set() };
  }

  const nextTrail = new Set(trail);
  nextTrail.add(nodeId);

  const nodeIds = new Set([nodeId]);
  const edgeIds = new Set();

  node.parentIds.forEach((parentId) => {
    const edge = page.edgeKeyMap.get(`${parentId}->${nodeId}`);
    if (edge) {
      edgeIds.add(edge.id);
    }

    const parentState = collectAncestorState(page, parentId, nextTrail);
    parentState.nodeIds.forEach((id) => nodeIds.add(id));
    parentState.edgeIds.forEach((id) => edgeIds.add(id));
  });

  return { nodeIds, edgeIds };
}

function collectDirectConnectionState(page, nodeId) {
  if (!nodeId) {
    return { nodeIds: new Set(), edgeIds: new Set() };
  }

  const node = page.nodeMap.get(nodeId);
  if (!node) {
    return { nodeIds: new Set(), edgeIds: new Set() };
  }

  const nodeIds = new Set([nodeId]);
  const edgeIds = new Set();

  node.parentIds.forEach((parentId) => {
    nodeIds.add(parentId);
    const edge = page.edgeKeyMap.get(`${parentId}->${nodeId}`);
    if (edge) {
      edgeIds.add(edge.id);
    }
  });

  node.childIds.forEach((childId) => {
    nodeIds.add(childId);
    const edge = page.edgeKeyMap.get(`${nodeId}->${childId}`);
    if (edge) {
      edgeIds.add(edge.id);
    }
  });

  return { nodeIds, edgeIds };
}

function average(values = []) {
  return values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
}

function averageParentCenter(parentIds, positions) {
  return average(parentIds.map((parentId) => centerY(positions.get(parentId))));
}

function centerY(box) {
  return box.y + box.height / 2;
}

function normalizeGraphKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export default App;
