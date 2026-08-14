(() => {
  const script = document.currentScript;
  const article = document.querySelector('.post-page .site-main .container');
  if (!article) return;

  const headings = Array.from(article.querySelectorAll('h2'));
  if (!headings.length) return;

  const usedIds = new Set(
    Array.from(document.querySelectorAll('[id]'), element => element.id)
  );

  const slugify = text => {
    const base = text
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';

    let slug = base;
    let suffix = 2;
    while (usedIds.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(slug);
    return slug;
  };

  const sections = headings.map(heading => {
    const title = heading.textContent.trim();
    heading.id = heading.id || slugify(title);
    usedIds.add(heading.id);
    heading.classList.add('toc-heading');

    const anchor = document.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = `#${heading.id}`;
    anchor.textContent = '#';
    anchor.setAttribute('aria-label', `Link to ${title}`);
    anchor.title = `Link to ${title}`;
    heading.append(anchor);

    return { title, id: heading.id, heading };
  });

  sections.forEach((section, index) => {
    const jumpNav = document.createElement('span');
    jumpNav.className = 'toc-heading-nav';

    const contentsJump = document.createElement('a');
    contentsJump.className = 'toc-jump';
    contentsJump.href = '#table-of-contents';
    contentsJump.textContent = '↑ contents';
    contentsJump.setAttribute(
      'aria-label',
      `Return to the table of contents from ${section.title}`
    );
    jumpNav.append(contentsJump);

    const nextSection = sections[index + 1];
    if (nextSection) {
      const nextJump = document.createElement('a');
      nextJump.className = 'toc-jump';
      nextJump.href = `#${nextSection.id}`;
      nextJump.textContent = '↓ next section';
      nextJump.setAttribute('aria-label', `Jump to ${nextSection.title}`);
      jumpNav.append(nextJump);
    }

    section.heading.append(jumpNav);
  });

  const nav = document.createElement('nav');
  nav.id = 'table-of-contents';
  nav.className = 'post-toc';
  nav.setAttribute('aria-label', 'Table of contents');

  const title = document.createElement('p');
  title.className = 'post-toc-title';
  title.textContent = script?.dataset.tocTitle || 'Contents';

  const columns = document.createElement('div');
  columns.className = 'post-toc-columns';
  const splitAt = Math.ceil(sections.length / 2);

  const makeList = (items, start) => {
    const list = document.createElement('ol');
    list.className = 'post-toc-list';
    if (start > 1) list.start = start;
    items.forEach(section => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${section.id}`;
      link.textContent = section.title;
      item.append(link);
      list.append(item);
    });
    return list;
  };

  columns.append(
    makeList(sections.slice(0, splitAt), 1),
    makeList(sections.slice(splitAt), splitAt + 1)
  );

  nav.append(title, columns);
  headings[0].before(nav);
})();
