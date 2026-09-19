function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

function sortedIds(ids) {
  return [...new Set(ids)].sort();
}

function addCoverage(coverageByNode, nodeId, seedId) {
  if (!coverageByNode.has(nodeId)) coverageByNode.set(nodeId, new Set());
  coverageByNode.get(nodeId).add(seedId);
}

function requireRecord(record, kind, id) {
  if (!record) throw new Error(`unknown ${kind} ${id}`);
  return record;
}

function validateOntologyEdge(edge, indexes) {
  const relation = indexes.relationById.get(edge.relation);
  const source = indexes.nodeById.get(edge.source);
  const target = indexes.nodeById.get(edge.target);
  if (!relation || !source || !target
    || !relation.source_types.includes(source.type)
    || !relation.target_types.includes(target.type)) {
    throw new Error(`edge ${edge.id} is not allowed by ontology`);
  }
}

function traverseFromSeeds(seedIds, allowedRelationTypes, maxDepth, indexes) {
  const allowedRelations = new Set(allowedRelationTypes);
  const coverageByNode = new Map();
  const acceptedEdgeIds = new Set();

  for (const seedId of seedIds) {
    requireRecord(indexes.nodeById.get(seedId), 'seed node', seedId);
    const queue = [{ node_id: seedId, depth: 0 }];
    const visited = new Set([seedId]);
    addCoverage(coverageByNode, seedId, seedId);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current.depth >= maxDepth) continue;
      const edges = indexes.adjacencyByNodeId.get(current.node_id) || [];
      for (const edge of edges) {
        if (!allowedRelations.has(edge.relation)) continue;
        validateOntologyEdge(edge, indexes);
        acceptedEdgeIds.add(edge.id);
        const nextNodeId = edge.source === current.node_id ? edge.target : edge.source;
        addCoverage(coverageByNode, nextNodeId, seedId);
        if (!visited.has(nextNodeId)) {
          visited.add(nextNodeId);
          queue.push({ node_id: nextNodeId, depth: current.depth + 1 });
        }
      }
    }
  }

  return { coverageByNode, acceptedEdgeIds };
}

function collectEvidenceAndSources(nodeIds, edgeIds, indexes) {
  const evidenceIds = new Set();
  for (const nodeId of nodeIds) {
    const node = requireRecord(indexes.nodeById.get(nodeId), 'node', nodeId);
    for (const evidenceId of node.evidence_refs || []) evidenceIds.add(evidenceId);
  }
  for (const edgeId of edgeIds) {
    const edge = requireRecord(indexes.edgeById.get(edgeId), 'edge', edgeId);
    for (const evidenceId of edge.evidence_refs || []) evidenceIds.add(evidenceId);
  }

  const sortedEvidenceIds = sortedIds(evidenceIds);
  const sourceIds = sortedEvidenceIds.map((evidenceId) => (
    requireRecord(indexes.evidenceById.get(evidenceId), 'evidence', evidenceId).source_id
  ));
  const sortedSourceIds = sortedIds(sourceIds);
  for (const sourceId of sortedSourceIds) {
    requireRecord(indexes.sourceById.get(sourceId), 'source', sourceId);
  }
  return { evidenceIds: sortedEvidenceIds, sourceIds: sortedSourceIds };
}

function collectPendingWarnings(nodeIds, edgeIds, evidenceIds, sourceIds, indexes) {
  const pendingIds = [];
  const records = [
    ...nodeIds.map((id) => indexes.nodeById.get(id)),
    ...edgeIds.map((id) => indexes.edgeById.get(id)),
    ...evidenceIds.map((id) => indexes.evidenceById.get(id)),
    ...sourceIds.map((id) => indexes.sourceById.get(id)),
  ];
  for (const record of records) {
    if (record.review_status === 'pending_human_review') pendingIds.push(record.id);
  }
  return pendingIds.length
    ? [{ code: 'pending_human_review', record_ids: sortedIds(pendingIds) }]
    : [];
}

function classificationFor(coverage, seedCount) {
  if (coverage.size === seedCount) return 'shared';
  if (coverage.size >= 2) return 'overlap';
  return 'specific';
}

