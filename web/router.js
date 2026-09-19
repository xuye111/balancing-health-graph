const ROUTE_NAMES = new Set([
  'home',
  'questions',
  'workbench',
  'explorer',
  'evidence',
  'ontology',
  'developer',
]);
const WORKBENCH_THEMES = new Set(['obesity', 'hypertension', 'diabetes']);


function notFoundRoute() {
  return { name: 'not-found', id: null, themes: [] };
}


function normalizeThemes(themes) {
  const values = (Array.isArray(themes) ? themes : [themes])
    .flatMap((theme) => String(theme || '').split(','));
  return [...new Set(values.filter((theme) => WORKBENCH_THEMES.has(theme)))];
}


function routeWithId(name, id) {
  if (!id) return notFoundRoute();
  try {
    const decodedId = decodeURIComponent(id);
    return decodedId && !decodedId.includes('/') ? { name, id: decodedId, themes: [] } : notFoundRoute();
  } catch {
    return notFoundRoute();
  }
}


export function parseRoute(hash = '') {
  const value = String(hash).replace(/^#/, '');
  if (!value) return { name: 'home', id: null, themes: [] };

  const [path, query = ''] = value.split('?');
  const parts = path.split('/');
  if (parts.length === 1 && ROUTE_NAMES.has(parts[0])) {
    if (parts[0] !== 'workbench' && query) return notFoundRoute();
    const themes = parts[0] === 'workbench'
      ? normalizeThemes(new URLSearchParams(query).getAll('themes'))
      : [];
    return { name: parts[0], id: null, themes };
  }
  if (parts.length === 2 && !query && (parts[0] === 'question' || parts[0] === 'entity' || parts[0] === 'developer')) {
    return routeWithId(parts[0], parts[1]);
  }
  return notFoundRoute();
}


export function routeHref(name, options = {}) {
  if (name === 'question' || name === 'entity') {
    return options.id ? `#${name}/${encodeURIComponent(options.id)}` : '#not-found';
  }
  if (name === 'developer' && options.id) return `#developer/${encodeURIComponent(options.id)}`;
  if (name === 'workbench') {
    const themes = normalizeThemes(options.themes);
    return themes.length ? `#workbench?themes=${themes.join(',')}` : '#workbench';
  }
  return ROUTE_NAMES.has(name) ? `#${name}` : '#not-found';
}
