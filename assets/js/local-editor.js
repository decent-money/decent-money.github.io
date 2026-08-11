(() => {
  const configElement = document.getElementById('local-editor-config');
  const article = document.querySelector('.post-page .site-main .container');
  if (!configElement || !article) return;

  let config;
  try {
    config = JSON.parse(configElement.dataset.config);
  } catch (_) {
    return;
  }

  const normalize = value => value
    .normalize('NFKD')
    .replace(/\s+/g, ' ')
    .trim();

  const markdownText = (markdown, kind) => {
    let value = markdown.trim();
    if (kind === 'heading') value = value.replace(/^#{1,6}\s+/, '').replace(/\s+#+$/, '');
    if (kind === 'list-item') value = value.replace(/^\s*(?:[-*+] |\d+[.)] )/, '');
    if (kind === 'quote') value = value.replace(/^\s*>\s?/, '');
    return normalize(value
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, '$1')
      .replace(/[`*_~]/g, '')
      .replace(/<[^>]+>/g, ''));
  };

  const visibleText = element => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.heading-anchor, .toc-jump').forEach(control => control.remove());
    return normalize(clone.textContent || '');
  };

  const candidates = Array.from(article.querySelectorAll(
    ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > p, ' +
    ':scope > ul > li, :scope > ol > li, :scope > blockquote > p'
  )).filter(element => !element.closest('.post-toc'));

  const headers = {
    'Content-Type': 'application/json',
    'X-Local-Editor-Token': config.token,
  };

  const notice = document.createElement('div');
  notice.className = 'local-editor-notice';
  notice.innerHTML = '<strong>Local editing</strong><span>Click text to edit · Enter saves · Shift+Enter adds a line · Esc cancels</span>';
  document.body.append(notice);

  const toast = message => {
    const element = document.createElement('div');
    element.className = 'local-editor-toast';
    element.textContent = message;
    document.body.append(element);
    setTimeout(() => element.remove(), 3500);
  };

  const edit = (element, block) => {
    if (article.querySelector('.local-editor-input')) return;
    const input = document.createElement('textarea');
    input.className = 'local-editor-input';
    input.value = block.markdown;
    input.rows = Math.max(2, Math.min(14, block.markdown.split('\n').length + 1));
    element.classList.add('local-editor-active');
    element.after(input);
    element.hidden = true;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const cancel = () => {
      element.hidden = false;
      element.classList.remove('local-editor-active');
      input.remove();
    };

    const save = async () => {
      input.disabled = true;
      input.classList.add('is-saving');
      try {
        const response = await fetch('/__editor/save', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source: config.source,
            index: block.index,
            revision: block.revision,
            markdown: input.value,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message || 'Save failed');
        toast(result.message || 'Saved');
        window.location.reload();
      } catch (error) {
        input.disabled = false;
        input.classList.remove('is-saving');
        toast(error.message);
        input.focus();
      }
    };

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        save();
      }
    });
  };

  fetch(`/__editor/blocks?source=${encodeURIComponent(config.source)}`, { headers })
    .then(response => response.json().then(data => ({ response, data })))
    .then(({ response, data }) => {
      if (!response.ok) throw new Error(data.error || 'Could not load Markdown blocks');
      const unused = new Set(candidates);
      data.blocks.forEach(block => {
        const expected = markdownText(block.markdown, block.kind);
        const element = candidates.find(candidate =>
          unused.has(candidate) && visibleText(candidate) === expected
        );
        if (!element) return;
        unused.delete(element);
        element.classList.add('local-editor-block');
        element.title = 'Click to edit this Markdown block';
        element.addEventListener('click', event => {
          if (event.target.closest('.heading-anchor, .toc-jump')) return;
          event.preventDefault();
          edit(element, block);
        });
      });
    })
    .catch(error => toast(error.message));
})();
