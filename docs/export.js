const repository = 'hfjelstad/nordic-profile-change-and-control';
const repositoryApi = `https://api.github.com/repos/${repository}`;

const labelSelect = document.querySelector('#export-label');
const stateSelect = document.querySelector('#export-state');
const searchInput = document.querySelector('#export-search');
const list = document.querySelector('#export-list');
const count = document.querySelector('#export-count');
const runButton = document.querySelector('#export-run');
const status = document.querySelector('#export-status');
const includeComments = document.querySelector('#export-comments');

const issuesByState = {};
const selected = new Set();

const getJson = (url) => fetch(url, { headers: { Accept: 'application/vnd.github+json' } }).then((response) => {
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
});

const loadIssues = async (state) => {
  if (issuesByState[state]) return issuesByState[state];
  const issues = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = await getJson(`${repositoryApi}/issues?state=${state}&per_page=100&page=${page}`);
    issues.push(...batch.filter((issue) => !issue.pull_request));
    if (batch.length < 100) break;
  }
  issues.sort((a, b) => a.number - b.number);
  issuesByState[state] = issues;
  return issues;
};

const currentIssues = () => issuesByState[stateSelect.value] || [];

const visibleIssues = () => {
  const label = labelSelect.value;
  const query = searchInput.value.trim().toLowerCase().replace(/^#/, '');
  return currentIssues().filter((issue) => (!label || issue.labels.some((l) => l.name === label))
    && (!query || issue.title.toLowerCase().includes(query) || String(issue.number) === query));
};

const updateRunButton = () => {
  runButton.disabled = selected.size === 0;
  runButton.firstChild.textContent = `Export ${selected.size} to Word `;
};

const render = () => {
  const issues = visibleIssues();
  count.textContent = String(issues.length).padStart(2, '0');
  if (!issues.length) {
    list.innerHTML = '<li class="register-empty"><span class="list-marker">--</span><span>No change requests match this filter.</span></li>';
    return;
  }
  list.replaceChildren(...issues.map((issue) => {
    const item = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'export-item';
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: selected.has(issue.number) });
    box.addEventListener('change', () => {
      if (box.checked) selected.add(issue.number); else selected.delete(issue.number);
      updateRunButton();
    });
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = issue.title;
    const detail = document.createElement('small');
    detail.textContent = `#${issue.number} · ${issue.state} · ${issue.labels.map((l) => l.name).join(', ')}`;
    text.append(title, detail);
    label.append(box, text);
    item.append(label);
    return item;
  }));
};

const refreshLabels = () => {
  const current = labelSelect.value;
  const names = [...new Set(currentIssues().flatMap((issue) => issue.labels.map((l) => l.name)))].sort();
  labelSelect.replaceChildren(new Option('all labels', ''), ...names.map((name) => new Option(name, name)));
  labelSelect.value = names.includes(current) ? current : '';
};

const reload = async () => {
  list.innerHTML = '<li class="register-empty"><span class="list-marker">--</span><span>Loading change requests...</span></li>';
  try {
    await loadIssues(stateSelect.value);
    refreshLabels();
    render();
  } catch (error) {
    count.textContent = '—';
    list.innerHTML = '<li class="register-empty"><span class="list-marker">--</span><span>Could not load change requests from GitHub right now.</span></li>';
  }
};

labelSelect.addEventListener('change', render);
searchInput.addEventListener('input', render);
stateSelect.addEventListener('change', reload);
document.querySelector('#export-select-visible').addEventListener('click', () => {
  visibleIssues().forEach((issue) => selected.add(issue.number));
  render();
  updateRunButton();
});
document.querySelector('#export-clear').addEventListener('click', () => {
  selected.clear();
  render();
  updateRunButton();
});

// ---- Word document (.docx) built in the browser: WordprocessingML in a stored ZIP ----

