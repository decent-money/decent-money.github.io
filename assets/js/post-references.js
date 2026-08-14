(() => {
  const article = document.querySelector('.post-page .site-main .container');
  if (!article) return;

  const externalLinks = Array.from(article.querySelectorAll('a[href]')).filter(link => {
    if (link.closest('.post-toc, .toc-heading-nav, .post-references')) return false;
    if (link.hasAttribute('data-no-reference')) return false;

    try {
      const url = new URL(link.href, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin;
    } catch (_) {
      return false;
    }
  });

  if (!externalLinks.length) return;

  const references = document.createElement('section');
  references.className = 'post-references';
  references.setAttribute('aria-labelledby', 'references');

  const heading = document.createElement('h2');
  heading.id = 'references';
  heading.textContent = 'References';

  const list = document.createElement('ol');
  list.className = 'post-references-list';

  externalLinks.forEach((link, index) => {
    const number = index + 1;
    const citationId = `citation-${number}`;
    const referenceId = `reference-${number}`;
    const url = new URL(link.href, window.location.href);

    const citation = document.createElement('sup');
    citation.id = citationId;
    citation.className = 'post-citation';

    const citationLink = document.createElement('a');
    citationLink.href = `#${referenceId}`;
    citationLink.textContent = `[${number}]`;
    citationLink.setAttribute('aria-label', `Go to reference ${number}`);
    citation.append(citationLink);
    link.after(citation);

    const item = document.createElement('li');
    item.id = referenceId;

    const source = document.createElement('a');
    source.href = url.href;
    source.textContent = link.textContent.trim() || url.hostname;
    if (link.target) source.target = link.target;
    if (link.rel) source.rel = link.rel;

    const host = document.createElement('span');
    host.className = 'post-reference-host';
    host.textContent = ` — ${url.hostname.replace(/^www\./, '')}`;

    const backlink = document.createElement('a');
    backlink.className = 'post-reference-backlink';
    backlink.href = `#${citationId}`;
    backlink.textContent = '↩';
    backlink.setAttribute('aria-label', `Return to citation ${number}`);
    backlink.title = `Return to citation ${number}`;

    item.append(source, host, ' ', backlink);
    list.append(item);
  });

  references.append(heading, list);
  article.append(references);
})();
