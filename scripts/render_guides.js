#!/usr/bin/env node
/** Render the Markdown OSM/POTA guides as dependency-free static HTML. */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const OUTPUT = path.join(ROOT, 'help');

const PAGES = {
  'adding-pota-reference-to-osm-es.md': ['es', 'Añadir una referencia POTA a OpenStreetMap', 'Español', 'Abrir iD cerca de este parque'],
  'adding-pota-reference-to-osm-en.md': ['en', 'Add a POTA reference to OpenStreetMap', 'English', 'Open iD near this park'],
  'adding-pota-reference-to-osm-de.md': ['de', 'Eine POTA-Referenz zu OpenStreetMap hinzufügen', 'Deutsch', 'iD in der Nähe dieses Parks öffnen'],
  'adding-pota-reference-to-osm-it.md': ['it', 'Aggiungere un riferimento POTA a OpenStreetMap', 'Italiano', 'Apri iD vicino a questo parco'],
  'adding-pota-reference-to-osm-fr.md': ['fr', 'Ajouter une référence POTA à OpenStreetMap', 'Français', 'Ouvrir iD près de ce site'],
};

const LANGUAGE_FILES = Object.fromEntries(
  Object.entries(PAGES).map(([filename, details]) => [filename, details[0]]),
);

function escapeHtml(value, quote = false) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': quote ? '&quot;' : '"',
    "'": quote ? '&#39;' : "'",
  }[character]));
}

function inline(markdown) {
  const codeValues = [];
  let text = markdown.replace(/`([^`]+)`/g, (_, value) => {
    codeValues.push(value);
    return `\u0000CODE${codeValues.length - 1}\u0000`;
  });
  text = escapeHtml(text);

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, source) => {
    const imageSource = source.startsWith('images/') ? `../docs/${source}` : source;
    return `<img src="${escapeHtml(imageSource, true)}" alt="${escapeHtml(alt, true)}" loading="lazy">`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, originalHref) => {
    let href = originalHref;
    let guideCode = '';
    const sourceName = path.basename(href);
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_FILES, sourceName)) {
      guideCode = ` data-guide-code="${LANGUAGE_FILES[sourceName]}"`;
      href = `/help/${LANGUAGE_FILES[sourceName]}.html`;
    } else if (href.endsWith('.md') && path.basename(href) === 'adding-pota-reference-to-osm.md') {
      href = '/help/index.html';
    }
    const external = href.startsWith('https://') || href.startsWith('http://');
    const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escapeHtml(href, true)}"${target}${guideCode}>${label}</a>`;
  });

  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  codeValues.forEach((value, index) => {
    text = text.replace(`\u0000CODE${index}\u0000`, `<code>${escapeHtml(value, true)}</code>`);
  });
  return text;
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const output = [];
  const paragraph = [];
  let listKind = null;
  let listItemOpen = false;
  let pendingBlank = false;

  function flushParagraph() {
    if (paragraph.length) {
      const text = paragraph.map((part) => part.trim()).join(' ');
      const tagOnly = text.match(/^`([^`]+)`$/);
      output.push(tagOnly
        ? `<div class="tag-example"><code>${escapeHtml(tagOnly[1], true)}</code></div>`
        : `<p>${inline(text)}</p>`);
      paragraph.length = 0;
    }
  }

  function closeList() {
    if (listItemOpen) output.push('</li>');
    if (listKind) output.push(`</${listKind}>`);
    listKind = null;
    listItemOpen = false;
    pendingBlank = false;
  }

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const stripped = line.trim();

    if (!stripped) {
      flushParagraph();
      if (listKind) pendingBlank = true;
      index += 1;
      continue;
    }

    const heading = stripped.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (stripped === '---' || stripped === '***') {
      flushParagraph();
      closeList();
      output.push('<hr>');
      index += 1;
      continue;
    }

    if (stripped.startsWith('> ')) {
      flushParagraph();
      closeList();
      const quote = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2));
        index += 1;
      }
      output.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    const ordered = stripped.match(/^\d+\.\s+(.+)$/);
    const unordered = stripped.match(/^[-*+]\s+(.+)$/);
    if (ordered || unordered) {
      flushParagraph();
      const kind = ordered ? 'ol' : 'ul';
      if (listKind !== kind) {
        closeList();
        listKind = kind;
        output.push(`<${kind}>`);
      } else if (listItemOpen) {
        output.push('</li>');
      }
      output.push(`<li>${inline((ordered || unordered)[1])}`);
      listItemOpen = true;
      pendingBlank = false;
      index += 1;
      continue;
    }

    if (listKind && listItemOpen && pendingBlank && /^\s/.test(line)) {
      const tagOnly = stripped.match(/^`([^`]+)`$/);
      output.push(tagOnly
        ? `<div class="tag-example"><code>${escapeHtml(tagOnly[1], true)}</code></div>`
        : `<p>${inline(stripped)}</p>`);
      pendingBlank = false;
      index += 1;
      continue;
    }

    if (listKind) closeList();
    if (stripped.startsWith('![') && /^!\[[^\]]*\]\([^)]+\)$/.test(stripped)) {
      flushParagraph();
      output.push(`<figure>${inline(stripped)}</figure>`);
    } else {
      paragraph.push(stripped);
    }
    index += 1;
  }

  flushParagraph();
  closeList();
  return output.join('\n');
}

function renderPage(markdownPath, language, title, _languageLabel, editorLabel, indexPage = false) {
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  const content = renderMarkdown(markdown);
  const editorLink = indexPage ? '' : (
    `<a class="editor-link" data-open-editor href="https://www.openstreetmap.org/edit?editor=id&locale=${language}" `
    + `target="_blank" rel="noopener noreferrer" hidden>${escapeHtml(editorLabel)}</a>`
  );
  const editorBlock = editorLink ? `    ${editorLink}\n` : '';
  const homeHref = indexPage ? '/' : '/help/index.html';
  const homeLabel = indexPage ? 'POTA map' : 'All guide languages';

  return `<!doctype html>
<html lang="${escapeHtml(language, true)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(title, true)}">
  <title>${escapeHtml(title)} · POTA / OpenStreetMap</title>
  <link rel="stylesheet" href="/help/guides.css">
  <script src="/help/guides.js" defer></script>
</head>
<body class="guide-page${indexPage ? ' guide-index' : ' guide-language'}">
  <header class="page-header">
    <a class="brand" href="/">EA7KLK POTA Map</a>
    <a class="header-link" href="${homeHref}">${homeLabel}</a>
  </header>
  <main class="page-shell">
    <div class="eyebrow">Parks on the Air · OpenStreetMap</div>
${editorBlock}
    <article class="guide-content">
${content}
    </article>
    <p class="page-footer"><a href="/">Return to the POTA map</a></p>
  </main>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const indexSource = path.join(DOCS, 'adding-pota-reference-to-osm.md');
  fs.writeFileSync(
    path.join(OUTPUT, 'index.html'),
    renderPage(indexSource, 'en', 'Add a POTA reference to OpenStreetMap', 'English', '', true),
    'utf8',
  );
  for (const [filename, [language, title, label, editorLabel]] of Object.entries(PAGES)) {
    fs.writeFileSync(
      path.join(OUTPUT, `${language}.html`),
      renderPage(path.join(DOCS, filename), language, title, label, editorLabel),
      'utf8',
    );
  }
}

main();