const COLOR = { teal: '0F766E', tealDark: '09534E', coral: 'E26D5A', ink: '17211F', muted: '61706B', line: 'D8DDD5', paper: 'F4F1E9', code: 'F3F5F2' };
const issueUrl = (number) => `https://github.com/${repository}/issues/${number}`;

const xmlEscape = (text) => String(text)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const run = (text, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;

const paragraph = (content, { style = '', props = '' } = {}) => `<w:p>${style || props ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${props}</w:pPr>` : ''}${content}</w:p>`;

const field = (instr) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

// Collects external hyperlinks so each gets a relationship id in document.xml.rels.
const createLinks = () => {
  const rels = [];
  const link = (url, text, props = '') => {
    const id = `rIdLink${rels.length + 1}`;
    rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(url)}" TargetMode="External"/>`);
    return `<w:hyperlink r:id="${id}">${run(text, `<w:rStyle w:val="Hyperlink"/>${props}`)}</w:hyperlink>`;
  };
  return { rels, link };
};

// Inline markdown: [text](url), **bold**, _italic_, `code`, bare URLs and #123 issue references.
const INLINE = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+|(?<![\w&/])#\d+\b|(?<![\w])_[^_]+_(?![\w]))/;
const inline = (text, links, props = '') => text.split(INLINE).filter(Boolean).map((part) => {
  const md = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
  if (md) return links.link(md[2], md[1], props);
  if (/^https?:\/\//.test(part)) {
    const [, url, tail] = part.match(/^(.*?)([.,;:]*)$/);
    return links.link(url, url, props) + (tail ? run(tail, props) : '');
  }
  if (/^#\d+$/.test(part)) return links.link(issueUrl(part.slice(1)), part, props);
  if (part.startsWith('**') && part.endsWith('**')) return run(part.slice(2, -2), `<w:b/>${props}`);
  if (part.startsWith('`') && part.endsWith('`')) return run(part.slice(1, -1), `<w:rStyle w:val="InlineCode"/>${props}`);
  if (/^_[^_]+_$/.test(part)) return run(part.slice(1, -1), `<w:i/>${props}`);
  return run(part, props);
}).join('');

const cell = (content, { width, fill = '', header = false } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:tcMar><w:top w:w="70" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/></w:tcMar></w:tcPr>${content || paragraph('', { style: header ? 'TableHeader' : 'TableText' })}</w:tc>`;

// rows: array of arrays of cell XML (already wrapped in paragraphs). widths in twentieths of a point.
const table = (rows, widths, { header = true, labelColumn = false, borders = true, heights = [] } = {}) => {
  const edge = borders ? `w:val="single" w:sz="4" w:space="0" w:color="${COLOR.line}"` : 'w:val="nil"';
  const tblPr = `<w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top ${edge}/><w:bottom ${edge}/><w:insideH ${edge}/><w:left w:val="nil"/><w:right w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const body = rows.map((cells, r) => {
    const isHeader = header && r === 0;
    const height = heights[r] ? `<w:trHeight w:val="${heights[r]}"/>` : '';
    const trPr = isHeader ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : `<w:trPr><w:cantSplit/>${height}</w:trPr>`;
    return `<w:tr>${trPr}${cells.map((content, c) => cell(content, {
      width: widths[c],
      header: isHeader,
      fill: isHeader ? COLOR.teal : (labelColumn && c === 0 ? COLOR.paper : '')
    })).join('')}</w:tr>`;
  }).join('');
  return `<w:tbl>${tblPr}${grid}${body}</w:tbl>${paragraph('', { style: 'Spacer' })}`;
};

const CONTENT_WIDTH = 9070;

// Issue-form markdown to Word blocks: paragraphs, bullets, quotes, tables, fenced code, bold-only subheadings.
const markdownBlocks = (markdown, links) => {
  const out = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let buffer = [];
  const flush = () => {
    if (buffer.length) out.push(paragraph(inline(buffer.join(' '), links)));
    buffer = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flush();
      const code = [];
      for (i += 1; i < lines.length && !lines[i].trim().startsWith('```'); i += 1) code.push(lines[i]);
      code.forEach((codeLine) => out.push(paragraph(run(codeLine || ' '), { style: 'Code' })));
      out.push(paragraph('', { style: 'Spacer' }));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i += 1) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
      }
      i -= 1;
      const columns = Math.max(...rows.map((r) => r.length));
      const widths = Array.from({ length: columns }, (_, c) => Math.floor(CONTENT_WIDTH * (c === columns - 1 ? 2 : 1) / (columns + 1)));
      // Rows with only a first column filled in are left for the reader to fill in by hand.
      const heights = rows.map((r, n) => (n > 0 && r.slice(1).every((c) => !c) ? 560 : 0));
      out.push(table(rows.map((r, n) => Array.from({ length: columns }, (_, c) => paragraph(
        n === 0 ? run(r[c] || '') : inline(r[c] || '', links), { style: n === 0 ? 'TableHeader' : 'TableText' }))), widths, { heights }));
      continue;
    }
    const subheading = line.match(/^\s*(?:\*\*([^*]+)\*\*|#{4,6}\s+(.+))\s*$/);
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (!line.trim()) flush();
    else if (subheading) { flush(); out.push(paragraph(run(subheading[1] || subheading[2]), { style: 'Heading3' })); }
    else if (bullet) { flush(); out.push(paragraph(inline(bullet[1], links), { style: 'ListBullet' })); }
    else if (quote) { flush(); if (quote[1].trim()) out.push(paragraph(inline(quote[1], links), { style: 'Quote' })); }
    else buffer.push(line.trim());
  }
  flush();
  return out.join('');
};

