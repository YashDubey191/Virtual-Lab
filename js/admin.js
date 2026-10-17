/* ============================================================
   admin.js — teacher portal.

   Loaded AFTER student.js so it can reuse VL.app helpers and
   the router. It registers four routes under /admin/*, each
   wrapped in VL.guardAdmin (defined in student.js), so a
   student who types the URL is redirected with a friendly
   toast and never sees admin chrome.

   Also exposes admin-only items into the ⌘K palette and a
   couple of shared helpers on VL.admin for future use.
   ============================================================ */

(function () {
  'use strict';

  const {
    $, $$, h, fmt, clamp, escapeHtml, icons,
    toast, router, theme, store, bus, palette,
    observeReveals, attachSpecular, countUp, ready
  } = VL;
  const app = VL.app;

  /* ============================================================
     1.  Small styles specific to admin (switch, drag, chips).
     Injected once so css/screens.css stays untouched.
     ============================================================ */
  function ensureAdminStyles() {
    if (document.getElementById('vl-admin-styles')) return;
    const st = document.createElement('style');
    st.id = 'vl-admin-styles';
    st.textContent = `
      /* Publish switch */
      .vl-switch {
        position: relative;
        width: 46px; height: 28px;
        flex: none;
        border-radius: 999px;
        background: var(--fill-2);
        border: 0;
        padding: 0;
        cursor: pointer;
        transition: background .28s var(--ease-out);
      }
      .vl-switch:focus-visible { outline: none; box-shadow: var(--sh-focus); }
      .vl-switch__thumb {
        position: absolute;
        top: 2px; left: 2px;
        width: 24px; height: 24px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 3px rgba(15,20,40,.20), 0 4px 10px rgba(15,20,40,.10);
        transition: transform .32s var(--ease-spring);
      }
      .vl-switch[aria-checked="true"] { background: var(--green); }
      .vl-switch[aria-checked="true"] .vl-switch__thumb { transform: translateX(18px); }

      /* Reorderable experiment row */
      .exp-row {
        display: grid;
        grid-template-columns: 28px 1fr auto;
        align-items: center;
        gap: 12px;
        padding: 12px 8px;
        border-bottom: 1px solid var(--line);
        transition: background .18s var(--ease-out);
      }
      .exp-row:last-child { border-bottom: 0; }
      .exp-row:hover { background: var(--fill-1); border-radius: 12px; }
      .exp-row.dragging { opacity: .35; }
      .exp-row.drop-target { box-shadow: inset 0 2px 0 var(--blue); }
      .exp-row__handle {
        display: inline-grid;
        place-items: center;
        width: 28px; height: 28px;
        border-radius: 8px;
        color: var(--ink-4);
        cursor: grab;
        touch-action: none;
      }
      .exp-row__handle:active { cursor: grabbing; }
      .exp-row__title { font-weight: 500; font-size: 15px; line-height: 20px; }
      .exp-row__meta { font-size: 13px; color: var(--ink-3); margin-top: 2px; }
      .exp-row__meta .dot { color: var(--ink-4); margin: 0 6px; }
      .exp-row__right { display: flex; align-items: center; gap: 10px; }

      /* Sparkline */
      .spark { display: block; width: 100%; height: 72px; }

      /* Submission queue rows */
      .sub-queue-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 14px;
        padding: 14px 10px;
        border-bottom: 1px solid var(--line);
        text-decoration: none;
        color: inherit;
        transition: background .18s var(--ease-out);
      }
      .sub-queue-row:last-child { border-bottom: 0; }
      .sub-queue-row:hover { background: var(--fill-1); border-radius: 12px; text-decoration: none; }
      .sub-queue-row .who { font-weight: 500; font-size: 15px; }
      .sub-queue-row .meta { font-size: 13px; color: var(--ink-3); margin-top: 2px; }

      /* Students table */
      .students-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 14px;
      }
      .students-table th, .students-table td {
        text-align: left;
        padding: 12px 10px;
        border-bottom: 1px solid var(--line);
        vertical-align: middle;
      }
      .students-table th {
        font-size: 12px;
        letter-spacing: .04em;
        text-transform: uppercase;
        color: var(--ink-4);
        font-weight: 500;
      }
      .students-table tbody tr { cursor: pointer; }
      .students-table tbody tr:hover { background: var(--fill-1); }
      .students-table tbody tr:last-child td { border-bottom: 0; }
      .students-table .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .students-table .who b { font-weight: 500; }
      .students-table .who span { display: block; font-size: 12px; color: var(--ink-3); }

      /* Score slider */
      .score-slider { display: flex; align-items: center; gap: 14px; }
      .score-slider input[type="range"] { flex: 1; }
      .score-slider__value {
        min-width: 56px;
        text-align: right;
        font-size: 28px;
        font-weight: 600;
        letter-spacing: -.022em;
        font-variant-numeric: tabular-nums;
      }

      /* Needs-attention chip */
      .att-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 6px;
        border-bottom: 1px solid var(--line);
      }
      .att-row:last-child { border-bottom: 0; }
      .att-row .who { flex: 1; min-width: 0; }
      .att-row .who b { display: block; font-weight: 500; font-size: 14px; }
      .att-row .who span { font-size: 12px; color: var(--ink-3); }
      .att-row .since { font-size: 12px; color: var(--orange); font-weight: 500; }

      /* Small utility for editor rows */
      .quiz-item {
        padding: 12px;
        border-radius: 12px;
        background: var(--fill-1);
        border: 1px solid var(--line);
      }
      .quiz-item + .quiz-item { margin-top: 10px; }
      .quiz-item__opts { display: grid; gap: 6px; margin-top: 8px; }
      .quiz-item__opt {
        display: flex; align-items: center; gap: 8px;
      }
      .quiz-item__opt input[type="radio"] { accent-color: var(--blue); }
      .quiz-item__opt input[type="text"] { flex: 1; min-height: 36px; }
      .quiz-item__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    `;
    document.head.appendChild(st);
  }

  /* ============================================================
     2.  Data helpers
     ============================================================ */
  function allExperiments()  { return store.get('experiments', []) || []; }
  function allSubmissions()  { return store.get('submissions', []) || []; }
  function allStudents()     { return (store.get('users', []) || []).filter(u => u.role === 'student'); }

  function lastActiveFor(studentId) {
    const days = (store.get('studentDays', {}) || {})[studentId] || {};
    const keys = Object.keys(days).sort();
    const lastDay = keys.length ? new Date(keys[keys.length - 1]).getTime() : 0;
    const subs = allSubmissions().filter(s => s.studentId === studentId);
    const lastSub = subs.length ? Math.max.apply(null, subs.map(s => s.submittedAt || 0)) : 0;
    return Math.max(lastDay, lastSub);
  }

  function relativeDay(ts) {
    if (!ts) return 'never';
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 7) return d + ' days ago';
    if (d < 30) return Math.floor(d / 7) + ' week' + (d < 14 ? '' : 's') + ' ago';
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function averageScore(subs) {
    const graded = subs.filter(s => s.status === 'graded' && s.score != null);
    if (!graded.length) return 0;
    return graded.reduce((a, b) => a + b.score, 0) / graded.length;
  }

  /* A compact undo-aware toast. */
  function undoToast(message, onUndo, ms) {
    const el = toast.warn(message, { duration: ms || 5000 });
    const msgEl = el.querySelector('.toast__msg');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--sm';
    btn.style.cssText = 'margin-left:10px;min-height:26px;padding:0 10px;font-size:13px';
    btn.textContent = 'Undo';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onUndo();
      toast.dismiss(el);
      toast.success('Restored.');
    });
    msgEl.appendChild(btn);
    return el;
  }

  /* ============================================================
     3.  Drawer helper (glass side-drawer → bottom-sheet on mobile)
     ============================================================ */
  function openDrawer({ title, body, footer }) {
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.style.pointerEvents = 'none';

    const drawer = document.createElement('aside');
    drawer.className = 'drawer glass glass--refract';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', title);
    drawer.innerHTML = `
      <div class="modal__head">
        <div class="modal__title">${escapeHtml(title)}</div>
        <button class="icon-btn" type="button" data-close aria-label="Close">
          ${icons.svg('x', { size: 16 })}
        </button>
      </div>
      <div class="modal__body" data-body></div>
      <div class="modal__foot" data-foot></div>`;

    const bodyEl = drawer.querySelector('[data-body]');
    const footEl = drawer.querySelector('[data-foot]');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    if (typeof footer === 'string') footEl.innerHTML = footer;
    else if (footer) footEl.appendChild(footer);
    else footEl.remove();

    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    requestAnimationFrame(() => {
      scrim.style.pointerEvents = '';
      scrim.classList.add('open');
      drawer.classList.add('open');
    });

    const close = () => {
      scrim.classList.remove('open');
      drawer.classList.remove('open');
      setTimeout(() => { scrim.remove(); drawer.remove(); }, 320);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    scrim.addEventListener('click', close);
    drawer.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));

    setTimeout(() => drawer.querySelector('input, textarea, button')?.focus(), 60);
    return { drawer, close };
  }

  /* A compact sparkline for the dashboard. */
  function renderSpark(svg, points) {
    svg.innerHTML = '';
    if (!points.length) return;
    const W = 340, H = 72, pad = 6;
    const max = Math.max.apply(null, points.map(p => p.count).concat([1]));
    const min = 0;
    const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, attrs) => { const n = document.createElementNS(NS, t); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

    const coords = points.map((p, i) => [
      pad + i * step,
      H - pad - ((p.count - min) / (max - min || 1)) * (H - pad * 2)
    ]);
    const path = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
    const area = path + ' L' + (pad + (points.length - 1) * step).toFixed(1) + ' ' + (H - pad) + ' L' + pad + ' ' + (H - pad) + ' Z';

    const gradId = 'spark-grad-' + Math.random().toString(36).slice(2, 6);
    const defs = el('defs', {});
    const grad = el('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'var(--blue)', 'stop-opacity': '.28' }));
    grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'var(--blue)', 'stop-opacity': '0' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    svg.appendChild(el('path', { d: area, fill: 'url(#' + gradId + ')', stroke: 'none' }));
    svg.appendChild(el('path', { d: path, fill: 'none', stroke: 'var(--blue)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

    // Today's dot
    const last = coords[coords.length - 1];
    svg.appendChild(el('circle', { cx: last[0], cy: last[1], r: 4, fill: 'var(--blue)', stroke: '#fff', 'stroke-width': 2 }));
  }

  /* ============================================================
     4.  Dashboard
     ============================================================ */
  function dashboardView() {
    const students = allStudents();
    const experiments = allExperiments();
    const subs = allSubmissions();
    const pending = subs.filter(s => s.status === 'pending');
    const avg = averageScore(subs);

    // 7-day activity from store
    const activity = (store.get('activity', []) || []).slice(-7);

    // Needs attention — inactive for 5+ days.
    const cutoff = Date.now() - 5 * 86400000;
    const needsAttention = students.map(st => ({
      id: st.id, name: st.name, avatar: st.avatar, roll: st.roll,
      last: lastActiveFor(st.id)
    })).filter(x => !x.last || x.last < cutoff)
      .sort((a, b) => (a.last || 0) - (b.last || 0))
      .slice(0, 6);

    // Recent submissions
    const recent = subs.slice()
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
      .slice(0, 5);

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="greeting">
        <div>
          <h1>Admin</h1>
          <p>${students.length} student${students.length === 1 ? '' : 's'} · ${experiments.length} experiment${experiments.length === 1 ? '' : 's'} · ${pending.length} awaiting review</p>
        </div>
        <button class="btn" type="button" id="reset-demo">
          ${icons.svg('refresh', { size: 16 })}<span>Reset demo data</span>
        </button>
      </div>

      <div class="stat-row" data-stagger>
        <div class="stat fade-up">
          <div class="label">Students</div>
          <span class="value tnum" data-count="${students.length}">0</span>
          <div class="sub">${students.filter(s => lastActiveFor(s.id) > Date.now() - 86400000).length} active today</div>
        </div>
        <div class="stat fade-up">
          <div class="label">Experiments</div>
          <span class="value tnum" data-count="${experiments.length}">0</span>
          <div class="sub">${experiments.filter(e => e.published !== false).length} published</div>
        </div>
        <div class="stat fade-up">
          <div class="label">Pending reviews</div>
          <span class="value tnum" data-count="${pending.length}">0</span>
          <div class="sub">${pending.length === 0 ? 'all clear' : 'need your eyes'}</div>
        </div>
        <div class="stat fade-up">
          <div class="label">Average score</div>
          <span class="value tnum" data-count="${avg}" data-decimals="1">0</span>
          <div class="sub">across ${subs.filter(s => s.status === 'graded').length} graded</div>
        </div>
      </div>

      <div class="split split--wide" style="margin-top:24px">
        <div class="panel">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px">
            <span class="card__eyebrow" style="margin:0">Activity · last 7 days</span>
            <span style="font-size:13px;color:var(--ink-3)">
              ${activity.reduce((a, b) => a + b.count, 0)} submissions total
            </span>
          </div>
          <svg class="spark" viewBox="0 0 340 72" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--ink-4)">
            ${activity.map(a => `<span>${new Date(a.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>`).join('')}
          </div>
        </div>

        <div class="panel">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
            <span class="card__eyebrow" style="margin:0">Needs attention</span>
            <span style="font-size:13px;color:var(--ink-3)">inactive 5+ days</span>
          </div>
          ${needsAttention.length
            ? needsAttention.map(x => `
                <div class="att-row">
                  <span class="avatar" aria-hidden="true">${escapeHtml(x.avatar || '')}</span>
                  <span class="who">
                    <b>${escapeHtml(x.name)}</b>
                    <span>${escapeHtml(x.roll || '')}</span>
                  </span>
                  <span class="since">${relativeDay(x.last)}</span>
                </div>`).join('')
            : `<div class="empty-note">Everyone has been around this week.</div>`}
        </div>
      </div>

      <div class="section-head"><h2>Recent submissions</h2><a class="link" href="#/admin/submissions">See all</a></div>
      <div class="panel" data-stagger>
        ${recent.length ? recent.map(s => {
          const st = s.status === 'graded' ? 'graded'
                   : s.status === 'changes' ? 'changes' : 'submitted';
          const tone = st === 'graded' ? 'chip chip--green'
                     : st === 'changes' ? 'chip chip--red'
                     : 'chip chip--orange';
          const label = st === 'graded' ? 'Graded'
                      : st === 'changes' ? 'Changes asked' : 'Pending review';
          return `
            <a class="sub-queue-row fade-up" href="#/admin/submissions/${s.id}">
              <span class="status-dot status-dot--${st === 'graded' ? 'graded' : 'submitted'}" aria-hidden="true"></span>
              <span style="min-width:0">
                <div class="who">${escapeHtml(s.studentName)} · ${escapeHtml(s.experimentTitle)}</div>
                <div class="meta">${relativeDay(s.submittedAt)} · quiz ${s.quizScore}/${s.quizTotal}
                  · <span class="${tone}">${label}</span></div>
              </span>
              <span class="sub-score tnum" style="font-size:20px;font-weight:600">
                ${s.score == null ? '—' : s.score}<small style="font-size:12px;color:var(--ink-3)">/10</small>
              </span>
            </a>`;
        }).join('') : `<div class="empty-note">No submissions yet. Students haven't turned anything in.</div>`}
      </div>`;

    renderSpark(root.querySelector('.spark'), activity);

    root.querySelector('#reset-demo').addEventListener('click', () => {
      if (!confirm('Reset all demo data? Students, experiments and submissions go back to the starting set.')) return;
      VL.resetDemo();
      bus.emit('reset');
    });

    return root;
  }

  /* ============================================================
     5.  Experiments list — reorderable, publish switch
     ============================================================ */
  function experimentsAdminView() {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="section-head">
        <h2>Experiments</h2>
        <button class="btn btn--primary btn--sm" type="button" id="add-exp">
          ${icons.svg('plus', { size: 14 })}<span>New experiment</span>
        </button>
      </div>

      <div class="list-tools">
        <div class="search-wrap">
          ${icons.svg('search', { size: 18 })}
          <input class="input" id="exp-search" type="search" placeholder="Search by title or subject…" aria-label="Search experiments">
        </div>
        <div style="font-size:13px;color:var(--ink-3)">
          Drag the handle to reorder. Students see this order in their list.
        </div>
      </div>

      <div class="panel panel--flush" id="exp-list" style="padding:8px 12px"></div>`;

    const listEl = root.querySelector('#exp-list');
    let filter = '';

    function paint() {
      let list = allExperiments().slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      if (filter) {
        const q = filter.toLowerCase();
        list = list.filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.subject.toLowerCase().includes(q));
      }
      if (!list.length) {
        listEl.innerHTML = `<div class="empty-note">
          No experiments yet. Press <b>New experiment</b> to add your first one.
        </div>`;
        return;
      }
      listEl.innerHTML = list.map(e => `
        <div class="exp-row" data-id="${e.id}" draggable="true">
          <span class="exp-row__handle" aria-label="Drag to reorder" title="Drag to reorder">
            ${icons.svg('drag', { size: 16 })}
          </span>
          <div style="min-width:0">
            <div class="exp-row__title">${escapeHtml(e.title)}</div>
            <div class="exp-row__meta">
              ${escapeHtml(e.subject)}
              <span class="dot">·</span>${escapeHtml(e.difficulty)}
              <span class="dot">·</span>${e.duration} min
              <span class="dot">·</span>${(e.quiz || []).length} question${(e.quiz || []).length === 1 ? '' : 's'}
            </div>
          </div>
          <div class="exp-row__right">
            <button class="vl-switch" type="button" role="switch"
              aria-checked="${e.published !== false}" aria-label="Published"
              data-publish="${e.id}" title="Published / draft">
              <span class="vl-switch__thumb"></span>
            </button>
            <button class="icon-btn" type="button" data-edit="${e.id}" aria-label="Edit ${escapeHtml(e.title)}">
              ${icons.svg('edit', { size: 15 })}
            </button>
            <button class="icon-btn" type="button" data-del="${e.id}" aria-label="Delete ${escapeHtml(e.title)}">
              ${icons.svg('trash', { size: 15 })}
            </button>
          </div>
        </div>`).join('');

      // Wire publish toggles
      listEl.querySelectorAll('[data-publish]').forEach(sw => {
        sw.addEventListener('click', () => {
          const id = sw.dataset.publish;
          const next = sw.getAttribute('aria-checked') !== 'true';
          store.update(s => {
            const e = (s.experiments || []).find(x => x.id === id);
            if (e) e.published = next;
          });
          sw.setAttribute('aria-checked', String(next));
          toast.info(next ? 'Published to students.' : 'Hidden from students.');
          bus.emit('data');
        });
      });

      // Edit
      listEl.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
        const e = allExperiments().find(x => x.id === b.dataset.edit);
        if (e) openEditor(e);
      }));

      // Delete with 5s undo
      listEl.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.del;
        const idx = allExperiments().findIndex(x => x.id === id);
        if (idx < 0) return;
        const removed = allExperiments()[idx];
        const subs = allSubmissions().filter(s => s.experimentId === id);
        const warnMsg = subs.length
          ? `Delete "${removed.title}"? It has ${subs.length} submission${subs.length === 1 ? '' : 's'}.`
          : `Delete "${removed.title}"?`;
        if (!confirm(warnMsg)) return;

        store.update(s => {
          s.experiments = (s.experiments || []).filter(x => x.id !== id);
          // Keep submissions but mark them orphaned so they still show in history.
        });
        toast.success(`Deleted "${removed.title}".`);
        bus.emit('data');
        paint();
        undoToast(`Deleted "${removed.title}".`, () => {
          store.update(s => {
            s.experiments = s.experiments || [];
            s.experiments.splice(idx, 0, removed);
            // Re-index order
            s.experiments.forEach((x, i) => { x.order = i; });
          });
          bus.emit('data');
          paint();
        }, 5000);
      }));

      wireDrag();
    }

    /* --- Drag to reorder -------------------------------------- */
    function wireDrag() {
      let dragId = null;
      let dropTarget = null;

      listEl.querySelectorAll('.exp-row').forEach(row => {
        row.addEventListener('dragstart', (e) => {
          // Only start a drag if the handle (or its child) was the source.
          const fromHandle = e.target.closest('.exp-row__handle');
          if (!fromHandle) { e.preventDefault(); return; }
          dragId = row.dataset.id;
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {}
        });

        row.addEventListener('dragend', () => {
          listEl.querySelectorAll('.exp-row').forEach(r => r.classList.remove('dragging', 'drop-target'));
          dragId = null;
          dropTarget = null;
        });

        row.addEventListener('dragover', (e) => {
          if (!dragId || row.dataset.id === dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          listEl.querySelectorAll('.exp-row').forEach(r => r.classList.remove('drop-target'));
          row.classList.add('drop-target');
          dropTarget = row.dataset.id;
        });

        row.addEventListener('dragleave', () => row.classList.remove('drop-target'));

        row.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!dragId || !dropTarget || dragId === dropTarget) return;
          store.update(s => {
            const list = (s.experiments || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
            const from = list.findIndex(x => x.id === dragId);
            const to = list.findIndex(x => x.id === dropTarget);
            if (from < 0 || to < 0) return;
            const [item] = list.splice(from, 1);
            list.splice(to, 0, item);
            list.forEach((x, i) => { x.order = i; });
            s.experiments = list;
          });
          bus.emit('data');
          paint();
        });
      });
    }

    /* --- Editor drawer ---------------------------------------- */
    function openEditor(existing) {
      const editing = !!existing;
      const draft = editing ? JSON.parse(JSON.stringify(existing)) : {
        id: 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title: '', subject: 'Physics', difficulty: 'Easy', duration: 25,
        aim: '', theory: '', apparatus: [],
        quiz: [], published: true, order: allExperiments().length
      };

      const body = document.createElement('div');
      body.style.cssText = 'display:flex;flex-direction:column;gap:16px';

      body.innerHTML = `
        <div class="field">
          <label class="field__label" for="ed-title">Title</label>
          <input class="input" id="ed-title" type="text" placeholder="e.g. Simple Pendulum — length vs period">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field">
            <label class="field__label" for="ed-subject">Subject</label>
            <input class="input" id="ed-subject" type="text" placeholder="Physics">
          </div>
          <div class="field">
            <label class="field__label" for="ed-diff">Difficulty</label>
            <select class="select" id="ed-diff">
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field__label" for="ed-dur">Duration (minutes)</label>
          <input class="input" id="ed-dur" type="number" min="5" max="180" step="5">
        </div>
        <div class="field">
          <label class="field__label" for="ed-aim">Aim</label>
          <textarea class="textarea" id="ed-aim" rows="2" placeholder="What should the student find out?"></textarea>
        </div>
        <div class="field">
          <label class="field__label" for="ed-theory">Theory</label>
          <textarea class="textarea" id="ed-theory" rows="4" placeholder="A short paragraph the student can read before starting."></textarea>
        </div>
        <div class="field">
          <label class="field__label" for="ed-app">Apparatus (one per line)</label>
          <textarea class="textarea" id="ed-app" rows="3" placeholder="Retort stand&#10;Cotton thread&#10;Brass bob"></textarea>
        </div>
        <div class="field">
          <label class="field__label">Quiz</label>
          <div id="quiz-builder"></div>
          <button class="btn btn--sm" type="button" id="add-q" style="align-self:flex-start;margin-top:10px">
            ${icons.svg('plus', { size: 14 })}<span>Add question</span>
          </button>
        </div>`;

      // Prefill
      const $title = body.querySelector('#ed-title');
      const $subject = body.querySelector('#ed-subject');
      const $diff = body.querySelector('#ed-diff');
      const $dur = body.querySelector('#ed-dur');
      const $aim = body.querySelector('#ed-aim');
      const $theory = body.querySelector('#ed-theory');
      const $app = body.querySelector('#ed-app');
      $title.value = draft.title || '';
      $subject.value = draft.subject || '';
      $diff.value = draft.difficulty || 'Easy';
      $dur.value = draft.duration || 25;
      $aim.value = draft.aim || '';
      $theory.value = draft.theory || '';
      $app.value = (draft.apparatus || []).join('\n');

      // Quiz builder
      const qWrap = body.querySelector('#quiz-builder');
      const questions = (draft.quiz || []).map(q => ({
        q: q.q || '',
        options: (q.options && q.options.length ? q.options.slice(0, 4) : ['', '', '', '']).concat(
          ['', '', '', ''].slice((q.options || []).length).slice(0, Math.max(0, 4 - (q.options || []).length))
        ).slice(0, 4),
        correct: typeof q.correct === 'number' ? q.correct : 0
      }));

      function paintQuiz() {
        qWrap.innerHTML = '';
        if (!questions.length) {
          qWrap.innerHTML = '<div class="empty-note" style="padding:12px">No questions yet. One or two is plenty.</div>';
          return;
        }
        questions.forEach((q, qi) => {
          const item = document.createElement('div');
          item.className = 'quiz-item';
          item.innerHTML = `
            <div class="quiz-item__head">
              <span style="font-size:12px;color:var(--ink-3);font-weight:500">Question ${qi + 1}</span>
              <button class="icon-btn" type="button" data-rm="${qi}" aria-label="Remove question">${icons.svg('trash', { size: 14 })}</button>
            </div>
            <input class="input" type="text" data-q="${qi}" value="${escapeHtml(q.q)}" placeholder="Ask something short…" style="margin-top:6px">
            <div class="quiz-item__opts">
              ${q.options.map((opt, oi) => `
                <label class="quiz-item__opt">
                  <input type="radio" name="correct-${qi}" value="${oi}" ${q.correct === oi ? 'checked' : ''} data-correct="${qi}" aria-label="Mark option ${oi + 1} correct">
                  <input class="input" type="text" data-opt="${qi}-${oi}" value="${escapeHtml(opt)}" placeholder="Option ${oi + 1}">
                </label>`).join('')}
            </div>`;
          qWrap.appendChild(item);
        });

        qWrap.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
          questions.splice(Number(b.dataset.rm), 1);
          paintQuiz();
        }));
        qWrap.querySelectorAll('[data-q]').forEach(inp => inp.addEventListener('input', () => {
          questions[Number(inp.dataset.q)].q = inp.value;
        }));
        qWrap.querySelectorAll('[data-opt]').forEach(inp => inp.addEventListener('input', () => {
          const [qi, oi] = inp.dataset.opt.split('-').map(Number);
          questions[qi].options[oi] = inp.value;
        }));
        qWrap.querySelectorAll('[data-correct]').forEach(r => r.addEventListener('change', () => {
          questions[Number(r.dataset.correct)].correct = Number(r.value);
        }));
      }
      paintQuiz();

      body.querySelector('#add-q').addEventListener('click', () => {
        questions.push({ q: '', options: ['', '', '', ''], correct: 0 });
        paintQuiz();
        qWrap.querySelector('.quiz-item:last-child input')?.focus();
      });

      // Footer
      const foot = document.createElement('div');
      foot.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;width:100%';
      foot.innerHTML = `
        <button class="btn" type="button" data-close>Cancel</button>
        <button class="btn btn--primary" type="button" id="save-exp">
          ${icons.svg('check', { size: 16 })}<span>${editing ? 'Save changes' : 'Create experiment'}</span>
        </button>`;

      const { close } = openDrawer({
        title: editing ? 'Edit experiment' : 'New experiment',
        body, footer: foot
      });

      foot.querySelector('#save-exp').addEventListener('click', () => {
        const title = $title.value.trim();
        if (!title) { $title.focus(); toast.warn('Give the experiment a title.'); return; }
        const aim = $aim.value.trim();
        if (!aim) { $aim.focus(); toast.warn('Write a short aim.'); return; }

        const cleanedQuiz = questions
          .map(q => ({
            q: q.q.trim(),
            options: q.options.map(o => o.trim()).filter(Boolean),
            correct: q.correct
          }))
          .filter(q => q.q && q.options.length >= 2);

        const payload = {
          ...draft,
          title,
          subject: $subject.value.trim() || 'General',
          difficulty: $diff.value,
          duration: Number($dur.value) || 25,
          aim,
          theory: $theory.value.trim(),
          apparatus: $app.value.split('\n').map(x => x.trim()).filter(Boolean),
          quiz: cleanedQuiz,
          published: draft.published !== false
        };

        store.update(s => {
          s.experiments = s.experiments || [];
          const i = s.experiments.findIndex(x => x.id === payload.id);
          if (i >= 0) s.experiments[i] = payload;
          else s.experiments.push(payload);
        });
        bus.emit('data');
        toast.success(editing ? 'Experiment updated.' : 'Experiment created.');
        close();
        paint();
        app.rebuildPalette();
      });
    }

    // Search
    root.querySelector('#exp-search').addEventListener('input', (e) => {
      filter = e.target.value;
      paint();
    });

    root.querySelector('#add-exp').addEventListener('click', () => openEditor(null));

    queueMicrotask(paint);
    return root;
  }

  /* ============================================================
     6.  Submissions queue
     ============================================================ */
  function submissionsView() {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="section-head">
        <h2>Submissions</h2>
        <span style="font-size:13px;color:var(--ink-3)" id="sub-count"></span>
      </div>

      <div class="filters" id="sub-filters" style="margin-bottom:14px">
        <button class="tab" data-filter="pending"   type="button">Pending</button>
        <button class="tab" data-filter="changes"   type="button">Changes asked</button>
        <button class="tab" data-filter="graded"    type="button">Graded</button>
        <button class="tab" data-filter="all" type="button" aria-selected="true">All</button>
      </div>

      <div class="panel" id="sub-list"></div>`;

    const listEl = root.querySelector('#sub-list');
    const countEl = root.querySelector('#sub-count');
    let filter = 'all';

    function paint() {
      const all = allSubmissions().slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      const list = filter === 'all' ? all : all.filter(s => s.status === filter);
      countEl.textContent = `${list.length} of ${all.length}`;

      if (!list.length) {
        listEl.innerHTML = `<div class="empty-note">
          Nothing in this queue. ${filter === 'pending' ? 'Have a coffee.' : ''}
        </div>`;
        return;
      }

      listEl.innerHTML = list.map(s => {
        const st = s.status === 'graded' ? 'graded'
                 : s.status === 'changes' ? 'changes' : 'submitted';
        const tone = st === 'graded' ? 'chip chip--green'
                   : st === 'changes' ? 'chip chip--red'
                   : 'chip chip--orange';
        const label = st === 'graded' ? 'Graded'
                    : st === 'changes' ? 'Changes asked' : 'Pending review';
        return `
          <a class="sub-queue-row" href="#/admin/submissions/${s.id}">
            <span class="status-dot status-dot--${st === 'graded' ? 'graded' : 'submitted'}" aria-hidden="true"></span>
            <span style="min-width:0">
              <div class="who">${escapeHtml(s.studentName)}</div>
              <div class="meta">
                ${escapeHtml(s.experimentTitle)}
                <span style="color:var(--ink-4);margin:0 6px">·</span>${relativeDay(s.submittedAt)}
                <span style="color:var(--ink-4);margin:0 6px">·</span>quiz ${s.quizScore}/${s.quizTotal}
                <span style="margin-left:8px" class="${tone}">${label}</span>
              </div>
            </span>
            <span class="tnum" style="font-size:22px;font-weight:600;letter-spacing:-.02em">
              ${s.score == null ? '<span style="color:var(--ink-4);font-size:16px">—</span>' : s.score}<small style="font-size:12px;color:var(--ink-3);font-weight:500">/10</small>
            </span>
          </a>`;
      }).join('');
    }

    root.querySelectorAll('[data-filter]').forEach(t => t.addEventListener('click', () => {
      filter = t.dataset.filter;
      root.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-selected', String(x === t)));
      paint();
    }));

    queueMicrotask(paint);
    return root;
  }

  /* ============================================================
     7.  Submission review page
     ============================================================ */
  function submissionReviewView(id) {
    const sub = allSubmissions().find(s => s.id === id);
    if (!sub) {
      const nf = document.createElement('div');
      nf.className = 'panel';
      nf.innerHTML = `<div class="empty-note">
        This submission no longer exists.<br>
        <a class="btn btn--sm" style="margin-top:12px" href="#/admin/submissions">
          ${icons.svg('arrow-left', { size: 14 })}<span>Back to queue</span>
        </a>
      </div>`;
      return nf;
    }
    const exp = allExperiments().find(e => e.id === sub.experimentId);
    const quiz = (exp && exp.quiz) || [];

    const root = document.createElement('div');

    // Readings table + auto-plot
    const readings = Array.isArray(sub.readings) ? sub.readings : [];
    const keys = readings.length ? Object.keys(readings[0]) : [];
    const plotSpec = autoPlot(readings, sub.experimentId);

    root.innerHTML = `
      <a class="back" href="#/admin/submissions" style="display:inline-flex;align-items:center;gap:4px;color:var(--ink-3);font-size:13px;text-decoration:none;margin-bottom:12px">
        ${icons.svg('chevron-left', { size: 14 })}<span>Submissions</span>
      </a>

      <div class="exp-hero glass">
        <div class="exp-hero__left">
          <div class="card__eyebrow">Review</div>
          <h1 style="margin-top:4px">${escapeHtml(sub.experimentTitle)}</h1>
          <div class="meta">
            <span class="chip">${escapeHtml(sub.studentName)}</span>
            <span class="chip">Submitted ${relativeDay(sub.submittedAt)}</span>
            <span class="chip chip--blue">Quiz ${sub.quizScore}/${sub.quizTotal}</span>
            ${sub.status === 'graded' ? `<span class="chip chip--green">Graded</span>` : ''}
            ${sub.status === 'changes' ? `<span class="chip chip--red">Changes asked</span>` : ''}
          </div>
        </div>
      </div>

      <div class="split split--even" style="margin-top:20px">
        <div class="panel">
          <h2 style="font-size:17px;font-weight:600;letter-spacing:-.011em;margin-bottom:10px">Observations</h2>
          ${readings.length
            ? `<div style="overflow:auto"><table class="obs-table">
                <thead><tr>${keys.map(k => `<th>${escapeHtml(k)}</th>`).join('')}</tr></thead>
                <tbody>${readings.map(r => `<tr>${keys.map(k => `<td class="tnum">${fmtCell(r[k])}</td>`).join('')}</tr>`).join('')}</tbody>
              </table></div>`
            : `<div class="empty-note">No readings were recorded.</div>`}
        </div>

        <div class="panel">
          <h2 style="font-size:17px;font-weight:600;letter-spacing:-.011em;margin-bottom:10px">Graph</h2>
          <svg class="plot" id="rv-plot" viewBox="0 0 480 320" role="img" aria-label="Student's graph"></svg>
          <div id="rv-fit" style="font-size:13px;color:var(--ink-3);margin-top:6px"></div>
        </div>
      </div>

      <div class="panel" style="margin-top:20px">
        <h2 style="font-size:17px;font-weight:600;letter-spacing:-.011em;margin-bottom:12px">Quiz answers</h2>
        ${quiz.length ? quiz.map((q, i) => {
          const chosen = sub.answers ? sub.answers[i] : null;
          const right = chosen === q.correct;
          return `
            <div style="padding:12px 0;border-bottom:1px solid var(--line)">
              <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:6px">
                <span style="flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--fill-2);color:var(--ink-2);font-size:12px;font-weight:600">${i + 1}</span>
                <span style="font-weight:500">${escapeHtml(q.q)}</span>
                <span style="margin-left:auto" class="${right ? 'chip chip--green' : 'chip chip--red'}">${right ? 'Correct' : 'Wrong'}</span>
              </div>
              <div style="margin-left:32px;font-size:14px;color:var(--ink-2)">
                Student chose: <b>${chosen == null ? '—' : escapeHtml(q.options[chosen] || '—')}</b>
                ${!right ? ` · Correct answer: <b>${escapeHtml(q.options[q.correct])}</b>` : ''}
              </div>
            </div>`;
        }).join('') : `<div class="empty-note">No quiz for this experiment.</div>`}
      </div>

      <div class="panel" style="margin-top:20px">
        <h2 style="font-size:17px;font-weight:600;letter-spacing:-.011em;margin-bottom:10px">Conclusion</h2>
        ${sub.conclusion
          ? `<p style="font-size:16px;line-height:24px;color:var(--ink-2)">${escapeHtml(sub.conclusion)}</p>`
          : `<div class="empty-note">The student didn't write a conclusion.</div>`}
      </div>

      <div class="panel" id="review-panel" style="margin-top:20px">
        <h2 style="font-size:17px;font-weight:600;letter-spacing:-.011em;margin-bottom:12px">Your review</h2>
        <div class="score-slider">
          <span style="font-size:13px;color:var(--ink-3);flex:none">Score</span>
          <input class="range" id="score-input" type="range" min="0" max="10" step="1" value="${sub.score != null ? sub.score : 7}" aria-label="Score out of 10">
          <span class="score-slider__value tnum" id="score-value">${sub.score != null ? sub.score : 7}<small style="font-size:14px;color:var(--ink-3);font-weight:500">/10</small></span>
        </div>
        <div class="field" style="margin-top:16px">
          <label class="field__label" for="feedback-input">Feedback</label>
          <textarea class="textarea" id="feedback-input" rows="3" placeholder="Say what was good, and one thing to try next time.">${escapeHtml(sub.feedback || '')}</textarea>
        </div>
        <div class="submit-bar" style="justify-content:flex-end">
          <button class="btn" type="button" id="ask-changes">
            ${icons.svg('edit', { size: 16 })}<span>Request changes</span>
          </button>
          <button class="btn btn--primary" type="button" id="approve">
            ${icons.svg('check', { size: 16 })}<span>Approve &amp; grade</span>
          </button>
        </div>
      </div>`;

    // Plot
    const plotEl = root.querySelector('#rv-plot');
    const fitEl = root.querySelector('#rv-fit');
    queueMicrotask(() => {
      const spec = plotSpec;
      const pts = readings
        .map(r => ({ x: Number(r[spec.x]), y: Number(r[spec.y]) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      paintPlot(plotEl, fitEl, pts, spec);
    });

    // Score slider
    const scoreInput = root.querySelector('#score-input');
    const scoreVal = root.querySelector('#score-value');
    scoreInput.addEventListener('input', () => {
      scoreVal.innerHTML = `${scoreInput.value}<small style="font-size:14px;color:var(--ink-3);font-weight:500">/10</small>`;
    });

    // Approve
    root.querySelector('#approve').addEventListener('click', () => {
      const score = Number(scoreInput.value);
      const feedback = root.querySelector('#feedback-input').value.trim();
      store.update(s => {
        const t = (s.submissions || []).find(x => x.id === id);
        if (t) { t.status = 'graded'; t.score = score; t.feedback = feedback; t.gradedAt = Date.now(); }
      });
      toast.success(`Graded ${sub.studentName.split(' ')[0]} — ${score}/10.`);
      bus.emit('data');
      setTimeout(() => router.go('/admin/submissions'), 500);
    });

    // Request changes
    root.querySelector('#ask-changes').addEventListener('click', () => {
      const feedback = root.querySelector('#feedback-input').value.trim();
      if (!feedback) {
        toast.warn('Write a note so the student knows what to fix.');
        root.querySelector('#feedback-input').focus();
        return;
      }
      store.update(s => {
        const t = (s.submissions || []).find(x => x.id === id);
        if (t) { t.status = 'changes'; t.feedback = feedback; t.gradedAt = Date.now(); }
      });
      toast.warn('Sent back for changes.');
      bus.emit('data');
      setTimeout(() => router.go('/admin/submissions'), 500);
    });

    return root;
  }

  /* Render a plot into an SVG element. Mirrors the one in the
     student view but self-contained so we don't touch student.js. */
  function paintPlot(svg, fitEl, pts, spec) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, attrs) => { const n = document.createElementNS(NS, t); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    svg.innerHTML = '';
    const W = 480, H = 320;
    const m = { t: 20, r: 20, b: 46, l: 60 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;

    svg.appendChild(el('line', { class: 'axis', x1: m.l, y1: m.t + ih, x2: m.l + iw, y2: m.t + ih }));
    svg.appendChild(el('line', { class: 'axis', x1: m.l, y1: m.t, x2: m.l, y2: m.t + ih }));
    const xl = el('text', { class: 'axis-label', x: m.l + iw / 2, y: H - 12, 'text-anchor': 'middle' });
    xl.textContent = spec.xLabel; svg.appendChild(xl);
    const yl = el('text', { class: 'axis-label', x: 14, y: m.t + ih / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${m.t + ih / 2})` });
    yl.textContent = spec.yLabel; svg.appendChild(yl);

    if (!pts.length) {
      const empty = el('text', { class: 'tick-label', x: W / 2, y: H / 2, 'text-anchor': 'middle' });
      empty.textContent = 'No readings to plot.';
      svg.appendChild(empty);
      if (fitEl) fitEl.textContent = '';
      return;
    }

    let xMin = Math.min.apply(null, pts.map(p => p.x));
    let xMax = Math.max.apply(null, pts.map(p => p.x));
    let yMin = Math.min.apply(null, pts.map(p => p.y));
    let yMax = Math.max.apply(null, pts.map(p => p.y));
    if (xMin === xMax) { xMin -= 1; xMax += 1; }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    xMin = Math.max(0, xMin - (xMax - xMin) * 0.08); xMax += (xMax - xMin) * 0.08;
    yMin = Math.max(0, yMin - (yMax - yMin) * 0.10); yMax += (yMax - yMin) * 0.10;

    const X = v => m.l + ((v - xMin) / (xMax - xMin)) * iw;
    const Y = v => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

    for (let i = 0; i <= 4; i++) {
      const v = xMin + (xMax - xMin) * (i / 4);
      const px = X(v);
      svg.appendChild(el('line', { class: 'grid', x1: px, y1: m.t, x2: px, y2: m.t + ih }));
      const t = el('text', { class: 'tick-label', x: px, y: m.t + ih + 16, 'text-anchor': 'middle' });
      t.textContent = niceNum(v); svg.appendChild(t);
    }
    for (let i = 0; i <= 3; i++) {
      const v = yMin + (yMax - yMin) * (i / 3);
      const py = Y(v);
      svg.appendChild(el('line', { class: 'grid', x1: m.l, y1: py, x2: m.l + iw, y2: py }));
      const t = el('text', { class: 'tick-label', x: m.l - 8, y: py + 4, 'text-anchor': 'end' });
      t.textContent = niceNum(v); svg.appendChild(t);
    }

    // Least-squares through origin, or OLS
    let slope = 0, intercept = 0;
    if (pts.length >= 2) {
      if (spec.throughOrigin) {
        const num = pts.reduce((a, p) => a + p.x * p.y, 0);
        const den = pts.reduce((a, p) => a + p.x * p.x, 0);
        slope = den ? num / den : 0;
      } else {
        const n = pts.length;
        const sx = pts.reduce((a, p) => a + p.x, 0);
        const sy = pts.reduce((a, p) => a + p.y, 0);
        const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
        const sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
        const d = n * sxx - sx * sx;
        slope = d ? (n * sxy - sx * sy) / d : 0;
        intercept = n ? (sy - slope * sx) / n : 0;
      }
      const x0 = xMin, x1 = xMax;
      svg.appendChild(el('line', {
        class: 'fit',
        x1: X(x0), y1: Y(slope * x0 + intercept),
        x2: X(x1), y2: Y(slope * x1 + intercept)
      }));
      if (fitEl) fitEl.innerHTML = `Best fit: <b class="tnum">slope ≈ ${slope.toFixed(3)}</b>` +
        (Math.abs(intercept) > 0.01 ? `, intercept ≈ ${intercept.toFixed(3)}` : '');
    } else if (fitEl) {
      fitEl.textContent = 'Not enough readings to fit a line.';
    }

    pts.forEach(p => svg.appendChild(el('circle', { class: 'point', cx: X(p.x), cy: Y(p.y), r: 5.5 })));
  }

  function niceNum(v) {
    const a = Math.abs(v);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }
  function fmtCell(v) {
    if (v == null) return '—';
    if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(3);
    return escapeHtml(String(v));
  }

  /* Pick a sensible x/y from the reading row shape. */
  function autoPlot(rows, expId) {
    if (expId === 'e_pendulum')  return { x: 'L', y: 'T2', xLabel: 'Length L (m)', yLabel: 'T² (s²)', throughOrigin: true };
    if (expId === 'e_ohm')       return { x: 'I', y: 'V', xLabel: 'Current I (A)', yLabel: 'Voltage V (V)', throughOrigin: true };
    if (expId === 'e_titration') return { x: 'trial', y: 'V', xLabel: 'Trial number', yLabel: 'Volume of NaOH (mL)', throughOrigin: false };
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const numeric = keys.filter(k => typeof rows[0][k] === 'number');
    const x = numeric[0] || keys[0] || 'x';
    const y = numeric[1] || numeric[0] || 'y';
    return { x, y, xLabel: x, yLabel: y, throughOrigin: false };
  }

  /* ============================================================
     8.  Students
     ============================================================ */
  function studentsView() {
    const students = allStudents();
    const totalExps = allExperiments().length || 1;
    const subs = allSubmissions();

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="section-head">
        <h2>Students</h2>
        <button class="btn btn--sm" type="button" id="export-csv">
          ${icons.svg('download', { size: 14 })}<span>Export CSV</span>
        </button>
      </div>

      <div class="panel panel--flush" style="padding:8px 16px;overflow:auto">
        <table class="students-table" id="students-table">
          <thead>
            <tr>
              <th style="min-width:200px">Student</th>
              <th>Progress</th>
              <th style="text-align:right">Submitted</th>
              <th style="text-align:right">Average</th>
              <th>Last active</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>`;

    const tbody = root.querySelector('tbody');

    students.forEach(st => {
      const mine = subs.filter(s => s.studentId === st.id);
      const done = mine.filter(s => s.status === 'pending' || s.status === 'graded').length;
      const pct = Math.min(100, Math.round((done / totalExps) * 100));
      const avg = averageScore(mine);
      const last = lastActiveFor(st.id);

      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', 'Open history for ' + st.name);
      tr.innerHTML = `
        <td>
          <div class="who">
            <span class="avatar" aria-hidden="true">${escapeHtml(st.avatar || '')}</span>
            <span style="min-width:0">
              <b>${escapeHtml(st.name)}</b>
              <span>${escapeHtml(st.roll || st.email || '')}</span>
            </span>
          </div>
        </td>
        <td style="min-width:160px">
          <div class="bar"><span class="bar__fill ${pct >= 75 ? 'bar__fill--green' : pct >= 40 ? '' : 'bar__fill--orange'}" style="transform:scaleX(${pct / 100});transform-origin:left"></span></div>
          <div style="font-size:12px;color:var(--ink-3);margin-top:4px">${done} of ${totalExps} started</div>
        </td>
        <td style="text-align:right" class="tnum">${mine.length}</td>
        <td style="text-align:right" class="tnum">${avg ? avg.toFixed(1) : '—'}</td>
        <td style="color:var(--ink-3);font-size:13px">${relativeDay(last)}</td>`;
      tr.addEventListener('click', () => openStudent(st));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStudent(st); } });
      tbody.appendChild(tr);
    });

    root.querySelector('#export-csv').addEventListener('click', () => {
      const rows = [['Roll', 'Name', 'Email', 'Submitted', 'Average score', 'Last active']];
      students.forEach(st => {
        const mine = subs.filter(s => s.studentId === st.id);
        const avg = averageScore(mine);
        const last = lastActiveFor(st.id);
        rows.push([
          st.roll || '', st.name, st.email,
          mine.length,
          avg ? avg.toFixed(1) : '',
          last ? new Date(last).toISOString().slice(0, 10) : ''
        ]);
      });
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'virtual-lab-students.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Exported ' + students.length + ' students.');
    });

    return root;
  }

  function openStudent(st) {
    const mine = allSubmissions()
      .filter(s => s.studentId === st.id)
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    const totalExps = allExperiments().length || 1;
    const done = mine.filter(s => s.status === 'pending' || s.status === 'graded').length;
    const avg = averageScore(mine);
    const last = lastActiveFor(st.id);
    const days = (store.get('studentDays', {}) || {})[st.id] || {};
    const activeDays = Object.keys(days).length;

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:16px';
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <span class="avatar avatar--lg" aria-hidden="true">${escapeHtml(st.avatar || '')}</span>
        <div style="min-width:0">
          <div style="font-size:17px;font-weight:600">${escapeHtml(st.name)}</div>
          <div style="font-size:13px;color:var(--ink-3)">${escapeHtml(st.roll || '')} · ${escapeHtml(st.email)}</div>
        </div>
      </div>

      <div class="stat-row" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat" style="padding:12px">
          <div class="label">Reports</div>
          <span class="value tnum" style="font-size:22px">${mine.length}</span>
        </div>
        <div class="stat" style="padding:12px">
          <div class="label">Average</div>
          <span class="value tnum" style="font-size:22px">${avg ? avg.toFixed(1) : '—'}</span>
        </div>
        <div class="stat" style="padding:12px">
          <div class="label">Days active</div>
          <span class="value tnum" style="font-size:22px">${activeDays}</span>
        </div>
      </div>

      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:var(--ink-3)">
          <span>${done} of ${totalExps} experiments started</span>
          <span>Last active ${relativeDay(last)}</span>
        </div>
        <div class="bar"><span class="bar__fill ${done / totalExps >= .75 ? 'bar__fill--green' : ''}" style="transform:scaleX(${Math.min(1, done / totalExps)});transform-origin:left"></span></div>
      </div>

      <div>
        <div class="card__eyebrow" style="margin-bottom:8px">History</div>
        ${mine.length ? mine.map(s => {
          const tone = s.status === 'graded' ? 'chip chip--green'
                     : s.status === 'changes' ? 'chip chip--red'
                     : 'chip chip--orange';
          const label = s.status === 'graded' ? 'Graded'
                      : s.status === 'changes' ? 'Changes asked' : 'Pending';
          return `
            <a class="sub-row" href="#/admin/submissions/${s.id}" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto">
              <div style="min-width:0">
                <div class="sub-title">${escapeHtml(s.experimentTitle)}</div>
                <div class="sub-meta">${relativeDay(s.submittedAt)} · quiz ${s.quizScore}/${s.quizTotal}
                  · <span class="${tone}">${label}</span></div>
              </div>
              <div class="sub-score tnum">
                ${s.score == null ? '—' : s.score}<small>/10</small>
              </div>
            </a>`;
        }).join('') : `<div class="empty-note">No submissions yet.</div>`}
      </div>`;

    openDrawer({ title: 'Student history', body });
  }

  /* ============================================================
     9.  Routes + boot
     ============================================================ */
  function registerAdminRoutes() {
    router
      .register('/admin',                 VL.guardAdmin(() => { app.renderShell(); app.setView(app.wrap(dashboardView())); }))
      .register('/admin/experiments',     VL.guardAdmin(() => { app.renderShell(); app.setView(app.wrap(experimentsAdminView())); }))
      .register('/admin/submissions',     VL.guardAdmin(() => { app.renderShell(); app.setView(app.wrap(submissionsView())); }))
      .register('/admin/submissions/:id', VL.guardAdmin(({ id }) => { app.renderShell(); app.setView(app.wrap(submissionReviewView(id))); }))
      .register('/admin/students',        VL.guardAdmin(() => { app.renderShell(); app.setView(app.wrap(studentsView())); }));
  }

  /* Extend the command palette with admin-only entries. */
  function buildPaletteExtras() {
    const s = app.session();
    if (!s || s.role !== 'admin') { VL.paletteExtra = []; return; }
    VL.paletteExtra = [
      { label: 'New experiment', icon: 'plus', group: 'Admin', run: () => {
        router.go('/admin/experiments');
        setTimeout(() => document.querySelector('#add-exp')?.click(), 260);
      }},
      { label: 'Reset demo data', icon: 'refresh', group: 'Admin', run: () => {
        if (confirm('Reset all demo data?')) { VL.resetDemo(); bus.emit('reset'); }
      }}
    ];
  }

  ready(() => {
    ensureAdminStyles();
    registerAdminRoutes();
    buildPaletteExtras();

    bus.on('data', () => { app.rebuildPalette(); });
    bus.on('auth', () => { buildPaletteExtras(); app.rebuildPalette(); });
    // If the current view is an admin route, refresh it when data changes.
    bus.on('data', () => {
      const path = router.path();
      if (path.startsWith('/admin') && document.querySelector('#view')) {
        // Silent refresh: don't blow away focus inside a form. Only repaint
        // if the active element isn't inside a drawer or form.
        const ae = document.activeElement;
        const insideForm = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.closest('.drawer, .modal'));
        if (!insideForm) router.handle();
      }
    });
  });

  /* Public surface for anyone extending the app later. */
  VL.admin = {
    dashboardView, experimentsAdminView, submissionsView,
    submissionReviewView, studentsView, openDrawer,
    allExperiments, allSubmissions, allStudents, lastActiveFor
  };
})();