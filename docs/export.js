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

const xmlEscape = (text) => String(text)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const run = (text, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;

const paragraph = (content, { style = '', props = '' } = {}) => `<w:p>${style || props ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${props}</w:pPr>` : ''}${content}</w:p>`;

const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

// Inline markdown: **bold**, `code`; everything else is kept as written.
const inline = (text) => text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) => {
  if (part.startsWith('**') && part.endsWith('**')) return run(part.slice(2, -2), '<w:b/>');
  if (part.startsWith('`') && part.endsWith('`')) return run(part.slice(1, -1), '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
  return run(part);
}).join('');

// Issue-form markdown to paragraphs: bullets, quotes, fenced code and plain text.
const markdownBlocks = (markdown) => {
  const out = [];
  let inCode = false;
  let buffer = [];
  const flush = () => {
    if (buffer.length) out.push(paragraph(inline(buffer.join(' '))));
    buffer = [];
  };
  markdown.replace(/\r\n/g, '\n').split('\n').forEach((line) => {
    if (line.trim().startsWith('```')) {
      flush();
      inCode = !inCode;
      return;
    }
    if (inCode) {
      out.push(paragraph(run(line, '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/>'), { style: 'Code' }));
      return;
    }
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (!line.trim()) flush();
    else if (bullet) { flush(); out.push(paragraph(run('•\t') + inline(bullet[1]), { style: 'Bullet' })); }
    else if (quote) { flush(); if (quote[1].trim()) out.push(paragraph(inline(quote[1]), { style: 'Quote' })); }
    else buffer.push(line.trim());
  });
  flush();
  return out.join('');
};

// "### Heading" sections from the issue form; empty answers are left out.
const sections = (body) => {
  const parts = (body || '').split(/^### /m);
  const intro = parts.shift().trim();
  const result = intro ? [{ heading: '', text: intro }] : [];
  parts.forEach((part) => {
    const [heading, ...rest] = part.split('\n');
    const text = rest.join('\n').trim();
    if (text && text !== '_No response_') result.push({ heading: heading.trim(), text });
  });
  return result;
};

const hyperlink = (rels, url, text) => {
  const id = `rIdLink${rels.length + 1}`;
  rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(url)}" TargetMode="External"/>`);
  return `<w:hyperlink r:id="${id}">${run(text, '<w:rStyle w:val="Hyperlink"/>')}</w:hyperlink>`;
};

const buildDocument = (issues, commentsByIssue) => {
  const rels = [];
  const today = new Date().toISOString().slice(0, 10);
  const parts = [
    paragraph(run('Nordic Profile CCB – Change requests'), { style: 'Title' }),
    paragraph(run(`Exported ${today} from github.com/${repository}. ${issues.length} change request${issues.length === 1 ? '' : 's'}.`)),
    paragraph(run('Contents'), { style: 'Heading2' }),
    ...issues.map((issue) => paragraph(run('•\t') + run(`${issue.title} (#${issue.number})`), { style: 'Bullet' }))
  ];
  issues.forEach((issue) => {
    parts.push(pageBreak);
    parts.push(paragraph(run(issue.title), { style: 'Heading1' }));
    parts.push(paragraph(run(`Issue #${issue.number} · ${issue.state} · ${issue.labels.map((l) => l.name).join(', ')}`, '<w:color w:val="666666"/>')));
    parts.push(paragraph(hyperlink(rels, issue.html_url, issue.html_url)));
    sections(issue.body).forEach(({ heading, text }) => {
      if (heading) parts.push(paragraph(run(heading), { style: 'Heading2' }));
      parts.push(markdownBlocks(text));
    });
    const comments = commentsByIssue[issue.number] || [];
    if (comments.length) {
      parts.push(paragraph(run('Discussion'), { style: 'Heading2' }));
      comments.forEach((comment) => {
        parts.push(paragraph(run(`${comment.user.login}, ${comment.created_at.slice(0, 10)}`, '<w:b/>')));
        parts.push(markdownBlocks(comment.body || ''));
      });
    }
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join('')}</Relationships>`;

  const style = (id, name, { based = 'Normal', p = '', r = '', type = 'paragraph' } = {}) => `<w:style w:type="${type}"${id === 'Normal' ? ' w:default="1"' : ''} w:styleId="${id}"><w:name w:val="${name}"/>${based ? `<w:basedOn w:val="${based}"/>` : ''}<w:qFormat/>${p ? `<w:pPr>${p}</w:pPr>` : ''}${r ? `<w:rPr>${r}</w:rPr>` : ''}</w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${
    style('Normal', 'Normal', { based: '' })}${
    style('Title', 'Title', { p: '<w:spacing w:after="240"/>', r: '<w:b/><w:color w:val="0F5F57"/><w:sz w:val="44"/>' })}${
    style('Heading1', 'heading 1', { p: '<w:keepNext/><w:spacing w:before="0" w:after="120"/><w:outlineLvl w:val="0"/>', r: '<w:b/><w:color w:val="0F5F57"/><w:sz w:val="32"/>' })}${
    style('Heading2', 'heading 2', { p: '<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>', r: '<w:b/><w:color w:val="D9583B"/><w:sz w:val="24"/>' })}${
    style('Bullet', 'List Bullet', { p: '<w:spacing w:after="60"/><w:ind w:left="360" w:hanging="360"/><w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs>' })}${
    style('Quote', 'Quote', { p: '<w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="D9583B"/></w:pBdr>', r: '<w:i/><w:color w:val="444444"/>' })}${
    style('Code', 'Code', { p: '<w:spacing w:after="0"/><w:shd w:val="clear" w:color="auto" w:fill="EEF2EE"/>' })}${
    style('Hyperlink', 'Hyperlink', { type: 'character', based: '', r: '<w:color w:val="0563C1"/><w:u w:val="single"/>' })}</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  return zip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['word/document.xml', documentXml],
    ['word/_rels/document.xml.rels', documentRels],
    ['word/styles.xml', styles]
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
