const sources = {
  netex: { label: 'NeTEx', url: 'https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic.ttl' },
  netexBaseline: { label: 'Nordic Profile baseline', url: 'https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic-baseline.ttl' },
  siri: { label: 'SIRI', url: 'https://raw.githubusercontent.com/entur/nordic-siri-ontology/main/siri-nordic.ttl' },
  siriBaseline: { label: 'SIRI baseline', url: 'https://raw.githubusercontent.com/entur/nordic-siri-ontology/main/siri-nordic-baseline.ttl' },
  netexDocumentation: { label: 'NeTEx documentation', url: 'https://raw.githubusercontent.com/entur/nordic-netex-documentation/main/ontology/netex-nordic-documentation.ttl' }
};
const pendingNetex = new Set(['DatedServiceJourney']);

const state = { netex: { objects: [], rules: [], pending: [] }, netexBaseline: { objects: [], rules: [], pending: [] }, siri: { objects: [], rules: [], pending: [] }, filter: 'netex', query: '' };
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const localName = (value) => value.split(/[#:]/).pop().replace(/[<>]/g, '');
const profileStatusValue = (block) => {
  const candidates = ['profile:status', 'nordic:status', 'siri:status'];
  for (const candidate of candidates) {
    const value = quoted(block, candidate);
    if (value) return value;
  }
  return '';
};
const quoted = (block, predicate) => {
  const match = block.match(new RegExp(`${predicate}\\s+"([\\s\\S]*?)"`));
  return match ? match[1].replace(/\\n/g, ' ').trim() : '';
};
const definition = (block, fallback) => quoted(block, 'skos:definition') || quoted(block, 'rdfs:comment') || fallback;
const profileStatus = (block) => profileStatusValue(block) || 'in-scope';
const normalizeSiriStatus = (status) => {
  const value = String(status || '').trim().toLowerCase();
  return ['in-scope', 'extended', 'conditional', 'not-in-scope'].includes(value) ? value : 'in-scope';
};
const profileMetadata = (text) => {
  const match = text.match(/profile:NP\s+a\s+nordic:Profile\s*;([\s\S]*?)(?=\n##|$)/);
  const block = match ? match[1] : '';
  const confidence = block.match(/nordic:level\s+"([^"]+)"/);
  const validated = block.match(/nordic:lastValidated\s+"([^"]+)"/);
  const datasets = block.match(/nordic:datasets\s+"([^"]+)"/);
  const definitionText = quoted(block, 'skos:definition');
  return { confidence: confidence ? confidence[1] : 'Not specified', validated: validated ? validated[1] : 'Not specified', datasets: datasets ? datasets[1] : 'Not specified', definition: definitionText || 'Shared Nordic NeTEx profile.' };
};
const siriMetadata = (text) => {
  const match = text.match(/(?:profile:NordicSIRI|nordic:NordicSIRI)\s+a\s+(?:siri|nordic):Profile\s*;([\s\S]*?)(?=\n##|$)/);
  const block = match ? match[1] : '';
  return {
    definition: quoted(block, 'skos:definition') || 'Nordic localisation of SIRI.',
    version: quoted(block, 'siri:version') || quoted(block, 'nordic:version') || 'Not specified',
    basedOn: quoted(block, 'siri:basedOn') || quoted(block, 'nordic:basedOn') || 'Not specified',
    comment: quoted(block, 'rdfs:comment') || ''
  };
};
const extractNordicBaseline = (text, documentation) => {
  const objects = [];
  const documentationData = documentationLinks(documentation);
  const declaration = /netex:([A-Za-z][\w-]*)\s+nordic:inProfile\s+profile:([A-Za-z][\w-]*)\s*;([\s\S]*?)(?=\nnetex:[A-Za-z][\w-]*\s+nordic:inProfile|\n##|$)/g;
  let match;
  while ((match = declaration.exec(text))) {
    const name = match[1];
    const scope = match[2];
    objects.push({ name, subject: `netex:${name}`, scope, status: scope === 'NordicProfile' ? 'in-scope' : scope, documentation: documentationData.links.get(name), source: 'netex-nordic-baseline.ttl' });
  }
  // Most of the baseline's actual content lives here: fields nested under a
  // class's nordic:ProfileMember blocks, not the class declaration itself.
  const fieldsByClass = new Map();
  const fieldPattern = /nordic:onClass\s+netex:([A-Za-z][\w-]*)\s*;\s*nordic:element\s+"([^"]*)"\s*;\s*nordic:path\s+"([^"]*)"\s*;\s*nordic:cardinality\s+"([^"]*)"/g;
  let fieldMatch;
  while ((fieldMatch = fieldPattern.exec(text))) {
    const [, className, element, path, cardinality] = fieldMatch;
    if (!fieldsByClass.has(className)) fieldsByClass.set(className, []);
    fieldsByClass.get(className).push({ element, path, cardinality: cardinality || 'unspecified' });
  }
  objects.forEach((object) => { object.fields = fieldsByClass.get(object.name) || []; });
  const active = objects.filter((object) => object.scope === 'NordicProfile');
  const pending = objects.filter((object) => object.scope === 'NordicCandidate').map((object) => ({ ...object, status: object.scope }));
  return { objects: active, rules: [], pending };
};
const documentationLinks = (text) => {
  const links = new Map();
  const scopes = new Map();
  const pattern = /netex:([A-Za-z][\w-]*)\s+([\s\S]*?)(?=\nnetex:[A-Za-z][\w-]*\s|\n##|$)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const block = match[2];
    const paths = {};
    for (const key of ['description', 'table', 'example']) {
      const value = quoted(block, `doc:${key}`);
      if (value) paths[key] = `https://github.com/entur/nordic-netex-documentation/blob/main/${value}`;
    }
    if (Object.keys(paths).length) links.set(match[1], paths);
  }
  const scopePattern = /netex:([A-Za-z][\w-]*)\s+profile:scope\s+profile:([A-Za-z][\w-]*)/g;
  while ((match = scopePattern.exec(text))) scopes.set(match[1], match[2]);
  return { links, scopes };
};

const extractNetex = (text, documentation) => {
  const objects = [];
  const rules = [];
  const documentationData = documentationLinks(documentation);
  const docs = documentationData.links;
  const scopes = documentationData.scopes;
  const shapePattern = /profile:NP_([A-Za-z][\w-]*)Shape\s+a\s+sh:NodeShape\s*;([\s\S]*?)(?=\nprofile:NP_[A-Za-z][\w-]*Shape\s+a\s+sh:NodeShape|\n##|$)/g;
  let shape;
  while ((shape = shapePattern.exec(text))) {
    const block = shape[2];
    const target = block.match(/sh:targetClass\s+([^;\s]+)/);
    if (!target) continue;
    const name = localName(target[1]);
    const pathMatches = [...block.matchAll(/sh:path\s+([^;\s]+)/g)];
    const paths = pathMatches.map((match) => localName(match[1]));
    if (pendingNetex.has(name)) continue;
    objects.push({ name, subject: target[1], scope: 'NordicProfile', documentation: docs.get(name), source: 'netex-nordic.ttl' });
    pathMatches.forEach((pathMatch, index) => {
      const path = localName(pathMatch[1]);
      const nextPath = pathMatches[index + 1];
      const propertyBlock = block.slice(pathMatch.index, nextPath ? nextPath.index : block.length);
      const min = propertyBlock.match(/sh:minCount\s+(\d+)/);
      const max = propertyBlock.match(/sh:maxCount\s+(\d+)/);
      const description = quoted(propertyBlock, 'sh:description') || (max && max[1] === '0' ? 'Excluded from the Nordic Profile.' : 'Allowed in the Nordic Profile.');
      rules.push({ name, path, cardinality: min || max ? `${min ? min[1] : '0'}..${max ? max[1] : 'many'}` : 'constrained', description, source: `netex-nordic.ttl · rule ${index + 1}` });
    });
  }
  return { objects, rules, pending: [...pendingNetex].map((name) => ({ name, subject: `netex:${name}`, status: 'under consideration', description: 'Present in the source model, but not part of the current Nordic Profile.' })) };
};

const extractSiri = (text, baseline = '') => {
  const objects = [];
  const rules = [];
  const pending = [];
  const serviceStatuses = new Map();

  const declarationPattern = /(?:nordic|siri):([A-Za-z_][\w-]*)\s+a\s+(?:(?:nordic|siri):(?:Service|DataSource)|owl:Class)\s*;/g;
  const declarations = [...text.matchAll(declarationPattern)].map((match) => ({
    start: match.index,
    end: match[0].length,
    name: match[1],
    // DataSource entries are governance roles (who produces/aggregates data),
    // not SIRI XML classes, so they never have fields or SHACL rules — keep
    // them out of the 'class' bucket and label them honestly, not as 'Object'.
    type: /(?:nordic|siri):Service\b/.test(match[0]) ? 'service' : (/(?:nordic|siri):DataSource\b/.test(match[0]) ? 'datasource' : 'class')
  }));

  declarations.forEach((declaration, index) => {
    const nextStart = declarations[index + 1]?.start ?? text.length;
    const block = text.slice(declaration.start, nextStart);
    const q = profileStatusValue(block);
    if (declaration.type === 'service') {
      const status = normalizeSiriStatus(q || 'in-scope');
      serviceStatuses.set(declaration.name, status);
      const service = { name: quoted(block, 'rdfs:label') || declaration.name, subject: `siri:${declaration.name}`, status, kind: 'service', description: definition(block, 'SIRI service in the Nordic Profile.'), documentation: quoted(block, 'doc:description') || quoted(block, 'doc:table'), source: 'siri-nordic.ttl' };
      (status === 'in-scope' ? objects : pending).push(service);
      return;
    }
    if (declaration.type === 'datasource') return; // governance role, not a profile object worth surfacing here

    if (/^(Profile|Service|DataSource|Enumeration|CommunicationPattern|XMLNamespace)$/.test(declaration.name)) return;
    const serviceRefs = [...block.matchAll(/(?:nordic|siri):(?:inService|usedIn)\s+(?:nordic|siri):([A-Za-z_][\w-]*)/g)].map((match) => match[1]);
    const serviceValues = serviceRefs.map((service) => serviceStatuses.get(service)).filter(Boolean);
    const explicitStatus = q || 'in-scope';
    const derivedStatus = serviceValues.some((value) => value !== 'in-scope') ? serviceValues.find((value) => value !== 'in-scope') : (serviceValues.length ? 'in-scope' : explicitStatus);
    const status = normalizeSiriStatus(derivedStatus || explicitStatus || 'in-scope');
    const object = { name: quoted(block, 'rdfs:label') || declaration.name, subject: `siri:${declaration.name}`, status, kind: 'class', description: definition(block, 'SIRI object in the Nordic Profile.'), documentation: quoted(block, 'doc:description') || quoted(block, 'doc:table'), source: 'siri-nordic.ttl' };
    (status === 'in-scope' ? objects : pending).push(object);
  });

  const baselinePattern = /siri:([A-Za-z][\w-]*)\s+nordic:inProfile\s+profile:NordicSIRI\s*;([\s\S]*?)(?=\nsiri:[A-Za-z][\w-]*\s+nordic:inProfile|\n##|$)/g;
  let baselineMatch;
  while ((baselineMatch = baselinePattern.exec(baseline))) {
    const name = baselineMatch[1];
    if (objects.some((entry) => entry.subject === `siri:${name}`)) continue;
    const block = baselineMatch[0];
    const service = [...block.matchAll(/nordic:inService\s+nordic:([A-Za-z_][\w-]*)/g)].map((match) => match[1]);
    objects.push({
      name,
      subject: `siri:${name}`,
      status: 'in-scope',
      kind: 'class',
      description: `${name} in the Nordic SIRI Profile.`,
      service: service.join(', '),
      source: 'siri-nordic-baseline.ttl'
    });
  }

  const shapePattern = /profile:NSP_([A-Za-z][\w-]*)Shape\s+a\s+sh:NodeShape\s*;([\s\S]*?)(?=\nprofile:NSP_[A-Za-z][\w-]*Shape\s+a\s+sh:NodeShape|\n##|$)/g;
  let match;
  while ((match = shapePattern.exec(text))) {
    const block = match[2];
    const paths = [...block.matchAll(/sh:path\s+([^;\s]+)/g)].map((path) => localName(path[1]));
    paths.forEach((path) => rules.push({ name: localName(match[1]), path, cardinality: 'profile rule', description: quoted(block, 'sh:description') || 'Constrained by the Nordic SIRI Profile.', source: 'siri-nordic.ttl' }));
  }

  return { objects: objects.filter((entry) => entry.status === 'in-scope'), rules, pending: pending.filter((entry) => ['extended', 'conditional', 'not-in-scope'].includes(entry.status)) };
};

const render = () => {
  const format = state.filter;
  const data = state[format];
  const query = state.query;
  const matches = (entry) => `${entry.name} ${entry.subject || ''} ${entry.path || ''} ${entry.description}`.toLowerCase().includes(query);
  const objects = data.objects.filter(matches);
  const rules = data.rules.filter(matches);
  const pending = data.pending.filter(matches);
  const displayedObjects = objects;
  document.querySelector('#terms-title').textContent = `${sources[format].label} profile`;
  document.querySelector('#profile-status').textContent = `${displayedObjects.length}${objects.length > displayedObjects.length ? ` of ${objects.length}` : ''} objects · ${rules.length} profile rules shown`;
  document.querySelector('#term-count').textContent = objects.length;
  document.querySelector('#term-count').nextElementSibling.textContent = 'profile objects';
  document.querySelector('#shape-count').textContent = rules.length;
  document.querySelector('#profile-context').hidden = format !== 'netex' && format !== 'siri';
  document.querySelector('#context-title').textContent = format === 'siri' ? 'Nordic SIRI Profile' : format === 'netexBaseline' ? 'NeTEx baseline' : 'Nordic NeTEx Profile';
  if (format === 'siri' && data.metadata) {
    document.querySelector('#context-definition').textContent = data.metadata.definition;
    document.querySelector('#context-scope').textContent = 'Nordic SIRI';
    document.querySelector('#context-confidence').textContent = `v${data.metadata.version}`;
    document.querySelector('#context-validated').textContent = data.metadata.basedOn;
    document.querySelector('#context-datasets').textContent = data.metadata.comment || 'Shared real-time profile';
    document.querySelector('#context-layers').innerHTML = ['Services and objects', 'SHACL constraints', 'NeTEx bridges', 'Transmodel alignment', 'Request / response'].map((layer) => `<span>${layer}</span>`).join('');
  }
  const pendingPanel = document.querySelector('#pending-panel');
  pendingPanel.hidden = !pending.length;
  document.querySelector('#pending-title').textContent = format === 'siri' ? 'Outside Nordic scope' : 'Under consideration';
  document.querySelector('#pending-note').textContent = format === 'siri' ? 'Present in the SIRI source, but marked extended, conditional or not-in-scope.' : 'This is the CCB view of items classified as NordicCandidate in the source. EnturExtension items are kept outside this queue.';
  document.querySelector('#pending-list').innerHTML = pending.map((entry) => `<article class="pending-entry"><div class="entry-marker">${format.toUpperCase()}</div><div class="entry-body"><div class="entry-heading"><h3>${escapeHtml(entry.name)}</h3><span>${escapeHtml(entry.status)}</span></div><p>${escapeHtml(entry.description)} Requires CCB treatment before inclusion.</p><code>${escapeHtml(entry.subject)}</code><small>Candidate for a new decision</small></div></article>`).join('');
  if (!objects.length && !rules.length) {
    document.querySelector('#profile-list').innerHTML = '<div class="profile-loading">No entries match this format or search.</div>';
    return;
  }
  const objectCards = displayedObjects.map((object) => {
    const kindLabel = object.kind === 'service' ? 'Service' : 'Object';
    const description = object.description ? `<p>${escapeHtml(object.description)}</p>` : '';
    const objectRules = rules.filter((rule) => rule.name === object.name).slice(0, 5);
    const ruleSummary = objectRules.length ? `<div class="object-rules"><strong>Profile treatment</strong>${objectRules.map((rule) => `<span><code>${escapeHtml(rule.path)}</code> ${escapeHtml(rule.cardinality)} · ${escapeHtml(rule.description)}</span>`).join('')}</div>` : '';
    const fields = object.fields || [];
    const shownFields = fields.slice(0, 8);
    const moreFields = fields.length > shownFields.length ? `<span class="more">+${fields.length - shownFields.length} more</span>` : '';
    const fieldsSummary = fields.length ? `<div class="object-fields"><strong>Profile fields (${fields.length})</strong>${shownFields.map((field) => `<span><code>${escapeHtml(field.path)}</code> ${escapeHtml(field.cardinality)}</span>`).join('')}${moreFields}</div>` : '';
    const documentationLinksHtml = object.documentation && typeof object.documentation === 'object'
      ? Object.entries(object.documentation).filter(([, url]) => url).map(([key, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(key)}</a>`).join('')
      : (object.documentation ? `<a href="${escapeHtml(object.documentation)}" target="_blank" rel="noopener">source</a>` : '');
    const documentation = documentationLinksHtml ? `<div class="object-doc-path"><strong>Documentation</strong><div class="object-links">${documentationLinksHtml}</div></div>` : '';
    return `<article class="profile-entry"><div class="entry-marker">${format.toUpperCase()}</div><div class="entry-body"><div class="entry-heading"><h3>${escapeHtml(object.name)}</h3><span>${kindLabel}</span></div>${description}${ruleSummary}${fieldsSummary}${documentation}</div></article>`;
  });
  document.querySelector('#profile-list').innerHTML = objectCards.join('');
};

const load = async () => {
  try {
    const fetchText = (url) => fetch(url).then((response) => { if (!response.ok) throw new Error(response.status); return response.text(); });
    const [netex, siri, siriBaseline, documentation, baseline] = await Promise.all([
      fetchText(sources.netex.url),
      fetchText(sources.siri.url),
      fetchText(sources.siriBaseline.url),
      fetchText(sources.netexDocumentation.url),
      fetchText(sources.netexBaseline.url)
    ]);
    const overlay = extractNetex(netex, documentation);
    const baselineData = extractNordicBaseline(baseline, documentation);
    const objects = new Map(baselineData.objects.map((object) => [object.name, object]));
    overlay.objects.forEach((object) => objects.set(object.name, { ...objects.get(object.name), ...object }));
    state.netex = {
      objects: [...objects.values()],
      rules: overlay.rules,
      pending: [...new Map([...baselineData.pending, ...overlay.pending].map((item) => [item.name, item])).values()]
    };
    state.siri = extractSiri(siri, siriBaseline);
    const metadata = profileMetadata(netex);
    document.querySelector('#context-definition').textContent = metadata.definition;
    document.querySelector('#context-confidence').textContent = metadata.confidence;
    document.querySelector('#context-validated').textContent = `Validated ${metadata.validated}`;
    document.querySelector('#context-datasets').textContent = metadata.datasets;
    document.querySelector('#context-layers').innerHTML = ['SHACL constraints', 'Element ordering', 'Domain chains', 'Transmodel alignment', 'SIRI bridge'].map((layer) => `<span>${layer}</span>`).join('');
    const siriProfile = siriMetadata(siri);
    state.siri.metadata = siriProfile;
    document.querySelector('#source-count').textContent = '4';
    document.querySelector('#profile-source-count').textContent = 'NeTEx, SIRI, SIRI baseline and documentation read';
    document.querySelector('#profile-updated').textContent = new Date().toLocaleDateString('en-GB');
    render();
  } catch (error) {
    document.querySelector('#profile-status').textContent = 'The profile sources could not be read.';
    document.querySelector('#profile-list').innerHTML = '<div class="profile-loading">The profile is temporarily unavailable. Try again when the source repositories are reachable.</div>';
  }
};

document.querySelectorAll('.profile-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.profile-tab').forEach((item) => { item.classList.remove('is-active'); item.setAttribute('aria-selected', 'false'); });
  tab.classList.add('is-active');
  tab.setAttribute('aria-selected', 'true');
  state.filter = tab.dataset.profileFilter;
  render();
}));
document.querySelector('#profile-search').addEventListener('input', (event) => { state.query = event.target.value.toLowerCase().trim(); render(); });
load();