(function () {
  const root = document.documentElement;
  const btn = document.getElementById('theme-toggle');
  const textSpan = btn ? btn.querySelector('.theme-toggle-text') : null;

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    if (textSpan) textSpan.textContent = t === 'dark' ? 'Dark' : 'Light';
  }

  // Initial theme: user preference stored, or system preference, or dark
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored);
  } else if (window.matchMedia &&
             window.matchMedia('(prefers-color-scheme: light)').matches) {
    applyTheme('light');
  } else {
    applyTheme('dark');
  }

  if (btn) {
    btn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('theme', next);
    });
  }
})();
