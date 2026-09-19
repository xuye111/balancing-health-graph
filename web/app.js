import {
  buildDetails,
  computeLayout,
  filterGraph,
  focusPath,
  loadProjectData,
  safeOfficialUrl,
} from './graph-model.js';
import { buildEntityView, buildWorkbenchResult, executeQuestion, serializeQueryResult } from './query-model.js';
import { parseRoute, routeHref } from './router.js';


const THEME_META = [
  { id: 'all', label: '完整图谱' },
  { id: 'shared', label: '共享因素' },
  { id: 'obesity', label: '肥胖' },
  { id: 'hypertension', label: '高血压' },
  { id: 'diabetes', label: '糖尿病' },
];
const SOURCE_ROLE_LABELS = {
  current_standard: '现行标准',
  current_technical: '现行技术依据',
  current_policy: '现行政策',
  current_service_model: '现行服务模型',
  clinical_supplement: '临床补充',
  policy_context: '政策背景',
  historical_baseline: '历史基线',
};
const REVIEW_LABELS = {
  verified: '已核对',
  pending_human_review: '待人工核对',
  structure_only: '仅结构',
};
const THEME_COLORS = {
  shared: '#68847e',
  obesity: '#da8c44',
  hypertension: '#d85c6f',
  diabetes: '#467ac7',
};
const WORKBENCH_THEME_IDS = THEME_META
  .filter((theme) => !['all', 'shared'].includes(theme.id))
  .map((theme) => theme.id);
const WORKBENCH_DIMENSIONS = {
  factors: '风险因素',
  actions: '生活方式行动',
  indicators: '观察指标',
  goals: '管理目标',
};
const CLASSIFICATION_LABELS = {
  shared: 'shared',
  overlap: 'overlap',
  specific: 'specific',
};
const CANONICAL_DATA_FILES = [
  'ontology/chronic-care-ontology.json',
  'data/nodes.json',
  'data/edges.json',
  'data/evidence.json',
  'data/paths.json',
  'sources/sources.json',
  'data/questions.json',
];
const VALIDATION_COMMANDS = [
  'python3 scripts/validate_graph.py',
  "python3 -m unittest discover -s tests -p 'test_*.py' -v",
  'node --test tests/*.test.mjs',
];


const state = {
  data: null,
  graph: null,
  activeTheme: null,
  activePath: null,
  selectedId: null,
  transform: { x: 0, y: 0, scale: 1 },
  route: null,
  queryResult: null,
  entityResult: null,
  workbenchResult: null,
  evidenceFilters: { theme: 'all', source_role: 'all', issuer: 'all', review_status: 'all' },
};

const elements = {
  appStatus: document.querySelector('#app-status'),
  canvas: document.querySelector('#graph-canvas'),
  graphCount: document.querySelector('#graph-count'),
  error: document.querySelector('#graph-error'),
  themeTabs: document.querySelector('#theme-tabs'),
  pathList: document.querySelector('#path-list'),
  detail: document.querySelector('#detail-panel'),
  ontology: document.querySelector('#ontology-panel'),
  sources: document.querySelector('#sources-panel'),
  status: document.querySelector('#status-panel'),
  reset: document.querySelector('#reset-view'),
  featuredQuestions: document.querySelector('#featured-question-list'),
  questionList: document.querySelector('#question-list'),
  questionSummary: document.querySelector('#question-summary'),
  questionGraphCanvas: document.querySelector('#question-graph-canvas'),
  questionGraphCount: document.querySelector('#question-graph-count'),
  questionPaths: document.querySelector('#question-path-list'),
  questionEvidence: document.querySelector('#question-evidence-list'),
  questionBoundary: document.querySelector('#question-boundary'),
  conditionSelector: document.querySelector('#condition-selector'),
  workbenchDimensions: {
    factors: document.querySelector('#workbench-factors'),
    actions: document.querySelector('#workbench-actions'),
    indicators: document.querySelector('#workbench-indicators'),
    goals: document.querySelector('#workbench-goals'),
  },
  entityHeader: document.querySelector('#entity-header'),
  entityRelations: document.querySelector('#entity-relations'),
  entityEvidence: document.querySelector('#entity-evidence'),
  entityBacklinks: document.querySelector('#entity-backlinks'),
  evidenceFilters: document.querySelector('#evidence-filters'),
  evidenceResults: document.querySelector('#evidence-results'),
  ontologyClasses: document.querySelector('#ontology-classes'),
  ontologyRelations: document.querySelector('#ontology-relations'),
  ontologyQueryExample: document.querySelector('#ontology-query-example'),
  developerQuery: document.querySelector('#developer-query'),
  developerDataFiles: document.querySelector('#developer-data-files'),
  developerValidation: document.querySelector('#developer-validation'),
  downloadQueryJson: document.querySelector('#download-query-json'),
  routeViews: document.querySelectorAll('[data-route-view]'),
  routeLinks: document.querySelectorAll('[data-route-link]'),
};


