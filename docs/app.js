const filter = document.querySelector('#area-filter');
const cards = [...document.querySelectorAll('.area-card')];
const emptyState = document.querySelector('#empty-state');
const repositoryApi = 'https://api.github.com/repos/hfjelstad/nordic-profile-change-and-control';

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
    const accepted = decisions.filter(({ text }) => field(text, 'status') === 'accepted' || field(text, 'status') === 'implemented');
    document.querySelector('#accepted-count').textContent = accepted.length;
    document.querySelector('#open-count').textContent = issues.length;
    document.querySelector('#decision-count').textContent = decisions.length.toString().padStart(2, '0');
    document.querySelector('#issue-count').textContent = issues.length.toString().padStart(2, '0');
    decisionList.replaceChildren(...(decisions.length
      ? decisions.map(({ text }, index) => listItem(String(index + 1).padStart(2, '0'), field(text, 'title') || field(text, 'id'), subject(text) || field(text, 'standard'), field(text, 'status')))
      : [Object.assign(document.createElement('li'), { className: 'register-empty', innerHTML: '<span class="list-marker">--</span><span>No decisions have been accepted yet.</span>' })]));
    issueList.replaceChildren(...(issues.filter((issue) => !issue.pull_request).slice(0, 6).map((issue, index) => listItem(String(index + 1).padStart(2, '0'), issue.title, `Issue #${issue.number}`, issue.labels.map((label) => label.name).join(', ') || 'proposed')));
    if (!issueList.children.length) showMessage(issueList, 'No open proposals at the moment.');
  } catch (error) {
    document.querySelector('#accepted-count').textContent = '—';
    document.querySelector('#open-count').textContent = '—';
    document.querySelector('#decision-count').textContent = '—';
    document.querySelector('#issue-count').textContent = '—';
    showMessage(decisionList, 'The decision register is temporarily unavailable.');
    showMessage(issueList, 'The proposal register is temporarily unavailable.');
  }
};

loadProfileData();