function classificationForThemes(coverage, seedThemesById, themeCount) {
  const coveredThemes = new Set();
  for (const seedId of coverage) {
    for (const themeId of seedThemesById.get(seedId) || []) coveredThemes.add(themeId);
  }
  if (coveredThemes.size === themeCount) return 'shared';
  if (coveredThemes.size >= 2) return 'overlap';
  return 'specific';
}

function groupedResultLabels(groups, indexes) {
  const labelsByGroup = [
    ['shared', '共同'],
    ['overlap', '部分主题交集'],
    ['specific', '单一主题特异'],
  ].flatMap(([group, label]) => {
    const labels = groups[group].map((nodeId) => indexes.nodeById.get(nodeId).label);
    return labels.length ? [`${label}：${labels.join('、')}`] : [];
  });
  return labelsByGroup.join('；');
}

export function buildIndexes(data) {
  const nodeById = new Map((data.nodes || []).map((node) => [node.id, node]));
  const edgeById = new Map((data.edges || []).map((edge) => [edge.id, edge]));
  const pathById = new Map((data.paths || []).map((path) => [path.id, path]));
  const evidenceById = new Map((data.evidence || []).map((evidence) => [evidence.id, evidence]));
  const sourceById = new Map((data.sources || []).map((source) => [source.id, source]));
  const questionById = new Map((data.questions || []).map((question) => [question.id, question]));
  const relationById = new Map(((data.ontology && data.ontology.relations) || [])
    .map((relation) => [relation.id, relation]));
  const adjacencyByNodeId = new Map([...nodeById.keys()].map((id) => [id, []]));

  for (const edge of edgeById.values()) {
    if (!adjacencyByNodeId.has(edge.source)) adjacencyByNodeId.set(edge.source, []);
    if (!adjacencyByNodeId.has(edge.target)) adjacencyByNodeId.set(edge.target, []);
    adjacencyByNodeId.get(edge.source).push(edge);
    adjacencyByNodeId.get(edge.target).push(edge);
  }
  for (const edges of adjacencyByNodeId.values()) edges.sort(compareById);

  return {
    nodeById,
    edgeById,
    pathById,
    evidenceById,
    sourceById,
    questionById,
    relationById,
    adjacencyByNodeId,
  };
}

export function executeQuestion(question, data) {
  const indexes = buildIndexes(data);
  const seedIds = sortedIds(question.seed_node_ids || []);
  const { coverageByNode, acceptedEdgeIds } = traverseFromSeeds(
    seedIds,
    question.allowed_relation_types || [],
    question.max_depth || 0,
    indexes,
  );
  const targetTypes = new Set(question.target_node_types || []);
  const seedIdSet = new Set(seedIds);
  const groups = { shared: [], overlap: [], specific: [] };

  for (const [nodeId, coverage] of coverageByNode) {
    const node = indexes.nodeById.get(nodeId);
    if (!seedIdSet.has(nodeId) && targetTypes.has(node.type)) {
      groups[classificationFor(coverage, seedIds.length)].push(nodeId);
    }
  }
  for (const ids of Object.values(groups)) ids.sort();

  const nodeIds = sortedIds(coverageByNode.keys());
  const nodeIdSet = new Set(nodeIds);
  const edgeIds = [...acceptedEdgeIds]
    .filter((edgeId) => {
      const edge = indexes.edgeById.get(edgeId);
      return nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target);
    })
    .sort();
  const pathIds = sortedIds((question.featured_path_ids || []).map((pathId) => (
    requireRecord(indexes.pathById.get(pathId), 'path', pathId).id
  )));
  const { evidenceIds, sourceIds } = collectEvidenceAndSources(nodeIds, edgeIds, indexes);
  const resultIds = [...groups.shared, ...groups.overlap, ...groups.specific].sort();
  const resultLabels = groups.overlap.length || groups.specific.length
    ? groupedResultLabels(groups, indexes)
    : resultIds.map((nodeId) => indexes.nodeById.get(nodeId).label).join('、');
  const summary = groups.overlap.length || groups.specific.length
    ? `按所选主题的关联范围分组：${resultLabels}。`
    : String(question.answer_template || '').replace('{result_node_labels}', resultLabels);

  return {
    query_id: question.id,
    summary,
    groups,
    node_ids: nodeIds,
    edge_ids: edgeIds,
    path_ids: pathIds,
    evidence_ids: evidenceIds,
    source_ids: sourceIds,
    warnings: collectPendingWarnings(nodeIds, edgeIds, evidenceIds, sourceIds, indexes),
    boundary_note: question.boundary_note,
  };
}