export function renderRoute(route) {
  const viewName = route.name === 'not-found' ? 'not-found' : route.name;
  const view = document.querySelector(`#${viewName}-view`) || document.querySelector('#not-found-view');
  state.route = view === document.querySelector('#not-found-view') && route.name !== 'not-found'
    ? { name: 'not-found', id: null, themes: [] }
    : route;
  elements.routeViews.forEach((element) => {
    element.hidden = element !== view;
  });
  elements.routeLinks.forEach((link) => {
    const active = link.getAttribute('href') === routeHref(state.route.name);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (state.data) {
    if (state.route.name === 'home') renderHome();
    if (state.route.name === 'questions') renderQuestionCenter();
    if (state.route.name === 'question') renderQuestionResult(state.route.id);
    if (state.route.name === 'workbench') renderWorkbench(state.route.themes);
    if (state.route.name === 'entity') renderEntity(state.route.id);
    if (state.route.name === 'evidence') renderEvidence();
    if (state.route.name === 'ontology') renderOntology();
    if (state.route.name === 'developer') renderDeveloper(state.route.id);
  }
  const heading = view.querySelector('h1[tabindex="-1"], h2[tabindex="-1"]');
  if (heading) requestAnimationFrame(() => heading.focus({ preventScroll: true }));
}


function syncRoute() {
  renderRoute(parseRoute(window.location.hash));
}


function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function renderState(container, stateName, kicker, title, description, resetHref = null, actionLabel = '恢复查看') {
  container.hidden = false;
  container.innerHTML = `
    <div class="recoverable-state ${escapeHtml(stateName)}">
      <div class="section-kicker">${escapeHtml(kicker)}</div>
      <h1 tabindex="-1">${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      ${resetHref ? `<a class="button primary" data-recover-empty href="${escapeHtml(resetHref)}">${escapeHtml(actionLabel)}</a>` : ''}
    </div>
  `;
}


function renderLoading(container, label) {
  renderState(container, 'loading', 'Loading', '正在加载', `${label}正在加载，请稍候。`);
}


function renderEmpty(container, title, description, resetHref) {
  renderState(container, 'empty', 'No Results', title, description, resetHref);
}


function renderFailure(container, error, failedFile = null) {
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  const fileNote = failedFile ? `未能加载：${failedFile}。` : '';
  renderState(container, 'failure', 'Recoverable Error', '暂时无法完成此操作', `${fileNote}${message}。请检查本地服务后重试。`, '#home', '回到首页');
}


function renderNotFound(kind, id) {
  const isQuestion = kind === 'question';
  const label = isQuestion ? '问题' : '概念';
  const destination = isQuestion ? '#questions' : '#workbench';
  const action = isQuestion ? '回到问题中心' : '前往共管工作台';
  return `
    <div class="recoverable-state not-found">
      <div class="section-kicker">${isQuestion ? 'Question' : 'Entity'} Not Found</div>
      <h1 tabindex="-1">未找到这个${label}</h1>
      <p>${label}标识 “${escapeHtml(id)}” 不在当前数据集中。请重新选择一个可用记录。</p>
      <a class="button primary" href="${destination}">${action}</a>
    </div>
  `;
}


function setRouteHeading(container, headingId) {
  const heading = container.querySelector('h1[tabindex="-1"], h2[tabindex="-1"]');
  if (heading) heading.id = headingId;
}


function sourceLinkMarkup(source, label) {
  if (!source) return '';
  const officialUrl = safeOfficialUrl(source.official_url);
  if (!officialUrl) return '<span class="source-link unavailable">官方链接不可用</span>';
  return `<a class="source-link" href="${escapeHtml(officialUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)} ↗</a>`;
}


function themeLabel(themeId) {
  return THEME_META.find((theme) => theme.id === themeId)?.label || themeId;
}


function renderQuestionCards(questions) {
  return questions.map((question) => `
    <article class="question-card">
      <div class="question-card-meta"><span>${escapeHtml(question.category)}</span><span>${question.themes.map(themeLabel).map(escapeHtml).join(' · ')}</span></div>
      <h3>${escapeHtml(question.title)}</h3>
      <p>${escapeHtml(question.description)}</p>
      <a class="text-link" href="${routeHref('question', { id: question.id })}">查看可追溯结果 →</a>
    </article>
  `).join('');
}


export function renderHome() {
  elements.featuredQuestions.innerHTML = renderQuestionCards(state.data.questions);
}


export function renderQuestionCenter() {
  elements.questionList.innerHTML = renderQuestionCards(state.data.questions);
}


function renderNodeLinks(nodeIds) {
  const nodeById = new Map(state.data.nodes.map((node) => [node.id, node]));
  return nodeIds.map((nodeId) => {
    const node = nodeById.get(nodeId);
    return node ? `<a href="${routeHref('entity', { id: node.id })}">${escapeHtml(node.label)}</a>` : '';
  }).join('');
}


function renderResultGroup(label, nodeIds) {
  return `
    <article class="result-group">
      <h2>${label}</h2>
      <div class="result-node-links">${renderNodeLinks(nodeIds) || '<span>当前查询未返回这一类节点</span>'}</div>
    </article>
  `;
}


function renderQuestionNotFound(questionId) {
  state.queryResult = null;
  state.workbenchResult = null;
  elements.questionSummary.innerHTML = renderNotFound('question', questionId);
  setRouteHeading(elements.questionSummary, 'question-view-title');
  elements.questionGraphCanvas.innerHTML = '';
  elements.questionGraphCount.textContent = '—';
  elements.questionPaths.innerHTML = '';
  elements.questionEvidence.innerHTML = '';
  elements.questionBoundary.innerHTML = '';
}


export function renderQuestionResult(questionId) {
  state.entityResult = null;
  state.workbenchResult = null;
  state.queryResult = null;
  const question = state.data.questions.find((item) => item.id === questionId);
  if (!question) {
    renderQuestionNotFound(questionId);
    return;
  }

  let result;
  try {
    result = executeQuestion(question, state.data);
  } catch (error) {
    renderFailure(elements.questionSummary, error, '当前问题查询');
    setRouteHeading(elements.questionSummary, 'question-view-title');
    elements.questionGraphCanvas.innerHTML = '';
    elements.questionGraphCount.textContent = '查询失败';
    elements.questionPaths.innerHTML = '';
    elements.questionEvidence.innerHTML = '';
    elements.questionBoundary.innerHTML = '';
    return;
  }
  state.queryResult = result;
  const nodeById = new Map(state.data.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(state.data.edges.map((edge) => [edge.id, edge]));
  const pathById = new Map(state.data.paths.map((path) => [path.id, path]));
  const evidenceById = new Map(state.data.evidence.map((item) => [item.id, item]));
  const sourceById = new Map(state.data.sources.map((item) => [item.id, item]));
  const graph = {
    nodes: result.node_ids.map((id) => nodeById.get(id)).filter(Boolean),
    edges: result.edge_ids.map((id) => edgeById.get(id)).filter(Boolean),
  };
  const warningMarkup = result.warnings.length
    ? `<p class="result-warning"><span class="status-badge pending_human_review">待人工核对</span> 查询涉及待人工核对的记录；请结合来源状态使用。</p>`
    : '';

  elements.questionSummary.innerHTML = `
    <div class="question-page-heading">
      <div class="section-kicker">Traceable Question</div>
      <h1 tabindex="-1">${escapeHtml(question.title)}</h1>
      <p>${escapeHtml(question.description)}</p>
      <p class="question-answer">${escapeHtml(result.summary)}</p>
      ${warningMarkup}
      <div class="hero-actions"><button class="button secondary" type="button" data-question-evidence-focus>核查本次证据</button><a class="text-link" href="${routeHref('developer', { id: question.id })}">了解接入 / 查看 Query JSON →</a></div>
    </div>
    <div class="result-groups">
      ${renderResultGroup('共同关联', result.groups.shared)}
      ${renderResultGroup('部分交集', result.groups.overlap)}
      ${renderResultGroup('特定关联', result.groups.specific)}
    </div>
    <div class="result-all-nodes"><span>查询节点</span><div class="result-node-links">${renderNodeLinks(result.node_ids)}</div></div>
  `;
  setRouteHeading(elements.questionSummary, 'question-view-title');
  elements.questionSummary.querySelector('[data-question-evidence-focus]').addEventListener('click', () => {
    const evidenceTitle = document.querySelector('#question-evidence-title');
    evidenceTitle.tabIndex = -1;
    evidenceTitle.scrollIntoView({ behavior: 'auto', block: 'start' });
    evidenceTitle.focus({ preventScroll: true });
  });
  renderGraph(graph, elements.questionGraphCanvas, elements.questionGraphCount, (node) => {
    window.location.hash = routeHref('entity', { id: node.id });
  });
  elements.questionPaths.innerHTML = result.path_ids.map((pathId) => {
    const path = pathById.get(pathId);
    return path ? `<article class="result-path-card"><h3>${escapeHtml(path.title)}</h3><p>${escapeHtml(path.summary)}</p></article>` : '';
  }).join('');
  const evidenceMarkup = result.evidence_ids.map((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    const source = evidence ? sourceById.get(evidence.source_id) : null;
    return evidence ? `
      <article class="result-evidence-card">
        <p>${escapeHtml(evidence.claim_summary)}</p>
        <small>${escapeHtml(evidence.locator)}</small>
        ${sourceLinkMarkup(source, source?.title || '查看官方来源')}
      </article>
    ` : '';
  }).join('');
  const sourceMarkup = result.source_ids.map((sourceId) => {
    const source = sourceById.get(sourceId);
    return source ? `
      <article class="result-source-card">
        <span>${escapeHtml(SOURCE_ROLE_LABELS[source.source_role] || '来源')}</span>
        <h3>${escapeHtml(source.title)}</h3>
        <p>${escapeHtml(source.issuer)} · ${source.year}</p>
        ${sourceLinkMarkup(source, '查看官方来源')}
      </article>
    ` : '';
  }).join('');
  elements.questionEvidence.innerHTML = `${evidenceMarkup}<div class="result-source-grid">${sourceMarkup}</div>`;
  elements.questionBoundary.innerHTML = `<strong>使用边界</strong><p>${escapeHtml(result.boundary_note)}</p>`;
}


function normalizeWorkbenchThemes(themeIds) {
  const selected = new Set(themeIds || []);
  const normalized = WORKBENCH_THEME_IDS.filter((themeId) => selected.has(themeId));
  return normalized.length ? normalized : [WORKBENCH_THEME_IDS[0]];
}


function renderWorkbenchDimension(dimension, items) {
  const groups = ['shared', 'overlap', 'specific'].map((classification) => {
    const links = items
      .filter((item) => item.classification === classification)
      .map((item) => `<a href="${routeHref('entity', { id: item.node_id })}">${escapeHtml(item.label)}</a>`)
      .join('');
    return `
      <div class="workbench-group">
        <span class="classification-badge ${classification}">${CLASSIFICATION_LABELS[classification]}</span>
        <div class="workbench-links">${links || '<span>当前选择未返回</span>'}</div>
      </div>
    `;
  }).join('');
  return `
    <div class="workbench-dimension-heading">
      <div><span>Dimension</span><h2 id="workbench-${dimension}-title">${WORKBENCH_DIMENSIONS[dimension]}</h2></div>
      <small>仅展示图谱关联</small>
    </div>
    <div class="workbench-group-list">${groups}</div>
  `;
}


export function renderWorkbench(themeIds) {
  const themes = normalizeWorkbenchThemes(themeIds);
  const result = buildWorkbenchResult(themes, state.data);
  state.queryResult = null;
  state.entityResult = null;
  state.workbenchResult = result;
  elements.conditionSelector.innerHTML = WORKBENCH_THEME_IDS.map((themeId) => {
    const selected = themes.includes(themeId);
    return `<button type="button" class="${selected ? 'active' : ''}" data-workbench-theme="${themeId}" aria-pressed="${selected}">${escapeHtml(themeLabel(themeId))}</button>`;
  }).join('');
  elements.conditionSelector.querySelectorAll('[data-workbench-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      const themeId = button.dataset.workbenchTheme;
      const nextThemes = themes.includes(themeId)
        ? themes.filter((id) => id !== themeId)
        : [...themes, themeId];
      if (!nextThemes.length) return;
      window.location.hash = routeHref('workbench', { themes: normalizeWorkbenchThemes(nextThemes) });
    });
  });
  for (const [dimension, container] of Object.entries(elements.workbenchDimensions)) {
    container.innerHTML = renderWorkbenchDimension(dimension, result.dimensions[dimension]);
  }
}


