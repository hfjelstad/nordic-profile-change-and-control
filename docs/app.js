const filter = document.querySelector('#area-filter');
const cards = [...document.querySelectorAll('.area-card')];
const emptyState = document.querySelector('#empty-state');
const repositoryApi = 'https://api.github.com/repos/hfjelstad/nordic-profile-change-and-control';

// Left unset on purpose: the accept button below is visible but inert until
// this points at a deployed tools/accept-proxy/worker.js AND decisions/**
// requires PR approval (CODEOWNERS + branch protection). Wiring it up before
// that gate exists would let a public visitor get a decision merged
// immediately with no review.
const ACCEPT_PROXY_URL = '';

filter.addEventListener('change', () => {
  const selected = filter.value;
  let visible = 0;

  cards.forEach((card) => {
    const matches = selected === 'all' || card.dataset.area === selected;
    card.hidden = !matches;
    if (matches) visible += 1;
  });

  emptyState.hidden = visible !== 0;
});

const getJson = (url) => fetch(url, { headers: { Accept: 'application/vnd.github+json' } }).then((response) => {
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
});

const getText = (url) => fetch(url).then((response) => {
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.text();
});

const field = (text, name) => {
  const match = text.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'));
  return match ? match[1].replace(/^['"]|['"]$/g, '').trim() : '';
};

const subject = (text) => {
  const values = ['class', 'property', 'service', 'message', 'qname'];
  return values.map((name) => field(text, `  ${name}`)).filter(Boolean).join(' · ');
};

const listItem = (marker, title, detail, state = '') => {
  const item = document.createElement('li');
  item.innerHTML = `<span class="list-marker">${marker}</span><span><strong>${title}</strong><small>${detail}${state ? ` · ${state}` : ''}</small></span>`;
  return item;
};

const escapeHtml = (text) => text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));

// The "Description" field of an issue form is a "### Description" heading
// followed by free text up to the next "### " heading or the end of the body.
const issueDescription = (body) => {
  const match = body.match(/### Description\s*\n([\s\S]*?)(?=\n### |$)/);
  const text = match ? match[1].trim() : '';
  return text && text !== '_No response_' ? text : '';
};

// A proposal issue you can click to expand: fetched lazily (only on first
// expand) so loading the page doesn't burn through the unauthenticated
// GitHub API rate limit fetching comments for every open proposal at once.
const proposalItem = (marker, issue) => {
  const item = document.createElement('li');
  item.className = 'proposal-item';
  const labels = issue.labels.map((label) => label.name).join(', ') || 'proposed';
  item.innerHTML = `
    <button type="button" class="proposal-toggle" aria-expanded="false">
      <span class="list-marker">${marker}</span>
      <span><strong>${escapeHtml(issue.title)}</strong><small>Issue #${issue.number} · ${escapeHtml(labels)}</small></span>
    </button>
    <div class="proposal-detail" hidden></div>`;
  const button = item.querySelector('.proposal-toggle');
  const detail = item.querySelector('.proposal-detail');
  let loaded = false;
  button.addEventListener('click', async () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    detail.hidden = expanded;
    if (expanded || loaded) return;
    loaded = true;
    detail.innerHTML = '<p class="proposal-loading">Loading proposal detail...</p>';
    try {
      const comments = await getJson(issue.comments_url);
      const description = issueDescription(issue.body || '');
      const check = [...comments].reverse().find((comment) => comment.user.login === 'github-actions[bot]');
      detail.innerHTML = `
        ${description ? `<p class="proposal-description">${escapeHtml(description)}</p>` : ''}
        ${check ? `<pre class="proposal-check">${escapeHtml(check.body)}</pre>` : '<p class="proposal-loading">No automated check comment yet.</p>'}
        <div class="proposal-actions">
          <a class="proposal-cta" href="${issue.html_url}" target="_blank" rel="noreferrer">Open on GitHub, add the <code>accept</code> label to draft a decision <span aria-hidden="true">↗</span></a>
          <button type="button" class="proposal-accept" data-issue="${issue.number}">Accept <span aria-hidden="true">→</span></button>
        </div>
        <p class="proposal-accept-status" hidden></p>`;
      detail.querySelector('.proposal-accept').addEventListener('click', () => onAcceptClick(detail, issue.number));
    } catch (error) {
      detail.innerHTML = '<p class="proposal-loading">Could not load proposal detail right now.</p>';
    }
  });
  return item;
};

// The button always exists so the site's shape doesn't change once this is
// wired up for real - today it only ever shows a status message, it never
// calls a network endpoint.
const onAcceptClick = async (detail, issueNumber) => {
  const status = detail.querySelector('.proposal-accept-status');
  status.hidden = false;
  if (!ACCEPT_PROXY_URL) {
    status.textContent = 'Not enabled yet - use the accept label on the GitHub issue for now.';
    return;
  }
  status.textContent = 'Requesting...';
  try {
    const response = await fetch(ACCEPT_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue: issueNumber })
    });
    status.textContent = response.ok ? 'Accepted - drafting a decision now.' : `Could not accept (${response.status}).`;
  } catch (error) {
    status.textContent = 'Could not reach the accept service.';
  }
};

const showMessage = (element, message) => {
  element.innerHTML = `<li class="register-empty"><span class="list-marker">--</span><span>${message}</span></li>`;
};

const loadProfileData = async () => {
  const decisionList = document.querySelector('#decision-list');
  const issueList = document.querySelector('#issue-list');
  try {
    const [files, issues] = await Promise.all([
      getJson(`${repositoryApi}/contents/decisions`),
      getJson(`${repositoryApi}/issues?state=open&per_page=20`)
    ]);
    const decisions = await Promise.all(files
      .filter((file) => file.name.endsWith('.yaml') && file.name !== 'DECISION-TEMPLATE.yaml')
      .map((file) => getText(file.download_url).then((text) => ({ file, text }))));
    document.querySelector('#decision-count').textContent = decisions.length.toString().padStart(2, '0');
    document.querySelector('#issue-count').textContent = issues.length.toString().padStart(2, '0');
    decisionList.replaceChildren(...(decisions.length
      ? decisions.map(({ text }, index) => listItem(String(index + 1).padStart(2, '0'), field(text, 'title') || field(text, 'id'), subject(text) || field(text, 'standard'), field(text, 'status')))
      : [Object.assign(document.createElement('li'), { className: 'register-empty', innerHTML: '<span class="list-marker">--</span><span>No decisions have been accepted yet.</span>' })]));
    issueList.replaceChildren(...(issues.filter((issue) => !issue.pull_request).slice(0, 6).map((issue, index) => proposalItem(String(index + 1).padStart(2, '0'), issue))));
    if (!issueList.children.length) showMessage(issueList, 'No open proposals at the moment.');
  } catch (error) {
    document.querySelector('#decision-count').textContent = '—';
    document.querySelector('#issue-count').textContent = '—';
    showMessage(decisionList, 'The decision register is temporarily unavailable.');
    showMessage(issueList, 'The proposal register is temporarily unavailable.');
  }
};

loadProfileData();