// "### Heading" sections from the issue form; empty answers are left out.
const sections = (body) => {
  const parts = (body || '').replace(/\r\n/g, '\n').split(/^### /m);
  const intro = parts.shift().trim();
  const result = intro ? [{ heading: '', text: intro }] : [];
  parts.forEach((part) => {
    const [heading, ...rest] = part.split('\n');
    const text = rest.join('\n').trim();
    if (text && text !== '_No response_') result.push({ heading: heading.replace(/\s*\(optional[^)]*\)\s*$/i, '').trim(), text });
  });
  return result;
};

// Shown in the summary table at the top of each change request instead of as sections.
const META_SECTIONS = ['Raised by', 'Existing decision ID', 'Source', 'XML file', 'Related'];

const splitTitle = (title) => {
  const match = title.match(/^([A-Z][A-Z0-9]*-\d+):\s*(.+)$/);
  return match ? { key: match[1], name: match[2] } : { key: '', name: title };
};

const buildDocument = (issues, commentsByIssue) => {
  const links = createLinks();
  const today = new Date().toISOString().slice(0, 10);
  const plural = issues.length === 1 ? 'change request' : 'change requests';
  const parsed = issues.map((issue) => ({ issue, ...splitTitle(issue.title), sections: sections(issue.body) }));
  const sectionText = (p, heading) => (p.sections.find((s) => s.heading === heading) || {}).text || '';

  const label = (text) => paragraph(run(text), { style: 'TableLabel' });
  const value = (content) => paragraph(content, { style: 'TableText' });

  const parts = [
    // Cover page
    paragraph(run('NORDIC PROFILE CCB'), { style: 'CoverEyebrow' }),
    paragraph(run('Change requests'), { style: 'Title' }),
    paragraph(run('For review by the Nordic Profile Change and Control Board'), { style: 'Subtitle' }),
    paragraph('', { style: 'CoverRule' }),
    table([
      [label('Date'), value(run(today))],
      [label('Contents'), value(run(`${issues.length} ${plural}`))],
      [label('Source'), value(links.link(`https://github.com/${repository}`, `github.com/${repository}`))]
    ], [2000, CONTENT_WIDTH - 2000], { header: false, labelColumn: true }),
    paragraph(run('Each change request is tracked as a GitHub issue. Working group comments are input to the CCB, not decisions. A change request becomes part of the Nordic profile only when the CCB accepts it and records it as a decision.'), { style: 'CoverNote' }),

    // Overview
    paragraph(run('Overview'), { style: 'Heading1', props: '<w:pageBreakBefore/>' }),
    table([
      ['ID', 'Change request', 'Raised by', 'Issue'].map((h) => paragraph(run(h), { style: 'TableHeader' })),
      ...parsed.map((p) => [
        value(run(p.key || '–', '<w:b/>')),
        value(run(p.name)),
        value(run(sectionText(p, 'Raised by') || '–')),
        value(links.link(p.issue.html_url, `#${p.issue.number}`))
      ])
    ], [1100, 5370, 1500, 1100])
  ];

  parsed.forEach((p) => {
    const { issue } = p;
    parts.push(paragraph(run(p.key || 'Change request'), { style: 'Eyebrow', props: '<w:pageBreakBefore/>' }));
    parts.push(paragraph(run(p.name), { style: 'Heading1' }));

    const xmlFile = sectionText(p, 'XML file');
    const rows = [
      [label('Issue'), value(links.link(issue.html_url, `#${issue.number} on GitHub`))],
      [label('Status'), value(run(`${issue.state === 'open' ? 'Open' : 'Closed'} · ${issue.labels.map((l) => l.name).join(', ')}`))]
    ];
    if (sectionText(p, 'Raised by')) rows.push([label('Raised by'), value(inline(sectionText(p, 'Raised by'), links))]);
    if (sectionText(p, 'Existing decision ID')) rows.push([label('Existing decision'), value(inline(sectionText(p, 'Existing decision ID'), links))]);
    if (xmlFile) rows.push([label('XML example file'), value(inline(xmlFile, links))]);
    if (sectionText(p, 'Related')) rows.push([label('Related'), value(inline(sectionText(p, 'Related'), links))]);
    if (sectionText(p, 'Source')) rows.push([label('Source'), paragraph(inline(sectionText(p, 'Source'), links), { style: 'TableNote' })]);
    parts.push(table(rows, [2000, CONTENT_WIDTH - 2000], { header: false, labelColumn: true }));

    p.sections.filter((s) => !META_SECTIONS.includes(s.heading)).forEach(({ heading, text }) => {
      if (heading) parts.push(paragraph(run(heading), { style: 'Heading2' }));
      parts.push(markdownBlocks(text, links));
    });

    const comments = commentsByIssue[issue.number] || [];
    if (comments.length) {
      parts.push(paragraph(run('Discussion'), { style: 'Heading2' }));
      comments.forEach((comment) => {
        parts.push(paragraph(run(`${comment.user.login} · ${comment.created_at.slice(0, 10)}`), { style: 'CommentMeta' }));
        parts.push(markdownBlocks(comment.body || '', links));
      });
    }
  });

  const sectPr = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1304" w:left="1418" w:header="680" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr>`;
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${ns}><w:body>${parts.join('')}${sectPr}</w:body></w:document>`;

  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${ns}>${paragraph(run('Nordic Profile CCB', `<w:b/><w:color w:val="${COLOR.teal}"/>`) + run('   ·   Change requests for review'), { style: 'Header' })}</w:hdr>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${ns}>${paragraph(run(`Exported ${today} from github.com/${repository}`) + run('\t') + run('Page ') + field('PAGE') + run(' of ') + field('NUMPAGES'), { style: 'Footer' })}</w:ftr>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${links.rels.join('')}</Relationships>`;

  const style = (id, name, { based = 'Normal', p = '', r = '', type = 'paragraph', next = '' } = {}) => `<w:style w:type="${type}"${id === 'Normal' ? ' w:default="1"' : ''} w:styleId="${id}"><w:name w:val="${name}"/>${based ? `<w:basedOn w:val="${based}"/>` : ''}${next ? `<w:next w:val="${next}"/>` : ''}<w:qFormat/>${p ? `<w:pPr>${p}</w:pPr>` : ''}${r ? `<w:rPr>${r}</w:rPr>` : ''}</w:style>`;
  const mono = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
  // Identical borders on every code line make Word draw one box around the whole block.
  const codeBorder = `<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${COLOR.line}"/><w:left w:val="single" w:sz="18" w:space="8" w:color="${COLOR.teal}"/><w:bottom w:val="single" w:sz="4" w:space="4" w:color="${COLOR.line}"/><w:right w:val="single" w:sz="4" w:space="8" w:color="${COLOR.line}"/></w:pBdr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:color w:val="${COLOR.ink}"/><w:sz w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${
    style('Normal', 'Normal', { based: '' })}${
    style('CoverEyebrow', 'Cover Eyebrow', { p: '<w:spacing w:before="2600" w:after="120"/>', r: `<w:b/><w:color w:val="${COLOR.coral}"/><w:spacing w:val="40"/><w:sz w:val="20"/>` })}${
    style('Title', 'Title', { p: '<w:spacing w:after="120" w:line="240" w:lineRule="auto"/>', r: `<w:b/><w:color w:val="${COLOR.tealDark}"/><w:sz w:val="72"/>` })}${
    style('Subtitle', 'Subtitle', { p: '<w:spacing w:after="360"/>', r: `<w:color w:val="${COLOR.muted}"/><w:sz w:val="28"/>` })}${
    style('CoverRule', 'Cover Rule', { p: `<w:pBdr><w:top w:val="single" w:sz="24" w:space="1" w:color="${COLOR.coral}"/></w:pBdr><w:spacing w:after="240"/><w:ind w:right="6800"/>` })}${
    style('CoverNote', 'Cover Note', { p: '<w:spacing w:before="480"/>', r: `<w:i/><w:color w:val="${COLOR.muted}"/><w:sz w:val="19"/>` })}${
    style('Eyebrow', 'Eyebrow', { next: 'Heading1', p: '<w:keepNext/><w:spacing w:after="40"/>', r: `<w:b/><w:color w:val="${COLOR.coral}"/><w:spacing w:val="30"/><w:sz w:val="20"/>` })}${
    style('Heading1', 'heading 1', { p: '<w:keepNext/><w:spacing w:before="0" w:after="200"/><w:outlineLvl w:val="0"/>', r: `<w:b/><w:color w:val="${COLOR.tealDark}"/><w:sz w:val="40"/>` })}${
    style('Heading2', 'heading 2', { p: `<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="${COLOR.line}"/></w:pBdr><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="1"/>`, r: `<w:b/><w:color w:val="${COLOR.teal}"/><w:sz w:val="26"/>` })}${
    style('Heading3', 'heading 3', { p: '<w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/>', r: `<w:b/><w:color w:val="${COLOR.ink}"/><w:sz w:val="22"/>` })}${
    style('ListBullet', 'List Bullet', { p: '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/>' })}${
    style('Quote', 'Quote', { p: `<w:ind w:left="284" w:right="284"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="${COLOR.coral}"/></w:pBdr>`, r: `<w:i/><w:color w:val="${COLOR.muted}"/>` })}${
    style('Code', 'Code', { p: `${codeBorder}<w:shd w:val="clear" w:color="auto" w:fill="${COLOR.code}"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="170" w:right="170"/>`, r: `${mono}<w:sz w:val="16"/>` })}${
    style('TableText', 'Table Text', { p: '<w:spacing w:after="0"/>', r: '<w:sz w:val="19"/>' })}${
    style('TableLabel', 'Table Label', { based: 'TableText', r: `<w:b/><w:color w:val="${COLOR.muted}"/>` })}${
    style('TableHeader', 'Table Header', { based: 'TableText', r: '<w:b/><w:color w:val="FFFFFF"/>' })}${
    style('Spacer', 'Spacer', { p: '<w:spacing w:after="160" w:line="120" w:lineRule="exact"/>', r: '<w:sz w:val="8"/>' })}${
    style('TableNote', 'Table Note', { based: 'TableText', r: `<w:color w:val="${COLOR.muted}"/><w:sz w:val="17"/>` })}${
    style('CommentMeta', 'Comment Meta', { p: '<w:keepNext/><w:spacing w:before="160" w:after="40"/>', r: `<w:b/><w:color w:val="${COLOR.muted}"/><w:sz w:val="18"/>` })}${
    style('Header', 'header', { p: `<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="6" w:color="${COLOR.line}"/></w:pBdr><w:spacing w:after="0"/>`, r: `<w:color w:val="${COLOR.muted}"/><w:sz w:val="17"/>` })}${
    style('Footer', 'footer', { p: `<w:tabs><w:tab w:val="right" w:pos="${CONTENT_WIDTH}"/></w:tabs><w:spacing w:after="0"/>`, r: `<w:color w:val="${COLOR.muted}"/><w:sz w:val="16"/>` })}${
    style('InlineCode', 'Inline Code', { type: 'character', based: '', r: `${mono}<w:color w:val="${COLOR.tealDark}"/><w:sz w:val="19"/>` })}${
    style('Hyperlink', 'Hyperlink', { type: 'character', based: '', r: `<w:color w:val="${COLOR.teal}"/><w:u w:val="single"/>` })}</w:styles>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr><w:rPr><w:color w:val="${COLOR.coral}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const created = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Nordic Profile CCB – Change requests</dc:title><dc:subject>Change requests for review by the Nordic Profile Change and Control Board</dc:subject><dc:creator>Nordic Profile CCB</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`;

  const wml = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${wml}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${wml}.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="${wml}.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="${wml}.header+xml"/><Override PartName="/word/footer1.xml" ContentType="${wml}.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rIdCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

  return zip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['docProps/core.xml', core],
    ['word/document.xml', documentXml],
    ['word/_rels/document.xml.rels', documentRels],
    ['word/styles.xml', styles],
    ['word/numbering.xml', numbering],
    ['word/header1.xml', headerXml],
    ['word/footer1.xml', footerXml]
  ]);
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes) => {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

// Uncompressed ("stored") ZIP: enough for Word, and no compression library needed.
const zip = (files) => {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;
  files.forEach(([name, text]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTime, 2], [12, dosDate, 2],
      [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nameBytes.length, 2], [28, 0, 2]]
      .forEach(([at, value, size]) => (size === 4 ? local.setUint32(at, value, true) : local.setUint16(at, value, true)));
    const entry = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2],
      [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nameBytes.length, 2], [30, 0, 2], [32, 0, 2],
      [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([at, value, size]) => (size === 4 ? entry.setUint32(at, value, true) : entry.setUint16(at, value, true)));
    chunks.push(local, nameBytes, data);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  });
  const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};

runButton.addEventListener('click', async () => {
  const issues = currentIssues().filter((issue) => selected.has(issue.number));
  runButton.disabled = true;
  status.textContent = 'Building document...';
  try {
    const commentsByIssue = {};
    if (includeComments.checked) {
      for (const issue of issues.filter((i) => i.comments > 0)) {
        status.textContent = `Fetching comments for #${issue.number}...`;
        commentsByIssue[issue.number] = (await getJson(issue.comments_url))
          .filter((comment) => comment.user.login !== 'github-actions[bot]');
      }
    }
    const blob = buildDocument(issues, commentsByIssue);
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `CCB-change-requests-${new Date().toISOString().slice(0, 10)}.docx`
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status.textContent = `Exported ${issues.length} change request${issues.length === 1 ? '' : 's'}.`;
  } catch (error) {
    status.textContent = 'Could not build the export. GitHub may be rate limiting this browser; try again later.';
  }
  updateRunButton();
});

reload();
