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
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();

  const words = value => normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const matchScore = (expected, actual) => {
    if (expected === actual) return 1;
    const expectedWords = words(expected);
    const actualWords = words(actual);
    if (!expectedWords.length || !actualWords.length) return 0;

    const shorter = Math.min(expectedWords.length, actualWords.length);
    let prefix = 0;
    while (prefix < shorter && expectedWords[prefix] === actualWords[prefix]) prefix += 1;

    const expectedCounts = new Map();
    expectedWords.forEach(word => expectedCounts.set(word, (expectedCounts.get(word) || 0) + 1));
    let shared = 0;
    actualWords.forEach(word => {
      const count = expectedCounts.get(word) || 0;
      if (count > 0) {
        shared += 1;
        expectedCounts.set(word, count - 1);
      }
    });

    const overlap = (2 * shared) / (expectedWords.length + actualWords.length);
    const prefixScore = prefix / shorter;
    return Math.max(overlap, prefixScore * 0.95);
  };

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
    clone.querySelectorAll('.heading-anchor, .toc-jump, .post-citation').forEach(control => control.remove());
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
  const pendingBlockKey = `local-editor-next:${config.source}`;
  const emptyBlockPlaceholder = '\u200b';
  const reviewKey = block => `local-editor-reviewed:${config.source}:${block.revision}`;
  let activeEditor = null;
  let mappedBlocks = [];

  const notice = document.createElement('div');
  notice.className = 'local-editor-notice';
  notice.innerHTML = `
    <strong>Local editing</strong>
    <span>Click text to edit · Enter saves · Shift+Enter adds a line · Esc cancels</span>
    <span class="local-editor-review-progress">
      <span class="local-editor-review-count">0/0</span>
      <span class="local-editor-review-track" role="progressbar" aria-label="Proofreading progress" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
        <span class="local-editor-review-fill"></span>
      </span>
      <button type="button" class="local-editor-review-nav" data-direction="-1">prev</button>
      <button type="button" class="local-editor-review-nav" data-direction="1">next</button>
    </span>`;
  document.body.append(notice);

  const reviewCount = notice.querySelector('.local-editor-review-count');
  const reviewTrack = notice.querySelector('.local-editor-review-track');
  const reviewFill = notice.querySelector('.local-editor-review-fill');
  const reviewNavButtons = Array.from(notice.querySelectorAll('.local-editor-review-nav'));
  let lastReviewTarget = null;
  const updateReviewProgress = () => {
    const total = mappedBlocks.length;
    const approved = mappedBlocks.reduce(
      (count, item) => count + (localStorage.getItem(reviewKey(item.block)) === 'true' ? 1 : 0),
      0
    );
    const percentage = total ? (approved / total) * 100 : 0;
    reviewCount.textContent = `${approved}/${total}`;
    reviewFill.style.width = `${percentage}%`;
    reviewTrack.setAttribute('aria-valuemax', String(total));
    reviewTrack.setAttribute('aria-valuenow', String(approved));
    reviewNavButtons.forEach(button => {
      button.disabled = total === 0 || approved === total;
    });
  };

  const toast = message => {
    const element = document.createElement('div');
    element.className = 'local-editor-toast';
    element.textContent = message;
    document.body.append(element);
    setTimeout(() => element.remove(), 3500);
  };

  const navigateToUnreviewed = direction => {
    if (!mappedBlocks.length) return;
    const unreviewed = item => localStorage.getItem(reviewKey(item.block)) !== 'true';
    if (!mappedBlocks.some(unreviewed)) {
      toast('Every text block is marked final');
      return;
    }

    let currentIndex = lastReviewTarget;
    if (!Number.isInteger(currentIndex) && activeEditor) {
      currentIndex = mappedBlocks.findIndex(item => item.block.index === activeEditor.block.index);
    }
    if (!Number.isInteger(currentIndex) || currentIndex < 0) {
      const viewportCentre = window.innerHeight / 2;
      currentIndex = mappedBlocks.reduce((nearest, item, index) => {
        const rect = item.element.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - viewportCentre);
        return distance < nearest.distance ? { index, distance } : nearest;
      }, { index: 0, distance: Infinity }).index;
    }

    let targetIndex = currentIndex;
    for (let offset = 1; offset <= mappedBlocks.length; offset += 1) {
      const candidate = (currentIndex + direction * offset + mappedBlocks.length) % mappedBlocks.length;
      if (unreviewed(mappedBlocks[candidate])) {
        targetIndex = candidate;
        break;
      }
    }

    lastReviewTarget = targetIndex;
    const target = mappedBlocks[targetIndex].element;
    article.querySelectorAll('.is-review-target').forEach(element => {
      element.classList.remove('is-review-target');
    });
    target.classList.add('is-review-target');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => target.classList.remove('is-review-target'), 1200);
  };

  reviewNavButtons.forEach(button => {
    button.addEventListener('click', () => {
      navigateToUnreviewed(Number.parseInt(button.dataset.direction, 10));
    });
  });

  const edit = (element, block) => {
    if (activeEditor) return;
    const renderedHeight = Math.ceil(element.getBoundingClientRect().height);
    const input = document.createElement('textarea');
    input.className = 'local-editor-input';
    const isNewBlock = block.markdown === emptyBlockPlaceholder;
    input.value = isNewBlock ? '' : block.markdown;
    if (isNewBlock) {
      input.classList.add('is-new-block');
      input.rows = 5;
    }
    element.classList.add('local-editor-active');
    element.after(input);
    element.hidden = true;

    const fitInput = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.max(isNewBlock ? 0 : renderedHeight, input.scrollHeight)}px`;
    };
    requestAnimationFrame(() => {
      fitInput();
      requestAnimationFrame(fitInput);
    });
    input.addEventListener('input', fitInput);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const cancel = () => {
      element.hidden = false;
      element.classList.remove('local-editor-active');
      input.remove();
      activeEditor = null;
    };

    const save = async nextBlockIndex => {
      input.disabled = true;
      input.classList.add('is-saving');
      if (Number.isInteger(nextBlockIndex)) {
        sessionStorage.setItem(pendingBlockKey, String(nextBlockIndex));
      }
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
        sessionStorage.removeItem(pendingBlockKey);
        input.disabled = false;
        input.classList.remove('is-saving');
        toast(error.message);
        input.focus();
      }
    };

    activeEditor = {
      block,
      cancel,
      isDirty: () => input.value !== (isNewBlock ? '' : block.markdown),
      save,
    };

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        save();
      }
    });
  };

  const activate = (element, block) => {
    if (!activeEditor) {
      edit(element, block);
      return;
    }
    if (activeEditor.block.index === block.index) return;

    if (!activeEditor.isDirty()) {
      activeEditor.cancel();
      edit(element, block);
      return;
    }

    const shouldSave = window.confirm(
      'This block has unsaved changes.\n\nPress OK to save them, or Cancel to discard them.'
    );
    if (shouldSave) {
      activeEditor.save(block.index);
    } else {
      activeEditor.cancel();
      edit(element, block);
    }
  };

  const deleteBlock = async (element, block) => {
    if (activeEditor) activeEditor.cancel();
    element.classList.add('is-deleting');
    try {
      const response = await fetch('/__editor/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: config.source,
          index: block.index,
          revision: block.revision,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || 'Delete failed');
      window.location.reload();
    } catch (error) {
      element.classList.remove('is-deleting');
      toast(error.message);
    }
  };

  const mutateBlock = async (element, block, endpoint, extra = {}) => {
    if (activeEditor) {
      if (activeEditor.isDirty()) {
        toast('Save or cancel the active edit before rearranging blocks');
        return;
      }
      activeEditor.cancel();
    }

    element.classList.add('is-mutating');
    try {
      const response = await fetch(`/__editor/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: config.source,
          index: block.index,
          revision: block.revision,
          ...extra,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || 'Block operation failed');
      if (endpoint === 'insert' && Number.isInteger(result.index)) {
        sessionStorage.setItem(pendingBlockKey, String(result.index));
      }
      window.location.reload();
    } catch (error) {
      element.classList.remove('is-mutating');
      toast(error.message);
    }
  };

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !activeEditor) return;
    event.preventDefault();
    activeEditor.cancel();
  }, true);

  fetch(`/__editor/blocks?source=${encodeURIComponent(config.source)}`, { headers })
    .then(response => response.json().then(data => ({ response, data })))
    .then(({ response, data }) => {
      if (!response.ok) throw new Error(data.error || 'Could not load Markdown blocks');
      let candidateStart = 0;
      data.blocks.forEach(block => {
        const expected = markdownText(block.markdown, block.kind);
        let bestIndex = -1;
        let bestScore = 0;
        for (let index = candidateStart; index < candidates.length; index += 1) {
          const score = matchScore(expected, visibleText(candidates[index]));
          if (score > bestScore) {
            bestIndex = index;
            bestScore = score;
          }
          if (score === 1) break;
        }
        if (bestIndex < 0 || bestScore < 0.78) return;
        const element = candidates[bestIndex];
        candidateStart = bestIndex + 1;
        mappedBlocks.push({ element, block });
        element.classList.add('local-editor-block');
        element.title = 'Click to edit this Markdown block';

      });

      mappedBlocks.forEach(({ element, block }, mappedIndex) => {
        const makeControl = (className, text, label, action) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `local-editor-control ${className}`;
          button.textContent = text;
          button.title = label;
          button.setAttribute('aria-label', label);
          button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            action();
          });
          element.append(button);
          return button;
        };

        const previous = mappedBlocks[mappedIndex - 1]?.block;
        const next = mappedBlocks[mappedIndex + 1]?.block;
        if (previous) {
          makeControl('local-editor-move-up', '↑', 'Move this block up', () => {
            mutateBlock(element, block, 'move', {
              targetIndex: previous.index,
              targetRevision: previous.revision,
            });
          });
        }
        if (next) {
          makeControl('local-editor-move-down', '↓', 'Move this block down', () => {
            mutateBlock(element, block, 'move', {
              targetIndex: next.index,
              targetRevision: next.revision,
            });
          });
        }
        makeControl('local-editor-insert', '+', 'Add a text block below', () => {
          mutateBlock(element, block, 'insert');
        });

        let reviewed = localStorage.getItem(reviewKey(block)) === 'true';
        let reviewButton;
        const renderReviewState = () => {
          reviewButton.textContent = reviewed ? '✓' : '−';
          reviewButton.setAttribute('aria-pressed', String(reviewed));
          reviewButton.title = reviewed ? 'Mark this block as not final' : 'Mark this block as final';
          reviewButton.setAttribute('aria-label', reviewButton.title);
        };
        reviewButton = makeControl(
          'local-editor-review',
          '−',
          'Mark this block as final',
          () => {
            reviewed = !reviewed;
            if (reviewed) {
              localStorage.setItem(reviewKey(block), 'true');
            } else {
              localStorage.removeItem(reviewKey(block));
            }
            renderReviewState();
            updateReviewProgress();
          }
        );
        renderReviewState();

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'local-editor-delete';
        deleteButton.textContent = '×';
        deleteButton.title = 'Delete this Markdown block';
        deleteButton.setAttribute('aria-label', 'Delete this Markdown block');
        deleteButton.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          deleteBlock(element, block);
        });
        element.append(deleteButton);
        element.addEventListener('click', event => {
          if (event.target.closest('.heading-anchor, .toc-jump, .local-editor-control, .local-editor-delete')) return;
          event.preventDefault();
          activate(element, block);
        });
      });

      updateReviewProgress();

      const pendingBlock = Number.parseInt(sessionStorage.getItem(pendingBlockKey), 10);
      sessionStorage.removeItem(pendingBlockKey);
      if (Number.isInteger(pendingBlock)) {
        const target = mappedBlocks.find(item => item.block.index === pendingBlock);
        if (target) {
          target.element.scrollIntoView({ block: 'center' });
          edit(target.element, target.block);
        }
      }
    })
    .catch(error => toast(error.message));
})();
