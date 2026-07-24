/**
 * setup-progress.js — Popup de progreso para la pantalla de configuración
 */
export const SetupProgress = (() => {
  let _steps = [];
  let _doneSet = new Set();

  function show(title, subtitle, steps) {
    _steps  = steps || [];
    _doneSet = new Set();

    _setText('sp-title', title);
    _setText('sp-sub',   subtitle || '');
    _setProgress(0);
    _renderSteps();

    document.getElementById('setup-progress')?.classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('btn-cancel-load')?.focus();
    }, 50);
  }

  function hide() {
    document.getElementById('setup-progress')?.classList.add('hidden');
    _steps  = [];
    _doneSet = new Set();
  }

  // Marca un paso como activo (el anterior pasa a "hecho")
  function step(id) {
    const idx = _steps.findIndex(s => s.id === id);
    if (idx < 0) return;
    // Marcar todos los anteriores como done
    for (let i = 0; i < idx; i++) _doneSet.add(_steps[i].id);
    _renderSteps(id);
  }

  // Actualiza barra de progreso (0–100)
  function progress(pct) {
    _setProgress(Math.min(100, Math.max(0, pct)));
  }

  // ── internals ─────────────────────────────────────
  function _renderSteps(activeId) {
    const ul = document.getElementById('sp-steps');
    if (!ul) return;
    ul.replaceChildren();
    const fragment = document.createDocumentFragment();
    _steps.forEach(s => {
      const isDone   = _doneSet.has(s.id);
      const isActive = s.id === activeId;
      const cls = isDone ? 'done' : isActive ? 'active' : '';
      const icon = isDone ? 'check' : isActive ? 'chevron_right' : 'radio_button_unchecked';

      const li = document.createElement('li');
      li.className = `sp-step ${cls}`;
      const iconEl = document.createElement('span');
      iconEl.className = 'sp-step-icon material-symbols-rounded';
      iconEl.textContent = icon;
      li.appendChild(iconEl);
      li.appendChild(document.createTextNode(s.label || ''));
      fragment.appendChild(li);
    });
    ul.appendChild(fragment);
  }

  function _setProgress(pct) {
    const fill = document.getElementById('sp-fill');
    const label = document.getElementById('sp-pct');
    if (fill)  fill.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  return { show, hide, step, progress };
})();