function renderRelationDirection(title, relations, direction, nodeById, relationById) {
  const groups = new Map();
  for (const edge of relations) {
    const relation = relationById.get(edge.relation);
    if (!groups.has(edge.relation)) groups.set(edge.relation, { relation, nodes: [] });
    const relatedId = direction === 'outgoing' ? edge.target : edge.source;
    const related = nodeById.get(relatedId);
    if (related) groups.get(edge.relation).nodes.push(related);
  }
  const groupMarkup = [...groups.entries()].map(([relationId, group]) => `
    <article class="relation-group">
      <h3>${escapeHtml(group.relation?.label || relationId)}</h3>
      <p>${escapeHtml(group.relation?.definition || '关系由当前本体定义。')}</p>
      <div class="entity-link-list">${group.nodes.map((node) => `<a href="${routeHref('entity', { id: node.id })}">${escapeHtml(node.label)}</a>`).join('')}</div>
    </article>
  `).join('');
  return `<div class="relation-direction"><h2>${escapeHtml(title)}</h2>${groupMarkup || '<p class="muted-copy">当前没有这类关系。</p>'}</div>`;
}


export function renderEntity(nodeId) {
  const node = state.data.nodes.find((item) => item.id === nodeId);
  state.queryResult = null;
  state.workbenchResult = null;
  if (!node) {
    state.entityResult = null;
    elements.entityHeader.innerHTML = renderNotFound('entity', nodeId);
    setRouteHeading(elements.entityHeader, 'entity-view-title');
    elements.entityRelations.innerHTML = '';
    elements.entityBacklinks.innerHTML = '';
    elements.entityEvidence.innerHTML = '';
    return;
  }

  const result = buildEntityView(nodeId, state.data);
  state.entityResult = result;
  const classById = new Map(state.data.ontology.classes.map((item) => [item.id, item]));
  const relationById = new Map(state.data.ontology.relations.map((item) => [item.id, item]));
  const nodeById = new Map(state.data.nodes.map((item) => [item.id, item]));
  const questionById = new Map(state.data.questions.map((item) => [item.id, item]));
  const pathById = new Map(state.data.paths.map((item) => [item.id, item]));
  const sourceById = new Map(state.data.sources.map((item) => [item.id, item]));
  const classInfo = classById.get(node.type);
  const warningMarkup = result.warnings.length
    ? '<p class="result-warning"><span class="status-badge pending_human_review">待人工核对</span> 此概念或其关联记录仍待人工核对，请结合来源状态使用。</p>'
    : '';
  const relatedQuestionHref = result.question_ids.length
    ? routeHref('question', { id: result.question_ids[0] })
    : '#explorer';

  elements.entityHeader.innerHTML = `
    <div class="section-kicker">Entity Detail</div>
    <span class="detail-type">${escapeHtml(classInfo?.label || node.type)}</span>
    <h1 id="entity-view-title" tabindex="-1">${escapeHtml(node.label)}</h1>
    <p>${escapeHtml(node.definition || '当前记录未提供额外定义。')}</p>
    <div class="entity-meta"><span>类型：${escapeHtml(classInfo?.label || node.type)}</span><span>主题：${(node.themes || []).map(themeLabel).map(escapeHtml).join(' · ') || '未标记'}</span><span class="status-badge ${escapeHtml(node.review_status)}">${escapeHtml(REVIEW_LABELS[node.review_status] || node.review_status)}</span></div>
    ${warningMarkup}
    <div class="entity-actions"><a class="button primary" href="${relatedQuestionHref}">打开关联子图</a><a class="button secondary" href="#explorer">查看图谱</a><a class="button secondary" href="#developer">查看 Entity JSON</a></div>
  `;
  elements.entityRelations.innerHTML = `
    <div class="section-kicker">Ontology Relations</div><h2 id="entity-relations-title">按本体关系查看连接</h2>
    <div class="relation-directions">
      ${renderRelationDirection('从此概念出发', result.relations.outgoing, 'outgoing', nodeById, relationById)}
      ${renderRelationDirection('指向此概念', result.relations.incoming, 'incoming', nodeById, relationById)}
    </div>
  `;
  const questionLinks = result.question_ids.map((id) => {
    const question = questionById.get(id);
    return question ? `<a href="${routeHref('question', { id })}"><span>问题子图</span>${escapeHtml(question.title)}</a>` : '';
  }).join('');
  const pathLinks = result.path_ids.map((id) => {
    const path = pathById.get(id);
    return path ? `<a href="#explorer"><span>图谱路径</span>${escapeHtml(path.title)}</a>` : '';
  }).join('');
  elements.entityBacklinks.innerHTML = `
    <div class="section-kicker">Backlinks</div><h2 id="entity-backlinks-title">问题与路径回链</h2>
    <div class="backlink-grid">${questionLinks || '<p class="muted-copy">当前没有关联问题。</p>'}${pathLinks || '<p class="muted-copy">当前没有关联路径。</p>'}</div>
  `;
  const evidenceMarkup = result.evidence.map((evidence) => {
    const source = sourceById.get(evidence.source_id);
    return `
      <article class="entity-evidence-card">
        <p>${escapeHtml(evidence.claim_summary || '当前证据记录未提供陈述摘要。')}</p>
        <small>${escapeHtml(evidence.locator || '未提供定位信息')}</small>
        <span class="status-badge ${escapeHtml(evidence.review_status)}">${escapeHtml(REVIEW_LABELS[evidence.review_status] || evidence.review_status)}</span>
        ${sourceLinkMarkup(source, source?.title || '查看官方来源')}
      </article>
    `;
  }).join('');
  const sourceMarkup = result.sources.map((source) => `
    <article class="entity-source-card"><span>${escapeHtml(SOURCE_ROLE_LABELS[source.source_role] || '来源')}</span><h3>${escapeHtml(source.title)}</h3><p>${escapeHtml(source.issuer)} · ${escapeHtml(source.year)}</p>${sourceLinkMarkup(source, '查看官方来源')}</article>
  `).join('');
  elements.entityEvidence.innerHTML = `
    <div class="section-kicker">Evidence & Sources</div><h2 id="entity-evidence-title">证据与来源</h2>
    <div class="entity-evidence-grid">${evidenceMarkup || '<p class="muted-copy">当前仅保留结构定义，尚无关联证据记录。</p>'}</div>
    <div class="entity-source-grid">${sourceMarkup || '<p class="muted-copy">当前没有可展示的来源记录。</p>'}</div>
  `;
}


