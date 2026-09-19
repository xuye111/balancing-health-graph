const TYPE_ORDER = [
  'Population',
  'HealthState',
  'RiskFactor',
  'Indicator',
  'Assessment',
  'Intervention',
  'ManagementGoal',
  'MonitoringActivity',
  'FollowUpActivity',
  'SafetySignal',
  'EvidenceSource',
];

const DATA_FILES = [
  ['ontology', 'ontology/chronic-care-ontology.json'],
  ['nodes', 'data/nodes.json'],
  ['edges', 'data/edges.json'],
  ['evidence', 'data/evidence.json'],
  ['paths', 'data/paths.json'],
  ['sources', 'sources/sources.json'],
  ['questions', 'data/questions.json'],
];


export function safeOfficialUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}


export async function loadProjectData(fetchImpl = fetch, base = '..') {
  const entries = await Promise.all(DATA_FILES.map(async ([key, path]) => {
    const url = `${base}/${path}`;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return [key, await response.json()];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${url}: ${message}`, { cause: error });
    }
  }));
  return Object.fromEntries(entries);
}


export function filterGraph(graph, theme) {
  if (theme === 'all') {
    return { nodes: [...graph.nodes], edges: [...graph.edges] };
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const retained = new Set(
    graph.nodes
      .filter((node) => node.themes.includes(theme))
      .map((node) => node.id),
  );

  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if (retained.has(source.id) && target.themes.includes('shared')) retained.add(target.id);
    if (retained.has(target.id) && source.themes.includes('shared')) retained.add(source.id);
  }

  return {
    nodes: graph.nodes.filter((node) => retained.has(node.id)),
    edges: graph.edges.filter(
      (edge) => retained.has(edge.source) && retained.has(edge.target),
    ),
  };
}


export function focusPath(graph, path) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const nodes = path.node_ids.map((id) => {
    const node = nodeById.get(id);
    if (!node) throw new Error(`missing node ${id} in curated path`);
    return node;
  });
  const edges = path.edge_ids.map((id) => {
    const edge = edgeById.get(id);
    if (!edge) throw new Error(`missing edge ${id} in curated path`);
    return edge;
  });
  return { nodes, edges };
}


export function buildDetails(selection, graph, evidenceById, sourcesById) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  let neighbors = [];
  if (selection.type && nodeById.has(selection.id)) {
    const neighborIds = new Set();
    for (const edge of graph.edges) {
      if (edge.source === selection.id) neighborIds.add(edge.target);
      if (edge.target === selection.id) neighborIds.add(edge.source);
    }
    neighbors = [...neighborIds]
      .map((id) => nodeById.get(id))
      .filter(Boolean);
  } else if (selection.source && selection.target) {
    neighbors = [nodeById.get(selection.source), nodeById.get(selection.target)].filter(Boolean);
  }

  const evidence = (selection.evidence_refs || [])
    .map((id) => evidenceById.get(id))
    .filter(Boolean);
  const sourceIds = [...new Set(evidence.map((item) => item.source_id))];
  const sources = sourceIds.map((id) => sourcesById.get(id)).filter(Boolean);

  return {
    id: selection.id,
    label: selection.label || selection.relation || selection.id,
    definition: selection.definition || '',
    type: selection.type || 'Relation',
    relation: selection.relation || null,
    themes: selection.themes || [],
    review_status: selection.review_status || 'structure_only',
    neighbors,
    evidence,
    sources,
  };
}


export function computeLayout(nodes, _edges, width, height) {
  const marginX = Math.max(72, width * 0.07);
  const marginY = Math.max(64, height * 0.1);
  const usableWidth = Math.max(240, width - marginX * 2);
  const usableHeight = Math.max(240, height - marginY * 2);
  const presentTypes = TYPE_ORDER.filter((type) => nodes.some((node) => node.type === type));
  const unknownTypes = [...new Set(nodes.map((node) => node.type))]
    .filter((type) => !TYPE_ORDER.includes(type))
    .sort();
  const orderedTypes = [...presentTypes, ...unknownTypes];
  const positions = {};

  orderedTypes.forEach((type, typeIndex) => {
    const members = nodes
      .filter((node) => node.type === type)
      .sort((left, right) => left.id.localeCompare(right.id));
    const x = orderedTypes.length === 1
      ? width / 2
      : marginX + (usableWidth * typeIndex) / (orderedTypes.length - 1);
    members.forEach((node, memberIndex) => {
      const y = members.length === 1
        ? height / 2
        : marginY + (usableHeight * memberIndex) / (members.length - 1);
      positions[node.id] = { x, y };
    });
  });

  return positions;
}