export function buildWorkbenchResult(themeIds, data) {
  const indexes = buildIndexes(data);
  const allowedThemeIds = new Set(['obesity', 'hypertension', 'diabetes']);
  const themes = sortedIds((themeIds || []).filter((themeId) => allowedThemeIds.has(themeId)));
  const seedIds = [...indexes.nodeById.values()]
    .filter((node) => node.type === 'HealthState'
      && themes.some((theme) => (node.themes || []).includes(theme)))
    .map((node) => node.id)
    .sort();
  const seedThemesById = new Map(seedIds.map((seedId) => [
    seedId,
    (indexes.nodeById.get(seedId).themes || []).filter((theme) => themes.includes(theme)),
  ]));
  const dimensionConfigs = [
    ['factors', 'RiskFactor', ['HAS_RISK_FACTOR'], 1],
    ['actions', 'Intervention', ['MANAGED_BY'], 1],
    ['indicators', 'Indicator', ['MEASURED_BY'], 1],
    ['goals', 'ManagementGoal', ['MANAGED_BY', 'CONTRIBUTES_TO_GOAL'], 2],
  ];
  const dimensions = {};

  for (const [name, targetType, relations, maxDepth] of dimensionConfigs) {
    const { coverageByNode } = traverseFromSeeds(seedIds, relations, maxDepth, indexes);
    dimensions[name] = [...coverageByNode.entries()]
      .filter(([nodeId]) => indexes.nodeById.get(nodeId).type === targetType)
      .map(([nodeId, coverage]) => {
        const node = indexes.nodeById.get(nodeId);
        return {
          node_id: node.id,
          label: node.label,
          type: node.type,
          classification: classificationForThemes(coverage, seedThemesById, themes.length),
        };
      })
      .sort((left, right) => left.node_id.localeCompare(right.node_id));
  }

  return { themes, dimensions };
}

export function buildEntityView(nodeId, data) {
  const indexes = buildIndexes(data);
  const entity = requireRecord(indexes.nodeById.get(nodeId), 'node', nodeId);
  const outgoing = (indexes.adjacencyByNodeId.get(nodeId) || [])
    .filter((edge) => edge.source === nodeId)
    .sort(compareById);
  const incoming = (indexes.adjacencyByNodeId.get(nodeId) || [])
    .filter((edge) => edge.target === nodeId)
    .sort(compareById);
  const relationIds = [...outgoing, ...incoming].map((edge) => edge.id).sort();
  const questionIds = (data.questions || [])
    .filter((question) => executeQuestion(question, data).node_ids.includes(nodeId))
    .map((question) => question.id)
    .sort();
  const pathIds = (data.paths || [])
    .filter((path) => (path.node_ids || []).includes(nodeId))
    .map((path) => path.id)
    .sort();
  const { evidenceIds, sourceIds } = collectEvidenceAndSources(
    [nodeId],
    relationIds,
    indexes,
  );

  return {
    entity,
    relations: { outgoing, incoming },
    question_ids: questionIds,
    path_ids: pathIds,
    evidence_ids: evidenceIds,
    source_ids: sourceIds,
    evidence: evidenceIds.map((id) => indexes.evidenceById.get(id)),
    sources: sourceIds.map((id) => indexes.sourceById.get(id)),
    warnings: collectPendingWarnings([nodeId], relationIds, evidenceIds, sourceIds, indexes),
  };
}

export function serializeQueryResult(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}