function stablePlainSerialization(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    }
    return item;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}


function developerResult(questionId = null) {
  if (questionId) {
    const question = state.data.questions.find((item) => item.id === questionId);
    if (!question) return { kind: 'missing-question', questionId };
    try {
      return { kind: 'question', label: question.title, question, result: executeQuestion(question, state.data) };
    } catch (error) {
      return { kind: 'failed-question', question, error };
    }
  }
  if (state.queryResult) return { kind: 'question', label: '问题查询结果', result: state.queryResult };
  if (state.entityResult) return { kind: 'entity', label: '实体查询结果', result: state.entityResult };
  if (state.workbenchResult) return { kind: 'workbench', label: '共管工作台结果', result: state.workbenchResult };
  const question = state.data.questions[0];
  return { kind: 'question', label: `默认问题：${question.title}`, result: executeQuestion(question, state.data) };
}


function renderDeveloper(questionId = null) {
  const current = developerResult(questionId);
  const heading = elements.developerQuery.querySelector('.developer-card-heading > div');
  heading.querySelector('.developer-question-context')?.remove();
  if (current.kind === 'missing-question' || current.kind === 'failed-question') {
    const failed = current.kind === 'failed-question';
    elements.developerQuery.querySelector('.query-json').textContent = failed
      ? '当前问题查询失败，无法生成本次查询 JSON。'
      : '未找到该问题，无法生成本次查询 JSON。';
    elements.developerQuery.querySelector('#developer-query-title').textContent = failed ? '无法生成问题结果' : '无法加载问题结果';
    elements.downloadQueryJson.hidden = true;
    elements.downloadQueryJson.disabled = true;
    elements.downloadQueryJson.onclick = null;
    const recoveryHref = failed ? routeHref('question', { id: current.question.id }) : '#questions';
    const recoveryLabel = failed ? '返回该问题' : '回到问题中心';
    const recoveryMessage = failed ? '当前问题查询未能完成。' : '该问题标识不在当前数据集中。';
    heading.insertAdjacentHTML('beforeend', `<p class="developer-question-context">${recoveryMessage}<a class="text-link" href="${recoveryHref}">${recoveryLabel}</a></p>`);
    return;
  }
  const json = current.kind === 'question'
    ? serializeQueryResult(current.result)
    : stablePlainSerialization(current.result);
  elements.developerQuery.querySelector('.query-json').textContent = json;
  elements.developerQuery.querySelector('#developer-query-title').textContent = current.label;
  if (current.question) {
    heading.insertAdjacentHTML('beforeend', `<p class="developer-question-context">本次问题：${escapeHtml(current.question.title)} · <a class="text-link" href="${routeHref('question', { id: current.question.id })}">返回该问题</a></p>`);
  }
  elements.downloadQueryJson.hidden = false;
  elements.downloadQueryJson.disabled = false;
  elements.downloadQueryJson.textContent = current.kind === 'question' ? '下载 Query JSON' : '下载 JSON';
  elements.downloadQueryJson.onclick = () => {
    const downloadJson = current.kind === 'question'
      ? serializeQueryResult(current.result)
      : stablePlainSerialization(current.result);
    const blob = new Blob([downloadJson], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'heng-graph-query.json';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  elements.developerDataFiles.querySelector('.developer-file-list').innerHTML = CANONICAL_DATA_FILES
    .map((path) => `<li>${escapeHtml(path)}</li>`).join('');
  elements.developerValidation.querySelector('.developer-commands').textContent = VALIDATION_COMMANDS.join('\n');
}


function primaryTheme(item) {
  return item.themes?.find((theme) => theme !== 'shared') || 'shared';
}


function shortLabel(label, limit = 10) {
  return label.length > limit ? `${label.slice(0, limit - 1)}…` : label;
}


function setStats() {
  const values = {
    nodes: state.data.nodes.length,
    edges: state.data.edges.length,
    classes: state.data.ontology.classes.length,
    sources: state.data.sources.length,
  };
  document.querySelectorAll('[data-stat]').forEach((element) => {
    element.textContent = values[element.dataset.stat].toLocaleString('zh-CN');
  });
}


function renderThemeTabs() {
  elements.themeTabs.innerHTML = THEME_META.map((theme) => `
    <button type="button" data-theme="${theme.id}" class="${state.activeTheme === theme.id ? 'active' : ''}" aria-pressed="${state.activeTheme === theme.id}">
      ${theme.label}
    </button>
  `).join('');
  elements.themeTabs.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => selectTheme(button.dataset.theme));
  });
}


