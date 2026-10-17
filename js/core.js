/* ============================================================
   core.js — patched to prevent random hashes from triggering 404
   ============================================================ */

window.VL = (function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp    = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt      = (n, d = 0) => Number(n).toFixed(d);
  const uid      = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
  const wait     = (ms) => new Promise(r => setTimeout(r, ms));
  const debounce = (fn, ms = 200) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
  const cloneDeep = (o) => JSON.parse(JSON.stringify(o));

  const STORE_KEY = 'vl.v1';
  const store = {
    read() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (_) { return {}; } },
    write(obj) { try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); return true; } catch (_) { return false; } },
    get(key, fallback = null) { const s = this.read(); return Object.prototype.hasOwnProperty.call(s, key) ? s[key] : fallback; },
    set(key, value) { const s = this.read(); s[key] = value; return this.write(s); },
    update(mutator) { const s = this.read(); const out = mutator(s); this.write(s); return out; },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch (_) {} }
  };

  const bus = {
    _m: new Map(),
    on(evt, fn) { if (!this._m.has(evt)) this._m.set(evt, new Set()); this._m.get(evt).add(fn); return () => this.off(evt, fn); },
    off(evt, fn) { this._m.get(evt)?.delete(fn); },
    emit(evt, data) { (this._m.get(evt) || []).forEach(fn => { try { fn(data); } catch (err) { console.error('[VL bus]', err); } }); }
  };

  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) bus.emit('external-change'); });

  const SEED = {
    __version: 1,
    users: [
      { id: 'u_admin', role: 'admin',   name: 'Dr. Meera Iyer',  email: 'meera@lab.edu',       avatar: 'MI' },
      { id: 'u_1',     role: 'student', name: 'Aarav Sharma',    email: 'aarav@student.edu',   avatar: 'AS', roll: '22BSC1013' },
      { id: 'u_2',     role: 'student', name: 'Diya Patel',      email: 'diya@student.edu',    avatar: 'DP', roll: '22BSC1014' },
      { id: 'u_3',     role: 'student', name: 'Kabir Singh',     email: 'kabir@student.edu',   avatar: 'KS', roll: '22BSC1015' },
      { id: 'u_4',     role: 'student', name: 'Ananya Reddy',    email: 'ananya@student.edu',  avatar: 'AR', roll: '22BSC1016' },
      { id: 'u_5',     role: 'student', name: 'Rohan Mehta',     email: 'rohan@student.edu',   avatar: 'RM', roll: '22BSC1017' },
      { id: 'u_6',     role: 'student', name: 'Ishita Bose',     email: 'ishita@student.edu',  avatar: 'IB', roll: '22BSC1018' },
      { id: 'u_7',     role: 'student', name: 'Vikram Nair',     email: 'vikram@student.edu',  avatar: 'VN', roll: '22BSC1019' },
      { id: 'u_8',     role: 'student', name: 'Priya Kulkarni',  email: 'priya@student.edu',   avatar: 'PK', roll: '22BSC1020' }
    ],
    experiments: [
      { id: 'e_pendulum', title: 'Simple Pendulum — length vs period', subject: 'Physics', difficulty: 'Easy', duration: 25, aim: 'Study how the period of a simple pendulum depends on its length and estimate g.', theory: 'For small angles the restoring force is proportional to displacement, so the motion is simple-harmonic. Theory predicts T = 2π√(L/g), independent of the mass of the bob.', apparatus: ['Retort stand', 'Cotton thread (~1.2 m)', 'Brass bob (20 g)', 'Metre scale', 'Stopwatch'], quiz: [ { q: 'If you double the length, the period…', options: ['doubles', 'grows by √2', 'halves', 'stays the same'], correct: 1 }, { q: 'The period depends on the mass of the bob.', options: ['True', 'False'], correct: 1 }, { q: 'A stopwatch reading of 20 oscillations is divided by 20 to reduce…', options: ['parallax', 'human reaction error', 'air drag', 'gravity'], correct: 1 } ], published: true, order: 0 },
      { id: 'e_ohm', title: "Ohm's Law — voltage, current, resistance", subject: 'Physics', difficulty: 'Easy', duration: 20, aim: 'Verify that current through a conductor is proportional to the potential difference across it.', theory: 'For a metallic conductor at constant temperature, V = IR. A plot of V against I is a straight line through the origin; its slope gives R.', apparatus: ['Battery eliminator (0–12 V)', 'Rheostat', 'Ammeter (0–1 A)', 'Voltmeter (0–10 V)', 'Connecting wires', 'Unknown resistor'], quiz: [ { q: 'The V–I graph for a resistor at constant temperature is…', options: ['a curve', 'a straight line through the origin', 'a horizontal line', 'a parabola'], correct: 1 }, { q: 'Doubling V while keeping R fixed will…', options: ['halve I', 'keep I the same', 'double I', 'square I'], correct: 2 }, { q: 'The SI unit of resistance is…', options: ['ampere', 'volt', 'ohm', 'watt'], correct: 2 } ], published: true, order: 1 },
      { id: 'e_titration', title: 'Acid–Base Titration — find the strength of HCl', subject: 'Chemistry', difficulty: 'Medium', duration: 30, aim: 'Determine the concentration of a given HCl solution using a standard NaOH solution.', theory: 'At the endpoint, moles of acid equal moles of base: M₁V₁ = M₂V₂. Phenolphthalein is colourless in acid and pink in base, so the first permanent pink marks the endpoint.', apparatus: ['Burette (50 mL)', 'Pipette (20 mL)', 'Conical flask', 'NaOH (0.1 M)', 'Unknown HCl', 'Phenolphthalein'], quiz: [ { q: 'Phenolphthalein is colourless in…', options: ['base', 'acid', 'both', 'neither'], correct: 1 }, { q: 'At the endpoint, moles of HCl equal…', options: ['moles of NaOH', 'twice the moles of NaOH', 'half the moles of NaOH', 'zero'], correct: 0 }, { q: 'A student overshoots the endpoint. The calculated HCl molarity will be…', options: ['too low', 'unaffected', 'too high', 'zero'], correct: 2 } ], published: true, order: 2 },
      { id: 'e_projectile', title: 'Projectile Motion — range and angle', subject: 'Physics', difficulty: 'Medium', duration: 35, aim: 'Measure how the horizontal range of a projectile varies with its launch angle.', theory: 'Ignoring air resistance, R = u²sin(2θ)/g. Range is maximum at 45° and equal for complementary angles.', apparatus: ['Projectile launcher', 'Graph paper', 'Protractor', 'Metre tape'], quiz: [ { q: 'The range is maximum at…', options: ['30°', '45°', '60°', '90°'], correct: 1 }, { q: 'Complementary angles give…', options: ['different ranges', 'the same range', 'zero range', 'maximum range'], correct: 1 } ], published: true, order: 3 },
      { id: 'e_magnetic', title: 'Magnetic Field Around a Straight Wire', subject: 'Physics', difficulty: 'Hard', duration: 40, aim: 'Map the field lines around a straight current-carrying conductor.', theory: "Ampère's law: ∮B·dl = μ₀I. The field is concentric and falls off as 1/r.", apparatus: ['Long straight wire', 'Compass needle', 'Iron filings', 'DC supply'], quiz: [ { q: 'The field lines around a long straight wire are…', options: ['parallel', 'radial', 'concentric circles', 'helical'], correct: 2 } ], published: true, order: 4 }
    ],
    submissions: [], activity: [], __seeded: false
  };

  function seedFromScratch() {
    const fresh = cloneDeep(SEED);
    fresh.__seeded = true;
    fresh.activity = buildSeedActivity();
    return fresh;
  }
  function buildSeedActivity() {
    const days = []; const today = new Date(); const pattern = [4, 6, 3, 8, 5, 7, 4];
    for (let i = 6; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push({ date: d.toISOString().slice(0, 10), count: pattern[6 - i] }); }
    return days;
  }
  function ensureSeed() {
    const s = store.read();
    if (!s.__seeded) { store.write(seedFromScratch()); bus.emit('seed'); return true; }
    return false;
  }
  function resetDemo() { store.write(seedFromScratch()); bus.emit('reset'); }

  const ICON_PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1h3.5v-6h4v6H17a1 1 0 0 0 1-1V9.5"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v5.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 8.5V3"/><path d="M7 14h10"/>',
    chart: '<path d="M4 20h16"/><path d="M7 20v-6M12 20V7M17 20v-9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 5.5a3.5 3.5 0 0 1 0 7"/><path d="M18 20c0-2.6-1-4.7-2.5-5.6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m4.5 12.5 5 5 10-11"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="m14 6 4 4"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
    monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.5 21a2 2 0 0 0 3 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    play: '<path d="M7 4.5v15l13-7.5Z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
    upload: '<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M4 5h16"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    star: '<path d="m12 3 2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 16.9 6.5 19.7l1.3-6.1L3.2 9.4l6.2-.7Z"/>',
    award: '<circle cx="12" cy="9" r="5"/><path d="m8.5 13-1.5 8 5-3 5 3-1.5-8"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z"/><path d="M4 19a2 2 0 0 0 2 2h12"/>',
    clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 17-5-5 5-5"/><path d="M5 12h12"/>',
    alert: '<path d="M12 3 2 20h20Z"/><path d="M12 9v5M12 17v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.4 6.4l2.8 2.8M14.8 14.8l2.8 2.8M6.4 17.6l2.8-2.8M14.8 9.2l2.8-2.8"/>',
    command: '<path d="M9 3a3 3 0 1 0 3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 0 0-3-3Z"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    drag: '<circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.5c-.8.2-1.5.9-1.5 1.7V14"/><circle cx="12" cy="17.5" r=".9" fill="currentColor" stroke="none"/>'
  };

  const icons = {
    svg(name, { size = 24, sw = 1.75, cls = '' } = {}) {
      const p = ICON_PATHS[name] || ICON_PATHS.help;
      return `<svg${cls ? ` class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
    },
    into(el, name, opts) { el.innerHTML = this.svg(name, opts); return el; },
    has(name) { return Object.prototype.hasOwnProperty.call(ICON_PATHS, name); }
  };

  const toast = {
    region: null,
    ensure() {
      if (this.region && document.body.contains(this.region)) return this.region;
      const r = document.createElement('div');
      r.className = 'toast-region';
      r.setAttribute('role', 'status');
      r.setAttribute('aria-live', 'polite');
      document.body.appendChild(r);
      this.region = r;
      return r;
    },
    show(msg, { tone = 'info', duration = 3200, icon: iconName } = {}) {
      const region = this.ensure();
      const el = document.createElement('div');
      el.className = `toast glass toast--${tone}`;
      const icoName = iconName || (tone === 'success' ? 'check' : tone === 'error' ? 'alert' : tone === 'warn' ? 'alert' : 'info');
      el.innerHTML = `<span class="toast__icon">${icons.svg(icoName)}</span><span class="toast__msg"></span>`;
      el.querySelector('.toast__msg').textContent = msg;
      region.appendChild(el);

      let startX = 0, dx = 0, dragging = false;
      const onDown = (e) => { dragging = true; startX = e.clientX; el.style.transition = 'none'; };
      const onMove = (e) => { if (!dragging) return; dx = e.clientX - startX; el.style.transform = `translateX(${dx}px)`; el.style.opacity = String(1 - Math.min(1, Math.abs(dx) / 160)); };
      const onUp = () => { if (!dragging) return; dragging = false; el.style.transition = ''; if (Math.abs(dx) > 80) this.dismiss(el); else { el.style.transform = ''; el.style.opacity = ''; } dx = 0; };
      el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);

      clearTimeout(el._timer);
      el._timer = setTimeout(() => this.dismiss(el), duration);
      return el;
    },
    dismiss(el) { if (!el || el._closing) return; el._closing = true; clearTimeout(el._timer); el.classList.add('out'); setTimeout(() => el.remove(), 260); },
    success(m, o) { return this.show(m, { ...o, tone: 'success' }); },
    error(m, o) { return this.show(m, { ...o, tone: 'error' }); },
    warn(m, o) { return this.show(m, { ...o, tone: 'warn' }); },
    info(m, o) { return this.show(m, { ...o, tone: 'info' }); }
  };

  const theme = {
    modes: ['auto', 'light', 'dark'],
    get mode() { return store.get('theme', 'auto') || 'auto'; },
    resolved() { const m = this.mode; return m === 'auto' ? (prefersDark() ? 'dark' : 'light') : m; },
    init() {
      this._apply(this.resolved());
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener?.('change', () => { if (this.mode === 'auto') this._apply(this.resolved()); });
    },
    set(mode, evt) { if (!this.modes.includes(mode)) return; store.set('theme', mode); this.apply(mode, evt); bus.emit('theme', { mode }); },
    cycle(evt) { const i = this.modes.indexOf(this.mode); const next = this.modes[(i + 1) % this.modes.length]; this.set(next, evt); return next; },
    _apply(resolved) { document.documentElement.setAttribute('data-theme', resolved); },
    apply(mode, evt) {
      const resolved = mode === 'auto' ? (prefersDark() ? 'dark' : 'light') : mode;
      if (!document.startViewTransition || prefersReducedMotion()) { this._apply(resolved); return; }
      const x = evt?.clientX ?? (window.innerWidth - 40); const y = evt?.clientY ?? 40;
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const root = document.documentElement;
      root.style.setProperty('--reveal-x', x + 'px'); root.style.setProperty('--reveal-y', y + 'px'); root.style.setProperty('--reveal-r', r + 'px');
      root.classList.add('theme-reveal');
      const t = document.startViewTransition(() => this._apply(resolved));
      t.finished.finally(() => root.classList.remove('theme-reveal'));
    }
  };

  const router = {
    routes: [], current: null,
    register(pattern, handler) {
      const keys = [];
      const src = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
      this.routes.push({ re: new RegExp('^' + src + '/?$'), keys, pattern, handler });
      return this;
    },
    go(path, { replace = false } = {}) {
      const hash = '#' + (path.startsWith('/') ? path : '/' + path);
      if (location.hash === hash) { this.handle(); return; }
      if (replace) location.replace(hash); else location.hash = hash;
    },
    replace(path) { this.go(path, { replace: true }); },
    path() { return location.hash.replace(/^#/, '') || '/home'; },
    handle() {
      const path = this.path();
      
      // FIX: If the path is just an anchor (e.g., from clicking #sec-aim), don't render 404
      if (!path.startsWith('/') && !path.startsWith('admin') && !path.startsWith('experiments') && !path.startsWith('home') && !path.startsWith('progress') && !path.startsWith('signin')) {
        return;
      }

      for (const r of this.routes) {
        const m = path.match(r.re);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        this._run(r, params, path); return;
      }
      this._run({ handler: notFound, pattern: '*' }, {}, path);
    },
    _run(route, params, path) {
      const prev = this.current;
      this.current = { path, params, pattern: route.pattern };
      const run = () => { try { route.handler(params, { path, prev }); } catch (err) { console.error('[VL router]', err); } };
      if (document.startViewTransition && !prefersReducedMotion()) { document.startViewTransition(run); } else { run(); }
      bus.emit('route', { path, params });
    },
    start() { window.addEventListener('hashchange', () => this.handle()); this.handle(); }
  };

  function notFound() {
    if (VL.notFound) { VL.notFound(); return; }
    const app = document.getElementById('view') || document.body;
    app.innerHTML = '<div class="panel glass" style="max-width:520px;margin:64px auto;padding:32px;text-align:center"><h1 style="font-size:28px;margin-bottom:8px">Page not found</h1><p style="color:var(--ink-3)">That link doesn\'t lead anywhere. Try the home tab.</p><p style="margin-top:16px"><a class="btn btn--primary" href="#/home">Go home</a></p></div>';
  }

  const palette = {
    open: false, root: null, scrim: null, input: null, list: null,
    _items: [], _filtered: [], _sel: 0,
    setItems(items) { this._items = items.slice(); return this; },
    mount() {
      if (this.root) return;
      const scrim = document.createElement('div');
      scrim.className = 'modal-scrim'; scrim.setAttribute('aria-hidden', 'true');
      scrim.addEventListener('click', () => this.close());
      const root = document.createElement('div');
      root.className = 'glass glass--refract';
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Command palette');
      root.style.cssText = 'position:fixed;top:14vh;left:50%;transform:translateX(-50%) translateY(-12px) scale(.98);width:min(560px,calc(100vw - 32px));z-index:85;opacity:0;border-radius:20px;transition:opacity .25s var(--ease-out),transform .3s var(--ease-out);';
      root.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)"><span style="color:var(--ink-3);display:inline-flex">' + icons.svg('search', { size: 20 }) + '</span><input class="palette__input" type="text" placeholder="Jump to an experiment, page or action…" style="flex:1;border:0;background:transparent;outline:none;color:inherit;font:400 17px/22px var(--font-sans)" aria-label="Search commands"><kbd class="on-glass" style="padding:2px 6px;border-radius:6px;font:600 11px/1 var(--font-sans);color:var(--ink-3)">Esc</kbd></div><div class="palette__list" role="listbox" style="max-height:52vh;overflow:auto;padding:8px"></div>';
      document.body.appendChild(scrim); document.body.appendChild(root);
      const input = root.querySelector('.palette__input'); const list = root.querySelector('.palette__list');
      input.addEventListener('input', () => this._refresh(input.value)); input.addEventListener('keydown', (e) => this._onKey(e));
      this.root = root; this.scrim = scrim; this.input = input; this.list = list;
    },
    _refresh(query = '') {
      const q = query.trim().toLowerCase();
      this._filtered = this._items.filter(it => { if (!q) return true; const hay = (it.label + ' ' + (it.hint || '') + ' ' + (it.group || '')).toLowerCase(); return hay.includes(q); });
      this._sel = 0; this._paint();
    },
    _paint() {
      const list = this.list; list.innerHTML = '';
      if (!this._filtered.length) { const empty = document.createElement('div'); empty.style.cssText = 'padding:22px 14px;text-align:center;color:var(--ink-3);font-size:15px'; empty.textContent = 'Nothing matches that. Try another word.'; list.appendChild(empty); return; }
      this._filtered.forEach((it, i) => {
        const row = document.createElement('div');
        row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(i === this._sel)); row.className = 'palette__row';
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer;color:var(--ink-1);transition:background .15s var(--ease-out);' + (i === this._sel ? 'background:var(--fill-2);' : '');
        row.innerHTML = `<span style="display:inline-flex;color:var(--ink-3);flex:none">${icons.svg(it.icon || 'arrow-right', { size: 18 })}</span><span style="flex:1;min-width:0"><span style="display:block;font-weight:500">${escapeHtml(it.label)}</span>${it.hint ? `<span style="display:block;color:var(--ink-3);font-size:13px">${escapeHtml(it.hint)}</span>` : ''}</span>${it.group ? `<span style="color:var(--ink-4);font-size:12px">${escapeHtml(it.group)}</span>` : ''}`;
        row.addEventListener('mousemove', () => { if (this._sel !== i) { this._sel = i; this._paint(); } });
        row.addEventListener('click', () => this._choose(i));
        list.appendChild(row);
      });
    },
    _onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this._sel = Math.min(this._filtered.length - 1, this._sel + 1); this._paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this._sel = Math.max(0, this._sel - 1); this._paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); this._choose(this._sel); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    },
    _choose(i) { const it = this._filtered[i]; if (!it) return; this.close(); try { it.run && it.run(); } catch (err) { console.error('[palette]', err); } },
    show() {
      this.mount(); this.open = true; this.scrim.classList.add('open'); this.scrim.style.display = '';
      this.root.style.opacity = '1'; this.root.style.transform = 'translateX(-50%) translateY(0) scale(1)';
      this.input.value = ''; this._refresh(''); setTimeout(() => this.input.focus(), 30);
    },
    close() {
      if (!this.open) return; this.open = false; this.scrim.classList.remove('open');
      this.root.style.opacity = '0'; this.root.style.transform = 'translateX(-50%) translateY(-8px) scale(.98)';
      const scrim = this.scrim; setTimeout(() => { if (!this.open) { scrim.style.display = 'none'; } }, 220);
      if (document.activeElement === this.input) this.input.blur();
    },
    toggle() { this.open ? this.close() : this.show(); }
  };

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.toggle(); }
    else if (e.key === 'Escape' && palette.open) { palette.close(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      if (VL.requestAdminAccess) VL.requestAdminAccess();
    }
  });

  function attachSpecular(root = document) {
    root.addEventListener('pointermove', (e) => {
      const t = e.target.closest('.glass, .btn, .panel');
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      t.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    }, { passive: true });
  }

  function attachTilt(el, max = 5) {
    if (window.matchMedia('(hover: none)').matches || prefersReducedMotion()) return;
    el.classList.add('tilt');
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
    };
    const reset = () => { el.style.transform = ''; };
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerleave', reset);
  }

  function observeReveals(root = document) {
    root.querySelectorAll('[data-stagger]').forEach(container => { [...container.children].forEach((c, i) => c.style.setProperty('--i', i)); });
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (!en.isIntersecting) return; en.target.classList.add('in'); io.unobserve(en.target); });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    root.querySelectorAll('.fade-up, [data-stagger], [data-count]').forEach(el => io.observe(el));
  }

  function countUp(el, to, { duration = 900, decimals = 0, prefix = '', suffix = '' } = {}) {
    if (prefersReducedMotion()) { el.textContent = prefix + Number(to).toFixed(decimals) + suffix; return; }
    const start = performance.now(); const ease = (t) => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = 0 + (to - 0) * ease(t);
      el.textContent = prefix + Number(v).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function injectRefractFilter() {
    if (document.getElementById('vl-refract')) return;
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true'); wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    wrap.innerHTML = '<svg width="0" height="0"><filter id="vl-refract" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="3" result="noise"/><feGaussianBlur in="noise" stdDeviation="1.2" result="soft"/><feDisplacementMap in="SourceGraphic" in2="soft" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';
    document.body.appendChild(wrap);
  }

  function mountBackground() {
    if (document.querySelector('.bg-blobs')) return;
    const blobs = document.createElement('div'); blobs.className = 'bg-blobs'; blobs.setAttribute('aria-hidden', 'true');
    blobs.innerHTML = '<span class="blob blob-1"></span><span class="blob blob-2"></span><span class="blob blob-3"></span><span class="blob blob-4"></span>';
    const noise = document.createElement('div'); noise.className = 'bg-noise'; noise.setAttribute('aria-hidden', 'true');
    document.body.prepend(noise); document.body.prepend(blobs);
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  const api = {
    $, $$, h, clamp, fmt, uid, wait, debounce, escapeHtml, prefersReducedMotion, prefersDark,
    store, bus, SEED: cloneDeep(SEED), ensureSeed, resetDemo,
    router, theme, toast, palette, icons,
    attachSpecular, attachTilt, observeReveals, countUp,
    mountBackground, injectRefractFilter, ready,
    notFound
  };

  return api;
})();