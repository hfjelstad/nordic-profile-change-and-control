const sources = {
  netex: { label: 'NeTEx', url: 'https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic.ttl' },
  netexBaseline: { label: 'Nordic Profile baseline', url: 'https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic-baseline.ttl' },
  netexModel: { label: 'NeTEx structural model', url: 'https://raw.githubusercontent.com/entur/nordic-netex-ontology/main/netex-nordic-model.ttl' },
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

const extractNetexModel = (text) => {
  // Curated frame containment/childOf overlay (a separate file from the
  // baseline/SHACL layers): covers envelope elements like
  // PublicationDelivery/ParticipantRef that are never a CCB decision
  // themselves but are still real, documented NeTEx structure.
  const entries = new Map();
  const ensure = (name) => {
    if (!entries.has(name)) entries.set(name, { name, contains: [], childOf: null });
    return entries.get(name);
  };
  const statementPattern = /netex:([A-Za-z][\w-]*)\s+((?:nordic:\w+\s+[^;.]+;?\s*)+)\./g;
  let match;
  while ((match = statementPattern.exec(text))) {
    const subject = match[1];
    const body = match[2];
    const containsMatch = body.match(/nordic:contains\s+([^;]+)/);
    if (containsMatch) {
      const names = [...containsMatch[1].matchAll(/netex:([A-Za-z][\w-]*)/g)].map((m) => m[1]);
      ensure(subject).contains.push(...names);
    }
    const childOfMatch = body.match(/nordic:childOf\s+netex:([A-Za-z][\w-]*)/);
    if (childOfMatch) ensure(subject).childOf = childOfMatch[1];
  }
  return entries;
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
      const service = { name: quoted(block, 'rdfs:label') || declaration.name, subject: `siri:${declaration.name}`, status, kind: 'service', description: definition(block, ''), documentation: quoted(block, 'doc:description') || quoted(block, 'doc:table'), source: 'siri-nordic.ttl' };
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
    const object = { name: quoted(block, 'rdfs:label') || declaration.name, subject: `siri:${declaration.name}`, status, kind: 'class', description: definition(block, ''), documentation: quoted(block, 'doc:description') || quoted(block, 'doc:table'), source: 'siri-nordic.ttl' };
    (status === 'in-scope' ? objects : pending).push(object);
  });

  const baselinePattern = /siri:([A-Za-z][\w-]*)\s+nordic:inProfile\s+profile:NordicSIRI\s*;([\s\S]*?)(?=\nsiri:[A-Za-z][\w-]*\s+nordic:inProfile|\n##|$)/g;
  let baselineMatch;
  while ((baselineMatch = baselinePattern.exec(baseline))) {
    const name = baselineMatch[1];
    const block = baselineMatch[0];
    // Nested field members (element/path/cardinality), same shape as the
    // NeTEx baseline; these carry most of the baseline's actual content.
    const fieldPattern = /nordic:onClass\s+siri:([A-Za-z][\w-]*)\s*;\s*nordic:element\s+"([^"]*)"\s*;\s*nordic:path\s+"([^"]*)"\s*;\s*nordic:cardinality\s+"([^"]*)"/g;
    const fields = [...block.matchAll(fieldPattern)]
      .filter(([, onClass]) => onClass === name)
      .map(([, , element, path, cardinality]) => ({ element, path, cardinality: cardinality || 'unspecified' }));
    const existing = objects.find((entry) => entry.subject === `siri:${name}`) || pending.find((entry) => entry.subject === `siri:${name}`);
    if (existing) {
      existing.fields = fields;
      continue;
    }
    const service = [...block.matchAll(/nordic:inService\s+nordic:([A-Za-z_][\w-]*)/g)].map((match) => match[1]);
    objects.push({
      name,
      subject: `siri:${name}`,
      status: 'in-scope',
      kind: 'class',
      fields,
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
    const kindLabel = object.kind === 'service' ? 'Service' : object.kind === 'structure' ? 'Structure' : 'Object';
    const description = object.description ? `<p>${escapeHtml(object.description)}</p>` : '';
    const objectRules = rules.filter((rule) => rule.name === object.name).slice(0, 5);
    const ruleSummary = objectRules.length ? `<div class="object-rules"><strong>Profile treatment</strong>${objectRules.map((rule) => `<span><code>${escapeHtml(rule.path)}</code> ${escapeHtml(rule.cardinality)} · ${escapeHtml(rule.description)}</span>`).join('')}</div>` : '';
    const fields = object.fields || [];
    const shownFields = fields.slice(0, 8);
    const moreFields = fields.length > shownFields.length ? `<span class="more">+${fields.length - shownFields.length} more</span>` : '';
    const fieldsSummary = fields.length ? `<div class="object-fields"><strong>Profile fields (${fields.length})</strong>${shownFields.map((field) => `<span><code>${escapeHtml(field.path)}</code> ${escapeHtml(field.cardinality)}</span>`).join('')}${moreFields}</div>` : '';
    const structureParts = [];
    if (object.childOf) structureParts.push(`<span>Child of <code>${escapeHtml(object.childOf)}</code></span>`);
    if (object.contains && object.contains.length) structureParts.push(`<span>Contains ${object.contains.map((name) => `<code>${escapeHtml(name)}</code>`).join(', ')}</span>`);
    const structureSummary = structureParts.length ? `<div class="object-structure"><strong>Containment</strong>${structureParts.join('')}</div>` : '';
    const documentationLinksHtml = object.documentation && typeof object.documentation === 'object'
      ? Object.entries(object.documentation).filter(([, url]) => url).map(([key, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(key)}</a>`).join('')
      : (object.documentation ? `<a href="${escapeHtml(object.documentation)}" target="_blank" rel="noopener">source</a>` : '');
    const documentation = documentationLinksHtml ? `<div class="object-doc-path"><strong>Documentation</strong><div class="object-links">${documentationLinksHtml}</div></div>` : '';
    return `<article class="profile-entry"><div class="entry-marker">${format.toUpperCase()}</div><div class="entry-body"><div class="entry-heading"><h3>${escapeHtml(object.name)}</h3><span>${kindLabel}</span></div>${description}${ruleSummary}${fieldsSummary}${structureSummary}${documentation}</div></article>`;
  });
  document.querySelector('#profile-list').innerHTML = objectCards.join('');
};

const load = async () => {
  try {
    const fetchText = (url) => fetch(url).then((response) => { if (!response.ok) throw new Error(response.status); return response.text(); });
    const [netex, siri, siriBaseline, documentation, baseline, model] = await Promise.all([
      fetchText(sources.netex.url),
      fetchText(sources.siri.url),
      fetchText(sources.siriBaseline.url),
      fetchText(sources.netexDocumentation.url),
      fetchText(sources.netexBaseline.url),
      fetchText(sources.netexModel.url)
    ]);
    const overlay = extractNetex(netex, documentation);
    const baselineData = extractNordicBaseline(baseline, documentation);
    const objects = new Map(baselineData.objects.map((object) => [object.name, object]));
    // SHACL shapes always assume NordicProfile scope and know nothing about
    // the baseline; if the baseline has since marked a name NordicCandidate,
    // don't let a stale shape resurrect it as an accepted Object card.
    const pendingNames = new Set([...baselineData.pending, ...overlay.pending].map((item) => item.name));
    overlay.objects.forEach((object) => {
      if (pendingNames.has(object.name)) return;
      objects.set(object.name, { ...objects.get(object.name), ...object });
    });
    // Envelope/frame elements (PublicationDelivery, ParticipantRef, ...) are
    // never baseline/SHACL content, only documented here as containment; add
    // them as their own cards, without touching objects already known above.
    extractNetexModel(model).forEach((entry, name) => {
      if (objects.has(name)) return;
      if (!entry.contains.length && !entry.childOf) return;
      objects.set(name, { name, subject: `netex:${name}`, kind: 'structure', contains: entry.contains, childOf: entry.childOf, source: 'netex-nordic-model.ttl' });
    });
    state.netex = {
      objects: [...objects.values()],
      rules: overlay.rules,
      pending: [...new Map([...baselineData.pending, ...overlay.pending].map((item) => [item.name, item])).values()]
    };
    state.siri = extractSiri(siri, siriBaseline);
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