function renderPaths() {
  elements.pathList.innerHTML = state.data.paths.map((path, index) => `
    <button class="path-card ${state.activePath === path.id ? 'active' : ''}" type="button" data-path="${path.id}" aria-pressed="${state.activePath === path.id}">
      <b>${String(index + 1).padStart(2, '0')} · ${escapeHtml(path.title)}</b>
      <span>${escapeHtml(path.summary)}</span>
    </button>
  `).join('');
  elements.pathList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => selectPath(button.dataset.path));
  });
}


function selectTheme(theme) {
  state.activeTheme = theme;
  state.activePath = null;
  state.selectedId = null;
  state.graph = filterGraph({ nodes: state.data.nodes, edges: state.data.edges }, theme);
  resetTransform();
  renderThemeTabs();
  renderPaths();
  renderGraph();
  renderEmptyDetail();
}


function selectPath(pathId) {
  const path = state.data.paths.find((item) => item.id === pathId);
  if (!path) return;
  state.activeTheme = null;
  state.activePath = pathId;
  state.selectedId = null;
  state.graph = focusPath({ nodes: state.data.nodes, edges: state.data.edges }, path);
  resetTransform();
  renderThemeTabs();
  renderPaths();
  renderGraph();
  renderEmptyDetail(path.title, path.summary);
}


function resetTransform() {
  state.transform = { x: 0, y: 0, scale: 1 };
}


function applyTransform(canvas = elements.canvas) {
  const scene = canvas.querySelector('#graph-scene');
  if (!scene) return;
  const { x, y, scale } = state.transform;
  scene.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
}


function renderGraph(graph = state.graph, canvas = elements.canvas, graphCount = elements.graphCount, onNodeActivate = null) {
  const { nodes, edges } = graph;
  const markerId = `${canvas.id}-arrow`;
  graphCount.textContent = `${nodes.length} 节点 · ${edges.length} 关系`;
  if (!nodes.length) {
    canvas.innerHTML = `
      <text x="580" y="330" text-anchor="middle" fill="#617374">当前筛选没有可展示的数据</text>
      <text x="580" y="360" text-anchor="middle" fill="#617374" font-size="12">请选择其他主题或恢复默认路径</text>
    `;
    return;
  }
  const positions = computeLayout(nodes, edges, 1160, 680);
  const classById = new Map(state.data.ontology.classes.map((item) => [item.id, item]));
  const relationById = new Map(state.data.ontology.relations.map((item) => [item.id, item]));
  const nodeMarkup = nodes.map((node) => {
    const position = positions[node.id];
    const color = THEME_COLORS[primaryTheme(node)] || classById.get(node.type)?.color || '#68847e';
    const typeLabel = classById.get(node.type)?.label || node.type;
    return `
      <g class="graph-node ${state.selectedId === node.id ? 'selected' : ''}" data-node="${node.id}"
         transform="translate(${position.x} ${position.y})" tabindex="0" role="button" aria-label="${escapeHtml(node.label)}">
        <rect x="-63" y="-25" width="126" height="50" rx="13" stroke="${color}"></rect>
        <text text-anchor="middle" y="-3">${escapeHtml(shortLabel(node.label))}</text>
        <text class="type-label" text-anchor="middle" y="13">${escapeHtml(typeLabel)}</text>
      </g>
    `;
  }).join('');
  const edgeMarkup = edges.map((edge) => {
    const source = positions[edge.source];
    const target = positions[edge.target];
    if (!source || !target) return '';
    const relation = relationById.get(edge.relation);
    const path = `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
    return `
      <g data-edge="${edge.id}" aria-label="${escapeHtml(relation?.label || edge.relation)}">
        <path class="graph-edge" d="${path}" marker-end="url(#${markerId})"><title>${escapeHtml(relation?.label || edge.relation)}</title></path>
        <path class="graph-edge-hit" d="${path}"></path>
      </g>
    `;
  }).join('');
  canvas.innerHTML = `
    <defs>
      <marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(69,91,88,.45)"></path>
      </marker>
    </defs>
    <g id="graph-scene">${edgeMarkup}${nodeMarkup}</g>
  `;
  applyTransform(canvas);
  canvas.querySelectorAll('[data-node]').forEach((element) => {
    const activate = () => {
      const node = state.data.nodes.find((item) => item.id === element.dataset.node);
      if (onNodeActivate) onNodeActivate(node);
      else showDetails(node);
    };
    element.addEventListener('click', activate);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
  if (!onNodeActivate) {
    canvas.querySelectorAll('[data-edge]').forEach((element) => {
      element.addEventListener('click', () => showDetails(state.data.edges.find((edge) => edge.id === element.dataset.edge)));
    });
  }
}


function renderEmptyDetail(title = '选择一个节点', description = '查看定义、关联概念、证据状态和官方来源。') {
  elements.detail.innerHTML = `
    <div class="detail-empty">
      <span class="detail-symbol">◎</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}


function showDetails(selection) {
  if (!selection) return;
  state.selectedId = selection.id;
  const evidenceById = new Map(state.data.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(state.data.sources.map((item) => [item.id, item]));
  const details = buildDetails(
    selection,
    { nodes: state.data.nodes, edges: state.data.edges },
    evidenceById,
    sourcesById,
  );
  const classLabel = state.data.ontology.classes.find((item) => item.id === details.type)?.label;
  const relation = state.data.ontology.relations.find((item) => item.id === details.relation);
  const sourceById = new Map(details.sources.map((source) => [source.id, source]));
  const evidenceMarkup = details.evidence.map((item) => {
    const source = sourceById.get(item.source_id);
    return `
      <div class="evidence-card">
        <p>${escapeHtml(item.claim_summary)}</p>
        <small>${escapeHtml(item.locator)}</small>
        ${sourceLinkMarkup(source, source?.title || '查看官方来源')}
      </div>
    `;
  }).join('');
  elements.detail.innerHTML = `
    <span class="detail-type">${escapeHtml(classLabel || relation?.label || details.type)}</span>
    <h3>${escapeHtml(relation?.label || details.label)}</h3>
    <p class="detail-description">${escapeHtml(details.definition || relation?.definition || '该关系由本体定义，并保留来源状态。')}</p>
    <span class="status-badge ${details.review_status}">${REVIEW_LABELS[details.review_status] || details.review_status}</span>
    <div class="detail-block">
      <h4>关联概念 · ${details.neighbors.length}</h4>
      <div class="detail-list">${details.neighbors.map((item) => `<span>${escapeHtml(item.label)}</span>`).join('') || '<span>暂无</span>'}</div>
    </div>
    <div class="detail-block">
      <h4>证据记录 · ${details.evidence.length}</h4>
      ${evidenceMarkup || '<p class="detail-description">当前仅保留结构定义。</p>'}
    </div>
  `;
  state.selectedId = selection.id;
  elements.canvas.querySelectorAll('.graph-node').forEach((node) => {
    node.classList.toggle('selected', node.dataset.node === selection.id);
  });
}


function renderOntology() {
  const classById = new Map(state.data.ontology.classes.map((item) => [item.id, item]));
  const nodeById = new Map(state.data.nodes.map((item) => [item.id, item]));
  elements.ontologyClasses.innerHTML = state.data.ontology.classes.map((item) => `
    <article class="ontology-card">
      <div class="class-color" style="background:${escapeHtml(item.color)}"></div>
      <h3>${escapeHtml(item.label)}</h3>
      <code>${escapeHtml(item.id)}</code>
      <p>${escapeHtml(item.definition)}</p>
    </article>
  `).join('');
  elements.ontologyRelations.innerHTML = state.data.ontology.relations.map((relation) => {
    const example = state.data.edges.find((edge) => edge.relation === relation.id);
    const sourceTypes = relation.source_types.map((type) => classById.get(type)?.label || type).join('、');
    const targetTypes = relation.target_types.map((type) => classById.get(type)?.label || type).join('、');
    const source = example ? nodeById.get(example.source) : null;
    const target = example ? nodeById.get(example.target) : null;
    const exampleMarkup = source && target
      ? `<p class="ontology-example-edge">实例：${escapeHtml(source.label)} → ${escapeHtml(target.label)} <code>${escapeHtml(example.id)}</code></p>`
      : '<p class="ontology-example-edge">当前图谱没有可展示的实例边。</p>';
    return `
      <article class="ontology-relation-card">
        <code>${escapeHtml(relation.id)}</code>
        <h3>${escapeHtml(relation.label)}：源 → 目标</h3>
        <p>${escapeHtml(relation.definition)}</p>
        <p>允许端点：${escapeHtml(sourceTypes)} → ${escapeHtml(targetTypes)}</p>
        ${exampleMarkup}
      </article>
    `;
  }).join('');
  const question = state.data.questions.find((item) => item.id === state.queryResult?.query_id)
    || state.data.questions[0];
  const resultTypes = question.target_node_types.map((type) => classById.get(type)?.label || type).join('、');
  elements.ontologyQueryExample.innerHTML = `
    <div class="section-kicker">Query Contract Example</div>
    <h3>从自然语言到受约束结果</h3>
    <p>${escapeHtml(question.title)}</p>
    <div class="ontology-query-flow">
      <span>自然语言问题</span><span>intent：${escapeHtml(question.intent)}</span><span>种子节点：${escapeHtml(question.seed_node_ids.join('、'))}</span><span>允许关系：${escapeHtml(question.allowed_relation_types.join('、'))}</span><span>最大深度：${escapeHtml(question.max_depth)}</span><span>目标类型：${escapeHtml(question.target_node_types.join('、'))}</span><span>结果类型：${escapeHtml(resultTypes)}</span>
    </div>
  `;
}


function evidenceContext(evidence) {
  const source = state.data.sources.find((item) => item.id === evidence.source_id);
  const entityIds = new Set();
  for (const node of state.data.nodes) {
    if ((node.evidence_refs || []).includes(evidence.id)) entityIds.add(node.id);
  }
  for (const edge of state.data.edges) {
    if ((edge.evidence_refs || []).includes(evidence.id)) {
      entityIds.add(edge.source);
      entityIds.add(edge.target);
    }
  }
  const themes = new Set();
  for (const entityId of entityIds) {
    const node = state.data.nodes.find((item) => item.id === entityId);
    for (const theme of node?.themes || []) themes.add(theme);
  }
  const questionIds = state.data.questions
    .filter((question) => executeQuestion(question, state.data).evidence_ids.includes(evidence.id))
    .map((question) => question.id)
    .sort();
  return { evidence, source, entity_ids: [...entityIds].sort(), themes: [...themes].sort(), question_ids: questionIds };
}


function evidenceFilterOptions(records) {
  const values = (key) => key === 'theme'
    ? [...new Set(records.flatMap((record) => record.themes))].sort()
    : [...new Set(records.map((record) => record[key]).filter(Boolean))].sort();
  const select = (key, label, options, formatter = (value) => value) => `
    <label>${label}<select data-evidence-filter="${key}"><option value="all">全部</option>${options.map((value) => `<option value="${escapeHtml(value)}" ${state.evidenceFilters[key] === value ? 'selected' : ''}>${escapeHtml(formatter(value))}</option>`).join('')}</select></label>`;
  return [
    select('theme', '主题', values('theme'), themeLabel),
    select('source_role', '来源角色', values('source_role'), (value) => SOURCE_ROLE_LABELS[value] || value),
    select('issuer', '发布机构', values('issuer')),
    select('review_status', '核对状态', values('review_status'), (value) => REVIEW_LABELS[value] || value),
  ].join('');
}


function renderEvidence() {
  const contexts = state.data.evidence.map(evidenceContext).map((context) => ({
    ...context,
    theme: context.themes[0] || 'shared',
    source_role: context.source?.source_role,
    issuer: context.source?.issuer,
    review_status: context.evidence.review_status,
  }));
  elements.evidenceFilters.innerHTML = `${evidenceFilterOptions(contexts)}<button type="button" data-reset-evidence>重置</button>`;
  elements.evidenceFilters.querySelectorAll('[data-evidence-filter]').forEach((select) => {
    select.addEventListener('change', () => {
      state.evidenceFilters[select.dataset.evidenceFilter] = select.value;
      renderEvidence();
    });
  });
  elements.evidenceFilters.querySelector('[data-reset-evidence]').addEventListener('click', () => {
    state.evidenceFilters = { theme: 'all', source_role: 'all', issuer: 'all', review_status: 'all' };
    renderEvidence();
  });
  const visible = contexts.filter((context) => Object.entries(state.evidenceFilters).every(([key, value]) => (
    value === 'all' || (key === 'theme' ? context.themes.includes(value) : context[key] === value)
  )));
  if (!visible.length) {
    const conditions = Object.entries(state.evidenceFilters)
      .filter(([, value]) => value !== 'all')
      .map(([key, value]) => `${key}=${value}`).join('，') || '全部条件';
    renderEmpty(
      elements.evidenceResults,
      '没有符合条件的证据记录',
      `当前筛选：${conditions}。重置筛选后可查看全部记录。`,
      '#evidence',
    );
    elements.evidenceResults.querySelector('[data-recover-empty]').addEventListener('click', (event) => {
      event.preventDefault();
      state.evidenceFilters = { theme: 'all', source_role: 'all', issuer: 'all', review_status: 'all' };
      renderEvidence();
    });
    return;
  }
  const nodeById = new Map(state.data.nodes.map((node) => [node.id, node]));
  const questionById = new Map(state.data.questions.map((question) => [question.id, question]));
  elements.evidenceResults.innerHTML = visible.map((context) => {
    const { evidence, source } = context;
    const entityLinks = context.entity_ids.map((id) => {
      const node = nodeById.get(id);
      return node ? `<a href="${routeHref('entity', { id })}">实体：${escapeHtml(node.label)}</a>` : '';
    }).join('');
    const questionLinks = context.question_ids.map((id) => {
      const question = questionById.get(id);
      return question ? `<a href="${routeHref('question', { id })}">问题：${escapeHtml(question.title)}</a>` : '';
    }).join('');
    return `
      <article class="evidence-result-card">
        <h3>${escapeHtml(evidence.claim_summary)}</h3>
        <div class="evidence-result-meta"><span>${escapeHtml(source?.issuer || '未关联来源')} · ${escapeHtml(source?.year || '—')}</span><span>${escapeHtml(SOURCE_ROLE_LABELS[source?.source_role] || source?.source_role || '来源')}</span><span>证据状态：<b class="status-badge ${escapeHtml(evidence.review_status)}">${escapeHtml(REVIEW_LABELS[evidence.review_status] || evidence.review_status)}</b></span><span>来源状态：<b class="status-badge ${escapeHtml(source?.review_status || 'structure_only')}">${escapeHtml(source ? (REVIEW_LABELS[source.review_status] || source.review_status) : '未关联来源')}</b></span></div>
        <p>适用范围：${escapeHtml(evidence.applicability || '未提供')}</p>
        <p>定位信息：${escapeHtml(evidence.locator || '未提供')}</p>
        ${sourceLinkMarkup(source, `查看官方来源：${source?.title || ''}`)}
        <div class="evidence-backlinks">${entityLinks}${questionLinks || '<span>当前没有命中问题</span>'}</div>
      </article>
    `;
  }).join('');
}


function renderStatus() {
  const records = [...state.data.nodes, ...state.data.edges, ...state.data.evidence];
  const counts = Object.fromEntries(Object.keys(REVIEW_LABELS).map((status) => [status, records.filter((item) => item.review_status === status).length]));
  const verifiedRatio = records.length ? Math.round((counts.verified / records.length) * 100) : 0;
  elements.status.innerHTML = `
    <h3>数据成熟度</h3>
    <p>结构验证与医学复核分开计算</p>
    <div class="status-meter">
      <header><span>人工核对完成度</span><b>${verifiedRatio}%</b></header>
      <div class="meter-track"><div class="meter-fill" style="width:${verifiedRatio}%"></div></div>
    </div>
    <ul class="status-list">
      <li><span>结构验证</span><b>已通过</b></li>
      <li><span>待人工核对</span><b>${counts.pending_human_review}</b></li>
      <li><span>仅结构记录</span><b>${counts.structure_only}</b></li>
      <li><span>来源目录</span><b>${state.data.sources.length}</b></li>
    </ul>
    <div class="status-callout">MVP 可以展示本体和工程结构，但不能被解读为已经完成医学专家审核。</div>
  `;
}


function setupPanZoom() {
  let dragging = false;
  let origin = null;
  elements.canvas.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-node]')) return;
    dragging = true;
    origin = { x: event.clientX - state.transform.x, y: event.clientY - state.transform.y };
    elements.canvas.classList.add('dragging');
    elements.canvas.setPointerCapture(event.pointerId);
  });
  elements.canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    state.transform.x = event.clientX - origin.x;
    state.transform.y = event.clientY - origin.y;
    applyTransform();
  });
  elements.canvas.addEventListener('pointerup', () => {
    dragging = false;
    elements.canvas.classList.remove('dragging');
  });
  elements.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const next = Math.min(2.2, Math.max(.45, state.transform.scale * (event.deltaY > 0 ? .9 : 1.1)));
    state.transform.scale = next;
    applyTransform();
  }, { passive: false });
}


async function initialize() {
  renderLoading(elements.appStatus, '图谱数据');
  renderLoading(elements.detail, '图谱数据');
  try {
    state.data = await loadProjectData(window.fetch.bind(window), '..');
    elements.appStatus.hidden = true;
    elements.error.hidden = true;
    setStats();
    renderHome();
    renderQuestionCenter();
    renderOntology();
    renderEvidence();
    renderStatus();
    renderThemeTabs();
    renderPaths();
    setupPanZoom();
    elements.reset.addEventListener('click', () => selectPath(state.data.paths[0].id));
    selectPath(state.data.paths[0].id);
    renderRoute(state.route || parseRoute(window.location.hash));
  } catch (error) {
    const failedFile = String(error?.message || '').match(/^Failed to load (.+?)(?:: .+)$/)?.[1] || null;
    renderFailure(elements.appStatus, error, failedFile);
    elements.graphCount.textContent = '加载失败';
  }
}


window.addEventListener('hashchange', syncRoute);
syncRoute();
initialize();
