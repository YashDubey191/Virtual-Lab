/* ============================================================
   simulators.js — self-contained, plain-DOM simulators.

   Each one exposes:
     mount(stageEl, controlsEl, onChange)
     state()  → current physical state (used when recording a row)
     reset()  → back to defaults
     destroy() → cancel animation frames and drop listeners

   Only SVG + input[type=range]. No dependencies.
   ============================================================ */

window.VL = window.VL || {};
VL.simulators = (function () {
  'use strict';

  /* Tiny SVG helper. */
  const S = (tag, attrs = {}) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  /* Shared slider. */
  function slider({ label, min, max, step, value, unit = '', format = (v) => v }) {
    const wrap = document.createElement('div');
    wrap.className = 'slider';
    wrap.innerHTML =
      `<div class="slider__head">
         <span class="slider__label">${label}</span>
         <span class="slider__value tnum"></span>
       </div>
       <input class="range" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">`;
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('.slider__value');
    const paint = () => { out.textContent = format(Number(input.value)) + (unit ? ' ' + unit : ''); };
    paint();
    return {
      wrap, input, paint,
      get value() { return Number(input.value); },
      set value(v) { input.value = v; paint(); }
    };
  }

  /* Shared readout block. */
  function readout(rows) {
    const box = document.createElement('div');
    box.className = 'sim__readout';
    box.innerHTML = rows.map(r =>
      `<div class="readout-row">
         <span class="label">${r.label}</span>
         <span class="value ${r.small ? 'small ' : ''}tnum">${r.value != null ? r.value : ''}${r.unit ? ` <span class="unit">${r.unit}</span>` : ''}</span>
       </div>`
    ).join('');
    return box;
  }

  /* ----------------------------------------------------------
     1. Simple Pendulum
     ---------------------------------------------------------- */
  function createPendulum() {
    const g = 9.81;
    let L = 0.80;
    let theta = 0.32;
    let omega = 0;
    let last = 0;
    let raf = null;
    let onChange = () => {};
    let stage, controls, pivot, bob, string, arc, lengthLabel;
    let lenCtl, periodOut;

    const VB = { w: 400, h: 400 };
    const PIVOT = { x: 200, y: 44 };
    const PX_PER_M = 260;

    function period() { return 2 * Math.PI * Math.sqrt(L / g); }

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'Simple pendulum' });
      svg.style.maxHeight = '380px';

      const stand = S('g');
      stand.appendChild(S('line', { x1: 60, y1: PIVOT.y, x2: 340, y2: PIVOT.y, stroke: 'currentColor', 'stroke-width': 2, opacity: .25, 'stroke-linecap': 'round' }));
      stand.appendChild(S('line', { x1: 60, y1: PIVOT.y, x2: 60, y2: 380, stroke: 'currentColor', 'stroke-width': 2, opacity: .18, 'stroke-linecap': 'round' }));
      stand.appendChild(S('line', { x1: 40, y1: 380, x2: 360, y2: 380, stroke: 'currentColor', 'stroke-width': 2, opacity: .18, 'stroke-linecap': 'round' }));
      svg.appendChild(stand);

      arc = S('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1, opacity: .12 });
      svg.appendChild(arc);

      string = S('line', { stroke: 'currentColor', 'stroke-width': 2, opacity: .55, 'stroke-linecap': 'round' });
      svg.appendChild(string);
      pivot = S('circle', { cx: PIVOT.x, cy: PIVOT.y, r: 5, fill: 'currentColor', opacity: .8 });
      svg.appendChild(pivot);
      bob = S('circle', { r: 18, fill: 'var(--blue)' });
      bob.style.filter = 'drop-shadow(0 6px 12px rgba(0,122,255,.35))';
      svg.appendChild(bob);

      lengthLabel = S('text', { x: 14, y: VB.h - 16, fill: 'var(--ink-3)', 'font-size': 12, 'font-family': 'inherit' });
      svg.appendChild(lengthLabel);

      return svg;
    }

    function drawArc() {
      const Lp = L * PX_PER_M;
      const a0 = -Math.PI / 2 - 0.55;
      const a1 = -Math.PI / 2 + 0.55;
      const p0 = [PIVOT.x + Lp * Math.cos(a0), PIVOT.y + Lp * Math.sin(a0)];
      const p1 = [PIVOT.x + Lp * Math.cos(a1), PIVOT.y + Lp * Math.sin(a1)];
      arc.setAttribute('d', `M ${p0[0]} ${p0[1]} A ${Lp} ${Lp} 0 0 1 ${p1[0]} ${p1[1]}`);
    }

    function render() {
      const Lp = L * PX_PER_M;
      const bx = PIVOT.x + Lp * Math.sin(theta);
      const by = PIVOT.y + Lp * Math.cos(theta);
      string.setAttribute('x1', PIVOT.x);
      string.setAttribute('y1', PIVOT.y);
      string.setAttribute('x2', bx);
      string.setAttribute('y2', by);
      bob.setAttribute('cx', bx);
      bob.setAttribute('cy', by);
      lengthLabel.textContent = `L = ${L.toFixed(2)} m`;
    }

    function tick(t) {
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const alpha = -(g / L) * Math.sin(theta);
      omega += alpha * dt;
      theta += omega * dt;
      render();
      raf = requestAnimationFrame(tick);
    }

    function start() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';

      stage.appendChild(build());
      drawArc();
      render();

      lenCtl = slider({
        label: 'Length', min: 0.20, max: 1.20, step: 0.01, value: L,
        unit: 'm', format: (v) => v.toFixed(2)
      });
      lenCtl.input.addEventListener('input', () => {
        L = lenCtl.value; lenCtl.paint(); drawArc(); render(); paintReadout(); onChange();
      });
      controls.appendChild(lenCtl.wrap);

      const periodBox = document.createElement('div');
      periodBox.className = 'sim__readout';
      periodBox.innerHTML =
        `<div class="readout-row">
           <span class="label">Theoretical period</span>
           <span class="value tnum" data-period>0.00<span class="unit">s</span></span>
         </div>
         <div class="readout-row">
           <span class="label">Formula</span>
           <span class="value small">T = 2π √(L/g)</span>
         </div>
         <div class="readout-row">
           <span class="label">g</span>
           <span class="value small tnum">9.81 <span class="unit">m/s²</span></span>
         </div>`;
      controls.appendChild(periodBox);
      periodOut = periodBox.querySelector('[data-period]');

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn'; resetBtn.type = 'button';
      resetBtn.innerHTML = VL.icons.svg('refresh', { size: 16 }) + '<span>Restart swing</span>';
      resetBtn.addEventListener('click', () => { theta = 0.32; omega = 0; });
      btns.appendChild(resetBtn);
      controls.appendChild(btns);

      paintReadout();
      start();
    }

    function paintReadout() {
      if (periodOut) periodOut.firstChild.textContent = period().toFixed(2);
    }

    function state() {
      return { L: Number(L.toFixed(3)), T: Number(period().toFixed(3)) };
    }

    return {
      id: 'pendulum', mount, state,
      reset() { L = 0.80; theta = 0.32; omega = 0; if (lenCtl) lenCtl.value = 0.80; drawArc(); render(); paintReadout(); },
      destroy() { stop(); }
    };
  }

  /* ----------------------------------------------------------
     2. Ohm's Law circuit
     ---------------------------------------------------------- */
  function createOhm() {
    let V = 6;
    let R = 10;
    let dashOffset = 0;
    let raf = null;
    let last = 0;
    let onChange = () => {};
    let stage, controls, wirePath, currentPath, ampLabel, voltLabel, resLabel;
    let vCtl, rCtl, iOut, rShown;

    const VB = { w: 420, h: 280 };
    const PATH = 'M 60 220 L 60 80 L 360 80 L 360 220 Z';

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': "Ohm's law circuit" });
      svg.style.maxHeight = '300px';

      wirePath = S('path', { d: PATH, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, opacity: .28, 'stroke-linejoin': 'round' });
      svg.appendChild(wirePath);

      currentPath = S('path', {
        d: PATH, fill: 'none',
        stroke: 'var(--blue)',
        'stroke-width': 3,
        'stroke-dasharray': '6 14',
        'stroke-linecap': 'round'
      });
      svg.appendChild(currentPath);

      const bat = S('g');
      bat.appendChild(S('rect', { x: 46, y: 120, width: 28, height: 14, rx: 3, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      bat.appendChild(S('rect', { x: 46, y: 146, width: 28, height: 14, rx: 3, fill: 'currentColor', opacity: .9 }));
      svg.appendChild(bat);

      const amp = S('g');
      amp.appendChild(S('circle', { cx: 210, cy: 80, r: 18, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      ampLabel = S('text', { x: 210, y: 84, 'text-anchor': 'middle', fill: 'var(--ink-1)', 'font-size': 12, 'font-family': 'inherit', 'font-weight': 600 });
      ampLabel.textContent = 'A';
      amp.appendChild(ampLabel);
      svg.appendChild(amp);

      const res = S('g');
      res.appendChild(S('rect', { x: 340, y: 122, width: 40, height: 56, rx: 6, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      resLabel = S('text', { x: 360, y: 156, 'text-anchor': 'middle', fill: 'var(--ink-1)', 'font-size': 12, 'font-family': 'inherit', 'font-weight': 600 });
      resLabel.textContent = `${R}Ω`;
      res.appendChild(resLabel);
      svg.appendChild(res);

      const volt = S('g');
      volt.appendChild(S('path', { d: 'M 360 122 L 400 122 L 400 178 L 360 178', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, opacity: .35, 'stroke-linejoin': 'round' }));
      volt.appendChild(S('circle', { cx: 400, cy: 150, r: 16, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      voltLabel = S('text', { x: 400, y: 154, 'text-anchor': 'middle', fill: 'var(--ink-1)', 'font-size': 11, 'font-family': 'inherit', 'font-weight': 600 });
      voltLabel.textContent = `${V}V`;
      volt.appendChild(voltLabel);
      svg.appendChild(volt);

      return svg;
    }

    function tick(t) {
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const I = V / R;
      const speed = 60 + Math.min(600, I * 200);
      dashOffset -= speed * dt;
      currentPath.setAttribute('stroke-dashoffset', String(dashOffset));
      const dashLen = 4 + Math.min(10, I * 6);
      currentPath.setAttribute('stroke-dasharray', `${dashLen} ${26 - dashLen * 0.6}`);
      raf = requestAnimationFrame(tick);
    }

    function paintLabels() {
      if (ampLabel) ampLabel.textContent = (V / R).toFixed(2);
      if (voltLabel) voltLabel.textContent = `${V}V`;
      if (resLabel) resLabel.textContent = `${R}Ω`;
      if (iOut) iOut.textContent = (V / R).toFixed(2);
      if (rShown) rShown.textContent = R.toFixed(1);
      if (vCtl) vCtl.paint();
      if (rCtl) rCtl.paint();
    }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';
      stage.appendChild(build());

      vCtl = slider({ label: 'Voltage', min: 0, max: 12, step: 0.1, value: V, unit: 'V', format: (v) => v.toFixed(1) });
      vCtl.input.addEventListener('input', () => { V = vCtl.value; paintLabels(); onChange(); });
      controls.appendChild(vCtl.wrap);

      rCtl = slider({ label: 'Resistance', min: 1, max: 100, step: 0.5, value: R, unit: 'Ω', format: (v) => v.toFixed(1) });
      rCtl.input.addEventListener('input', () => { R = rCtl.value; paintLabels(); onChange(); });
      controls.appendChild(rCtl.wrap);

      const box = readout([
        { label: 'Current', value: '<span data-i>0.00</span>', unit: 'A' },
        { label: 'Resistance', value: '<span data-r>0.0</span>', unit: 'Ω', small: true },
        { label: 'Formula', value: 'I = V / R', small: true }
      ]);
      controls.appendChild(box);
      iOut = box.querySelector('[data-i]');
      rShown = box.querySelector('[data-r]');

      paintLabels();
      raf = requestAnimationFrame(tick);
    }

    function state() {
      return {
        V: Number(V.toFixed(2)),
        R: Number(R.toFixed(2)),
        I: Number((V / R).toFixed(3))
      };
    }

    return {
      id: 'ohm', mount, state,
      reset() { V = 6; R = 10; if (vCtl) vCtl.value = V; if (rCtl) rCtl.value = R; paintLabels(); },
      destroy() { if (raf) cancelAnimationFrame(raf); raf = null; }
    };
  }

  /* ----------------------------------------------------------
     3. Acid–Base Titration
     ---------------------------------------------------------- */
  function createTitration() {
    const ENDPOINT_ML = 20.0;
    const M_NAOH = 0.1;
    const V_HCL = 20.0;
    let added = 0;
    let onChange = () => {};
    let stage, controls;
    let buretteLevel, flaskFill, drop, volOut, colourLabel, concOut, mLOut;

    const VB = { w: 400, h: 380 };
    const BURETTE = { x: 200, top: 30, bottom: 200, innerTop: 44, innerBottom: 190 };

    function pinkness() {
      return Math.max(0, Math.min(1, (added - 19.4) / 1.0));
    }

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'Acid–base titration' });
      svg.style.maxHeight = '380px';

      svg.appendChild(S('rect', { x: BURETTE.x - 14, y: BURETTE.top, width: 28, height: BURETTE.bottom - BURETTE.top, rx: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, opacity: .55 }));
      buretteLevel = S('rect', {
        x: BURETTE.x - 11, y: BURETTE.innerTop, width: 22, height: BURETTE.innerBottom - BURETTE.innerTop,
        rx: 4, fill: 'rgba(10,132,255,.35)'
      });
      svg.appendChild(buretteLevel);

      svg.appendChild(S('line', { x1: BURETTE.x - 8, y1: BURETTE.bottom, x2: BURETTE.x + 8, y2: BURETTE.bottom, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .65 }));
      svg.appendChild(S('circle', { cx: BURETTE.x, cy: BURETTE.bottom + 8, r: 5, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      svg.appendChild(S('line', { x1: BURETTE.x, y1: BURETTE.bottom + 13, x2: BURETTE.x, y2: 240, stroke: 'currentColor', 'stroke-width': 1.5, opacity: .5 }));

      drop = S('ellipse', { cx: BURETTE.x, cy: 250, rx: 3, ry: 5, fill: 'rgba(10,132,255,.6)', opacity: 0 });
      svg.appendChild(drop);

      const flaskPath = 'M 150 260 L 250 260 L 275 340 Q 275 355 260 355 L 140 355 Q 125 355 125 340 Z';
      svg.appendChild(S('path', { d: flaskPath, fill: 'rgba(255,255,255,.30)', stroke: 'currentColor', 'stroke-width': 1.75, opacity: .55 }));

      flaskFill = S('path', {
        d: 'M 152 300 L 248 300 L 272 340 Q 272 353 258 353 L 142 353 Q 128 353 128 340 Z',
        fill: 'rgba(180, 220, 255, .35)'
      });
      svg.appendChild(flaskFill);

            colourLabel = S('text', { x: 200, y: 290, 'text-anchor': 'middle', fill: 'var(--ink-3)', 'font-size': 12, 'font-family': 'inherit' });

      volOut = S('text', { x: 240, y: BURETTE.bottom - 10, fill: 'var(--ink-3)', 'font-size': 13, 'font-family': 'inherit', 'font-weight': 500 });

      return svg;
    }

    function refresh() {
      const total = 50;
      const frac = Math.max(0, 1 - added / total);
      const h = (BURETTE.innerBottom - BURETTE.innerTop) * frac;
      buretteLevel.setAttribute('y', String(BURETTE.innerBottom - h));
      buretteLevel.setAttribute('height', String(h));

      const p = pinkness();
      const r = Math.round(180 + 60 * p);
      const g = Math.round(220 - 120 * p);
      const b = Math.round(255 - 140 * p);
      flaskFill.setAttribute('fill', `rgba(${r}, ${g}, ${b}, ${0.35 + 0.45 * p})`);

      if (colourLabel) {
        colourLabel.textContent = p < 0.05
          ? 'Colourless (acidic)'
          : p > 0.85
            ? 'Persistent pale pink — endpoint'
            : 'Faint pink appearing…';
      }
      if (volOut) volOut.textContent = `${added.toFixed(1)} mL NaOH added`;
      if (mLOut) mLOut.textContent = added.toFixed(1);
      if (concOut) {
        const est = added >= 19 ? (M_NAOH * added) / V_HCL : null;
        concOut.textContent = est ? est.toFixed(3) : '—';
      }
    }

    function dripAnimation() {
      if (VL.prefersReducedMotion()) return;
      drop.style.opacity = '1';
      drop.animate(
        [
          { transform: 'translateY(0)', opacity: 1 },
          { transform: 'translateY(24px)', opacity: 1 },
          { transform: 'translateY(40px)', opacity: 0 }
        ],
        { duration: 380, easing: 'cubic-bezier(.4,0,.8,1)' }
      ).finished.then(() => { drop.style.opacity = '0'; });
    }

    function setAdded(v) {
      const before = added;
      added = Math.max(0, Math.min(40, Number(v.toFixed(1))));
      refresh();
      if (added > before) dripAnimation();
      onChange();
    }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';
      stage.appendChild(build());

      const ctl = slider({
        label: 'NaOH added', min: 0, max: 40, step: 0.1, value: 0,
        unit: 'mL', format: (v) => v.toFixed(1)
      });
      ctl.input.addEventListener('input', () => setAdded(ctl.value));
      controls.appendChild(ctl.wrap);

      const quick = document.createElement('div');
      quick.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      const addHalf = document.createElement('button');
      addHalf.className = 'btn btn--sm'; addHalf.type = 'button';
      addHalf.textContent = 'Add 0.5 mL';
      addHalf.addEventListener('click', () => { setAdded(added + 0.5); ctl.value = added; });
      const reset = document.createElement('button');
      reset.className = 'btn btn--sm'; reset.type = 'button';
      reset.innerHTML = VL.icons.svg('refresh', { size: 14 }) + '<span>Refill burette</span>';
      reset.addEventListener('click', () => { setAdded(0); ctl.value = 0; });
      quick.appendChild(addHalf); quick.appendChild(reset);
      controls.appendChild(quick);

      const box = readout([
        { label: 'Volume added', value: '<span data-ml>0.0</span>', unit: 'mL' },
        { label: 'Estimated [HCl]', value: '<span data-c>—</span>', unit: 'M' },
        { label: 'NaOH (standard)', value: '0.100', unit: 'M', small: true },
        { label: 'HCl taken', value: '20.0', unit: 'mL', small: true }
      ]);
      controls.appendChild(box);
      mLOut = box.querySelector('[data-ml]');
      concOut = box.querySelector('[data-c]');

      refresh();
    }

    function state() {
      return {
        V: Number(added.toFixed(2)),
        M: added >= 19 ? Number(((M_NAOH * added) / V_HCL).toFixed(3)) : null
      };
    }

    return {
      id: 'titration', mount, state,
      reset() { setAdded(0); },
      destroy() { /* nothing */ }
    };
  }

  /* ----------------------------------------------------------
     4. Projectile Motion
     ---------------------------------------------------------- */
  function createProjectile() {
    const g = 9.81;
    let u = 20;         // m/s
    let angle = 45;     // degrees
    let raf = null;
    let last = 0;
    let tAnim = 0;
    let onChange = () => {};
    let stage, controls, ball, trail;
    let uCtl, aCtl, rangeOut, heightOut, timeOut;

    const VB = { w: 480, h: 320 };
    const GROUND = 280;
    const LAUNCH_X = 60;
    const WORLD_MAX_R = 220;                          // metres that fit on screen
    const PX_PER_M = (VB.w - 100) / WORLD_MAX_R;

    function range() { return u * u * Math.sin(2 * angle * Math.PI / 180) / g; }
    function maxHeight() { const s = Math.sin(angle * Math.PI / 180); return u * u * s * s / (2 * g); }
    function flightTime() { return 2 * u * Math.sin(angle * Math.PI / 180) / g; }

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'Projectile motion' });
      svg.style.maxHeight = '320px';

      svg.appendChild(S('line', { x1: 0, y1: GROUND, x2: VB.w, y2: GROUND, stroke: 'currentColor', 'stroke-width': 2, opacity: .3 }));
      svg.appendChild(S('rect', { x: LAUNCH_X - 6, y: GROUND - 18, width: 12, height: 18, rx: 2, fill: 'var(--ink-3)', opacity: .8 }));

      trail = S('path', { fill: 'none', stroke: 'var(--blue)', 'stroke-width': 2, opacity: .55 });
      svg.appendChild(trail);

      ball = S('circle', { cx: LAUNCH_X, cy: GROUND, r: 7, fill: 'var(--blue)' });
      ball.style.filter = 'drop-shadow(0 4px 8px rgba(0,122,255,.35))';
      svg.appendChild(ball);

      return svg;
    }

    function updateTrajectory() {
      const T = flightTime();
      const pts = [];
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const tt = (i / N) * T;
        const x = u * Math.cos(angle * Math.PI / 180) * tt;
        const y = u * Math.sin(angle * Math.PI / 180) * tt - 0.5 * g * tt * tt;
        pts.push([LAUNCH_X + x * PX_PER_M, GROUND - y * PX_PER_M]);
      }
      trail.setAttribute('d', pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '));
    }

    function paintReadout() {
      if (rangeOut) rangeOut.textContent = range().toFixed(1);
      if (heightOut) heightOut.textContent = maxHeight().toFixed(1);
      if (timeOut) timeOut.textContent = flightTime().toFixed(2);
      if (uCtl) uCtl.paint();
      if (aCtl) aCtl.paint();
    }

    function tick(t) {
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      tAnim += dt;
      const T = flightTime();
      if (tAnim > T + 0.6) tAnim = 0;
      const tNow = Math.min(tAnim, T);
      const x = u * Math.cos(angle * Math.PI / 180) * tNow;
      const y = u * Math.sin(angle * Math.PI / 180) * tNow - 0.5 * g * tNow * tNow;
      ball.setAttribute('cx', LAUNCH_X + x * PX_PER_M);
      ball.setAttribute('cy', GROUND - Math.max(0, y) * PX_PER_M);
      raf = requestAnimationFrame(tick);
    }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';
      stage.appendChild(build());

      uCtl = slider({ label: 'Launch speed', min: 5, max: 50, step: 1, value: u, unit: 'm/s', format: (v) => v.toFixed(0) });
      uCtl.input.addEventListener('input', () => { u = uCtl.value; updateTrajectory(); paintReadout(); tAnim = 0; onChange(); });
      controls.appendChild(uCtl.wrap);

      aCtl = slider({ label: 'Launch angle', min: 10, max: 85, step: 1, value: angle, unit: '°', format: (v) => v.toFixed(0) });
      aCtl.input.addEventListener('input', () => { angle = aCtl.value; updateTrajectory(); paintReadout(); tAnim = 0; onChange(); });
      controls.appendChild(aCtl.wrap);

      const box = readout([
        { label: 'Range', value: '<span data-r>0</span>', unit: 'm' },
        { label: 'Max height', value: '<span data-h>0</span>', unit: 'm' },
        { label: 'Flight time', value: '<span data-t>0</span>', unit: 's' },
        { label: 'Formula', value: 'R = u² sin(2θ) / g', small: true }
      ]);
      controls.appendChild(box);
      rangeOut = box.querySelector('[data-r]');
      heightOut = box.querySelector('[data-h]');
      timeOut = box.querySelector('[data-t]');

      updateTrajectory();
      paintReadout();
      raf = requestAnimationFrame(tick);
    }

    function state() {
      return {
        u: Number(u.toFixed(1)),
        angle: Number(angle.toFixed(1)),
        R: Number(range().toFixed(2))
      };
    }

    return {
      id: 'projectile', mount, state,
      reset() { u = 20; angle = 45; if (uCtl) uCtl.value = u; if (aCtl) aCtl.value = angle; updateTrajectory(); paintReadout(); },
      destroy() { if (raf) cancelAnimationFrame(raf); raf = null; }
    };
  }

  /* ----------------------------------------------------------
     5. Magnetic field around a straight wire
     ---------------------------------------------------------- */
  function createMagnetic() {
    const MU0 = 4 * Math.PI * 1e-7;
    let I = 5;   // A
    let r = 5;   // cm
    let dashOffset = 0;
    let raf = null;
    let last = 0;
    let onChange = () => {};
    let stage, controls, fieldGroup, wireArrow, bOut, iOut, rOut;

    const VB = { w: 420, h: 360 };
    const CENTER = { x: 210, y: 180 };

    function fieldStrengthT() {
      // B = μ₀ I / (2π r). r is in cm → convert to m.
      return MU0 * I / (2 * Math.PI * (r / 100));
    }

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'Magnetic field around a wire' });
      svg.style.maxHeight = '360px';

      // Concentric field rings (drawn in tick)
      fieldGroup = S('g');
      svg.appendChild(fieldGroup);

      // Vertical wire
      svg.appendChild(S('line', { x1: CENTER.x, y1: 40, x2: CENTER.x, y2: 320, stroke: 'currentColor', 'stroke-width': 3, opacity: .8, 'stroke-linecap': 'round' }));

      // Current-direction arrow
      wireArrow = S('path', { d: '', fill: 'none', stroke: 'var(--orange)', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      svg.appendChild(wireArrow);

      // Compass needle at a sample point
      svg.appendChild(S('circle', { cx: CENTER.x + 80, cy: CENTER.y, r: 4, fill: 'var(--ink-3)', opacity: .4 }));

      return svg;
    }

    function paintField() {
      fieldGroup.innerHTML = '';
      const rPx = (r / 15) * 140;                     // 2 cm → ~19 px, 15 cm → 140 px
      const B = fieldStrengthT();

      // Draw 4 rings whose radius scales with r
      for (let i = 1; i <= 4; i++) {
        const rad = rPx * (i / 2);
        if (rad > 160) continue;
        fieldGroup.appendChild(S('circle', {
          cx: CENTER.x, cy: CENTER.y, r: rad,
          fill: 'none',
          stroke: 'var(--blue)',
          'stroke-width': 1.6,
          'stroke-dasharray': '6 10',
          'stroke-dashoffset': String(dashOffset * (i % 2 ? 1 : -1)),
          opacity: Math.max(0.15, 0.9 - i * 0.18)
        }));
      }

      // Wire current arrow
      const up = I > 0;
      const ax = CENTER.x;
      const ay = up ? 60 : 300;
      const dir = up ? -1 : 1;
      wireArrow.setAttribute('d', `M ${ax - 8} ${ay - dir * -10} L ${ax} ${ay} L ${ax + 8} ${ay - dir * -10}`);

      if (bOut) bOut.textContent = (B * 1000).toFixed(3);
      if (iOut) iOut.textContent = I.toFixed(1);
      if (rOut) rOut.textContent = r.toFixed(1);
    }

    function tick(t) {
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      // Flow speed scales with current
      dashOffset -= (I * 12) * dt;
      paintField();
      raf = requestAnimationFrame(tick);
    }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';
      stage.appendChild(build());

      const iCtl = slider({ label: 'Current', min: 1, max: 20, step: 0.5, value: I, unit: 'A', format: (v) => v.toFixed(1) });
      iCtl.input.addEventListener('input', () => { I = iCtl.value; paintField(); onChange(); });
      controls.appendChild(iCtl.wrap);

      const rCtl = slider({ label: 'Distance from wire', min: 2, max: 15, step: 0.5, value: r, unit: 'cm', format: (v) => v.toFixed(1) });
      rCtl.input.addEventListener('input', () => { r = rCtl.value; paintField(); onChange(); });
      controls.appendChild(rCtl.wrap);

      const box = readout([
        { label: 'Field B', value: '<span data-b>0</span>', unit: 'mT' },
        { label: 'Current I', value: '<span data-i>0</span>', unit: 'A', small: true },
        { label: 'Distance r', value: '<span data-r>0</span>', unit: 'cm', small: true },
        { label: 'Formula', value: 'B = μ₀ I / (2π r)', small: true }
      ]);
      controls.appendChild(box);
      bOut = box.querySelector('[data-b]');
      iOut = box.querySelector('[data-i]');
      rOut = box.querySelector('[data-r]');

      paintField();
      raf = requestAnimationFrame(tick);
    }

    function state() {
      return {
        I: Number(I.toFixed(2)),
        r: Number(r.toFixed(1)),
        B: Number((fieldStrengthT() * 1000).toFixed(3))   // mT
      };
    }

    return {
      id: 'magnetic', mount, state,
      reset() { I = 5; r = 5; paintField(); },
      destroy() { if (raf) cancelAnimationFrame(raf); raf = null; }
    };
  }

  /* ----------------------------------------------------------
     6. Convex Lens
     ---------------------------------------------------------- */
  function createLens() {
    let u = 40;   // cm (object distance)
    let f = 15;   // cm (focal length, fixed)
    let onChange = () => {};
    let stage, controls;
    let objGroup, imgGroup, lens, axes, rayGroup, vOut, mOut;

    const VB = { w: 520, h: 320 };
    const AXIS_Y = 160;
    const LENS_X = 260;
    const PX_PER_CM = 4;                     // 40 cm = 160 px each side — fits nicely

    function v() {
      // Thin lens: 1/f = 1/v + 1/u → v = u·f / (u − f)
      if (Math.abs(u - f) < 0.01) return Infinity;
      return (u * f) / (u - f);
    }
    function mag() {
      const vv = v();
      if (!isFinite(vv)) return Infinity;
      return -vv / u;
    }

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'Convex lens image formation' });
      svg.style.maxHeight = '320px';

      // Principal axis
      svg.appendChild(S('line', { x1: 20, y1: AXIS_Y, x2: VB.w - 20, y2: AXIS_Y, stroke: 'currentColor', 'stroke-width': 1, opacity: .3 }));

      // Lens (a vertical ellipse)
      lens = S('ellipse', { cx: LENS_X, cy: AXIS_Y, rx: 14, ry: 90, fill: 'rgba(10,132,255,.10)', stroke: 'var(--blue)', 'stroke-width': 2 });
      svg.appendChild(lens);

      // Focal points
      [-1, 1].forEach(sgn => {
        svg.appendChild(S('circle', { cx: LENS_X + sgn * f * PX_PER_CM, cy: AXIS_Y, r: 3, fill: 'var(--ink-3)' }));
        svg.appendChild(S('text', {
          x: LENS_X + sgn * f * PX_PER_CM, y: AXIS_Y + 18,
          'text-anchor': 'middle', fill: 'var(--ink-3)', 'font-size': 11, 'font-family': 'inherit'
        })).textContent = sgn < 0 ? 'F' : "F'";
      });

      rayGroup = S('g'); svg.appendChild(rayGroup);
      objGroup = S('g'); svg.appendChild(objGroup);
      imgGroup = S('g'); svg.appendChild(imgGroup);

      return svg;
    }

    function arrow(grp, x, height, colour) {
      grp.innerHTML = '';
      grp.appendChild(S('line', {
        x1: x, y1: AXIS_Y, x2: x, y2: AXIS_Y - height,
        stroke: colour, 'stroke-width': 3, 'stroke-linecap': 'round'
      }));
      grp.appendChild(S('path', {
        d: `M ${x - 6} ${AXIS_Y - height + 10} L ${x} ${AXIS_Y - height} L ${x + 6} ${AXIS_Y - height + 10}`,
        fill: 'none', stroke: colour, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }));
    }

    function paint() {
      // Object (always real, upright, on the left)
      const objX = LENS_X - u * PX_PER_CM;
      const objH = 40;                              // visual object height (px)
      arrow(objGroup, objX, objH, 'var(--blue)');

      const vv = v();
      imgGroup.innerHTML = '';
      rayGroup.innerHTML = '';

      if (!isFinite(vv)) {
        // Object at F — outgoing rays parallel
        rayGroup.appendChild(S('line', { x1: objX, y1: AXIS_Y - objH, x2: LENS_X, y2: AXIS_Y - objH, stroke: 'var(--orange)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }));
        rayGroup.appendChild(S('line', { x1: LENS_X, y1: AXIS_Y - objH, x2: VB.w - 20, y2: AXIS_Y - objH, stroke: 'var(--orange)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }));
        if (vOut) vOut.textContent = '∞';
        if (mOut) mOut.textContent = '∞';
        return;
      }

      const imgX = LENS_X + vv * PX_PER_CM;
      const m = -vv / u;                            // real-inverted → negative
      const imgH = objH * m;                        // negative m → below axis

      // Three principal rays from object tip
      // Ray 1: parallel to axis → through F' on the far side
      rayGroup.appendChild(S('line', {
        x1: objX, y1: AXIS_Y - objH, x2: LENS_X, y2: AXIS_Y - objH,
        stroke: 'var(--orange)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4'
      }));
      rayGroup.appendChild(S('line', {
        x1: LENS_X, y1: AXIS_Y - objH,
        x2: imgX, y2: AXIS_Y - imgH,
        stroke: 'var(--orange)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4'
      }));

      // Ray 2: through optical centre → straight
      rayGroup.appendChild(S('line', {
        x1: objX, y1: AXIS_Y - objH, x2: imgX, y2: AXIS_Y - imgH,
        stroke: 'var(--purple)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4'
      }));

      // Image
      if (imgH !== 0) {
        arrow(imgGroup, imgX, imgH, 'var(--green)');
        // Mark dashed base
        imgGroup.appendChild(S('line', {
          x1: imgX, y1: AXIS_Y, x2: imgX, y2: AXIS_Y - imgH,
          stroke: 'var(--green)', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: .85
        }));
        imgGroup.innerHTML = '';
        imgGroup.appendChild(S('line', { x1: imgX, y1: AXIS_Y, x2: imgX, y2: AXIS_Y - imgH, stroke: 'var(--green)', 'stroke-width': 3, 'stroke-linecap': 'round' }));
        imgGroup.appendChild(S('path', {
          d: `M ${imgX - 6} ${AXIS_Y - imgH + (imgH < 0 ? -10 : 10)} L ${imgX} ${AXIS_Y - imgH} L ${imgX + 6} ${AXIS_Y - imgH + (imgH < 0 ? -10 : 10)}`,
          fill: 'none', stroke: 'var(--green)', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
        }));
      }

      if (vOut) vOut.textContent = vv.toFixed(1);
      if (mOut) mOut.textContent = m.toFixed(2);
    }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';
      stage.appendChild(build());

      const uCtl = slider({ label: 'Object distance u', min: 20, max: 60, step: 1, value: u, unit: 'cm', format: (vv) => vv.toFixed(0) });
      uCtl.input.addEventListener('input', () => { u = uCtl.value; paint(); onChange(); });
      controls.appendChild(uCtl.wrap);

      const box = readout([
        { label: 'Image distance v', value: '<span data-v>0</span>', unit: 'cm' },
        { label: 'Magnification m', value: '<span data-m>0</span>' },
        { label: 'Focal length f', value: '15.0', unit: 'cm', small: true },
        { label: 'Formula', value: '1/f = 1/v + 1/u', small: true }
      ]);
      controls.appendChild(box);
      vOut = box.querySelector('[data-v]');
      mOut = box.querySelector('[data-m]');

      paint();
    }

    function state() {
      const vv = v();
      return {
        u: Number(u.toFixed(1)),
        f: Number(f.toFixed(1)),
        v: isFinite(vv) ? Number(vv.toFixed(2)) : null,
        m: isFinite(vv) ? Number((vv / u).toFixed(3)) : null
      };
    }

    return {
      id: 'lens', mount, state,
      reset() { u = 40; paint(); },
      destroy() { /* nothing */ }
    };
  }

  /* ----------------------------------------------------------
     7. pH Testing with universal indicator
     ---------------------------------------------------------- */
  function createPh() {
    const SOLUTIONS = [
      { name: 'Lemon juice',    pH: 2.2, colour: '#e63a2a' },
      { name: 'Vinegar',        pH: 2.9, colour: '#ea6f2a' },
      { name: 'Black coffee',   pH: 5.0, colour: '#e0b625' },
      { name: 'Milk',           pH: 6.6, colour: '#d3d34a' },
      { name: 'Pure water',     pH: 7.0, colour: '#4ea64e' },
      { name: 'Seawater',       pH: 8.2, colour: '#2f9d94' },
      { name: 'Baking soda',    pH: 8.6, colour: '#2478b8' },
      { name: 'Soap solution',  pH: 10.5, colour: '#5b4fbf' },
      { name: 'Bleach',         pH: 12.5, colour: '#7a34a0' }
    ];
    let idx = 4;                       // default: pure water
    let onChange = () => {};
    let stage, controls;
    let liquidRect, scaleMarker, phOut, nameOut, colourOut;

    const VB = { w: 420, h: 320 };
    const BEAKER = { x: 90, y: 140, w: 240, h: 140 };
    const SCALE = { x: 30, y: 30, w: 360, h: 30 };

    function current() { return SOLUTIONS[idx]; }

    function phColour(pH) {
      // Simple but smooth universal-indicator colour ramp.
      const stops = [
        { p: 1,  c: [230, 58, 42] },
        { p: 3,  c: [234, 111, 42] },
        { p: 5,  c: [224, 182, 37] },
        { p: 7,  c: [78, 166, 78] },
        { p: 9,  c: [47, 157, 148] },
        { p: 11, c: [36, 120, 184] },
        { p: 13, c: [122, 52, 160] }
      ];
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (pH >= a.p && pH <= b.p) {
          const t = (pH - a.p) / (b.p - a.p);
          return `rgb(${Math.round(a.c[0] + (b.c[0] - a.c[0]) * t)}, ${Math.round(a.c[1] + (b.c[1] - a.c[1]) * t)}, ${Math.round(a.c[2] + (b.c[2] - a.c[2]) * t)})`;
        }
      }
      return pH < 1 ? 'rgb(230,58,42)' : 'rgb(122,52,160)';
    }

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'pH scale and beaker' });
      svg.style.maxHeight = '320px';

      // pH scale bar (gradient)
      const defs = S('defs');
      const grad = S('linearGradient', { id: 'ph-gradient', x1: 0, y1: 0, x2: 1, y2: 0 });
      for (let p = 1; p <= 13; p += 1) {
        grad.appendChild(S('stop', { offset: `${(p - 1) / 12 * 100}%`, 'stop-color': phColour(p) }));
      }
      defs.appendChild(grad); svg.appendChild(defs);
      svg.appendChild(S('rect', { x: SCALE.x, y: SCALE.y, width: SCALE.w, height: SCALE.h, rx: 6, fill: 'url(#ph-gradient)' }));

      // pH ticks
      for (let p = 1; p <= 14; p++) {
        const x = SCALE.x + (p - 1) / 13 * SCALE.w;
        svg.appendChild(S('text', {
          x, y: SCALE.y + SCALE.h + 14, 'text-anchor': 'middle',
          'font-size': 10, 'font-family': 'inherit', fill: 'var(--ink-3)'
        })).textContent = String(p);
      }

      // Marker
      scaleMarker = S('polygon', {
        points: '', fill: 'var(--ink-1)'
      });
      svg.appendChild(scaleMarker);

      // Beaker outline
      svg.appendChild(S('path', {
        d: `M ${BEAKER.x} ${BEAKER.y - 20} L ${BEAKER.x} ${BEAKER.y + BEAKER.h} L ${BEAKER.x + BEAKER.w} ${BEAKER.y + BEAKER.h} L ${BEAKER.x + BEAKER.w} ${BEAKER.y - 20}`,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2, opacity: .55, 'stroke-linejoin': 'round'
      }));

      // Liquid fill
      liquidRect = S('rect', {
        x: BEAKER.x + 6, y: BEAKER.y + 20,
        width: BEAKER.w - 12, height: BEAKER.h - 26,
        rx: 4, fill: 'rgba(78,166,78,0.6)'
      });
      svg.appendChild(liquidRect);

      return svg;
    }

    function paint() {
      const sol = current();
      const col = phColour(sol.pH);

      // Beaker liquid
      liquidRect.setAttribute('fill', col);
      liquidRect.setAttribute('opacity', '0.7');

      // Marker triangle pointing down at current pH
      const pct = Math.max(0, Math.min(1, (sol.pH - 1) / 13));
      const x = SCALE.x + pct * SCALE.w;
      const y = SCALE.y - 2;
      scaleMarker.setAttribute('points', `${x - 6},${y - 10} ${x + 6},${y - 10} ${x},${y}`);

      if (phOut) phOut.textContent = sol.pH.toFixed(1);
      if (nameOut) nameOut.textContent = sol.name;
      if (colourOut) {
        const label = sol.pH < 3 ? 'Strong red'
                    : sol.pH < 5 ? 'Orange'
                    : sol.pH < 6.5 ? 'Yellow'
                    : sol.pH < 7.5 ? 'Green'
                    : sol.pH < 9 ? 'Blue-green'
                    : sol.pH < 11 ? 'Blue'
                    : 'Purple';
        colourOut.textContent = label;
      }
    }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';
      stage.appendChild(build());

      const sliderWrap = document.createElement('div');
      sliderWrap.className = 'slider';
      sliderWrap.innerHTML = `
        <div class="slider__head">
          <span class="slider__label">Select Solution</span>
          <span class="slider__value tnum" id="ph-sol-name">${SOLUTIONS[idx].name}</span>
        </div>
        <input class="range" type="range" min="0" max="${SOLUTIONS.length - 1}" step="1" value="${idx}" aria-label="Choose a solution">
      `;
      const sliderInput = sliderWrap.querySelector('input');
      const sliderName = sliderWrap.querySelector('#ph-sol-name');
      
      sliderInput.addEventListener('input', () => {
        idx = Number(sliderInput.value);
        sliderName.textContent = SOLUTIONS[idx].name;
        paint();
        onChange();
      });
      controls.appendChild(sliderWrap);

      const box = readout([
        { label: 'Selected solution', value: '<span data-n>Pure water</span>', small: true },
        { label: 'pH', value: '<span data-p>7.0</span>' },
        { label: 'Indicator colour', value: '<span data-c>Green</span>', small: true },
        { label: 'Formula', value: 'pH = −log₁₀[H⁺]', small: true }
      ]);
      controls.appendChild(box);
      nameOut = box.querySelector('[data-n]');
      phOut = box.querySelector('[data-p]');
      colourOut = box.querySelector('[data-c]');

      paint();
    }

    function state() {
      const sol = current();
      return {
        solution: sol.name,
        pH: Number(sol.pH.toFixed(1))
      };
    }

    return {
      id: 'ph', mount, state,
      reset() { idx = 4; paint(); },
      destroy() { /* nothing */ }
    };
  }
    /* ----------------------------------------------------------
     8. Refraction — Snell's Law
     ---------------------------------------------------------- */
  function createRefraction() {
    const n1 = 1.00;   // air
    const n2 = 1.50;   // glass (crown glass, typical)
    let i = 30;        // degrees
    let onChange = () => {};
    let stage, controls;
    let incidentRay, refractedRay, reflectedRay, angleLabel;
    let iOut, rOut;

    const VB = { w: 400, h: 320 };
    const INTERFACE_Y = 160;
    const ORIGIN = { x: 200, y: INTERFACE_Y };
    const RAY_LEN = 130;

    function r() {
      const sinR = (n1 * Math.sin(i * Math.PI / 180)) / n2;
      if (sinR > 1) return null;
      return Math.asin(sinR) * 180 / Math.PI;
    }

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'Refraction at an air–glass boundary' });
      svg.style.maxHeight = '320px';

      // Upper medium: air (very subtle wash)
      svg.appendChild(S('rect', { x: 0, y: 0, width: VB.w, height: INTERFACE_Y, fill: 'var(--fill-1)', opacity: .35 }));
      // Lower medium: glass (blue wash)
      svg.appendChild(S('rect', { x: 0, y: INTERFACE_Y, width: VB.w, height: VB.h - INTERFACE_Y, fill: 'var(--blue-soft)', opacity: .55 }));

      // Interface
      svg.appendChild(S('line', { x1: 0, y1: INTERFACE_Y, x2: VB.w, y2: INTERFACE_Y, stroke: 'currentColor', 'stroke-width': 2, opacity: .55 }));

      // Normal (dashed vertical)
      svg.appendChild(S('line', { x1: ORIGIN.x, y1: 15, x2: ORIGIN.x, y2: VB.h - 15, stroke: 'currentColor', 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: .35 }));

      // Reflected ray (weak, dashed, upper-right)
      reflectedRay = S('line', { stroke: 'var(--ink-3)', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: .5 });
      svg.appendChild(reflectedRay);

      // Incident ray (orange, from upper-left)
      incidentRay = S('line', { stroke: 'var(--orange)', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
      svg.appendChild(incidentRay);

      // Refracted ray (blue, into the glass)
      refractedRay = S('line', { stroke: 'var(--blue)', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
      svg.appendChild(refractedRay);

      // Medium labels
      const airLabel = S('text', { x: 12, y: 22, fill: 'var(--ink-3)', 'font-size': 11, 'font-family': 'inherit' });
      airLabel.textContent = 'Air · n₁ = 1.00';
      svg.appendChild(airLabel);

      const glassLabel = S('text', { x: 12, y: VB.h - 10, fill: 'var(--ink-3)', 'font-size': 11, 'font-family': 'inherit' });
      glassLabel.textContent = 'Glass · n₂ = 1.50';
      svg.appendChild(glassLabel);

      // Live angle label near the origin
      angleLabel = S('text', { x: ORIGIN.x + 55, y: INTERFACE_Y - 22, fill: 'var(--ink-2)', 'font-size': 12, 'font-family': 'inherit', 'font-weight': 600 });
      svg.appendChild(angleLabel);

      return svg;
    }

    function paint() {
      const rVal = r();
      const iRad = i * Math.PI / 180;

      const startX = ORIGIN.x - Math.sin(iRad) * RAY_LEN;
      const startY = ORIGIN.y - Math.cos(iRad) * RAY_LEN;
      incidentRay.setAttribute('x1', startX);
      incidentRay.setAttribute('y1', startY);
      incidentRay.setAttribute('x2', ORIGIN.x);
      incidentRay.setAttribute('y2', ORIGIN.y);

      const refX = ORIGIN.x + Math.sin(iRad) * RAY_LEN;
      const refY = ORIGIN.y - Math.cos(iRad) * RAY_LEN;
      reflectedRay.setAttribute('x1', ORIGIN.x);
      reflectedRay.setAttribute('y1', ORIGIN.y);
      reflectedRay.setAttribute('x2', refX);
      reflectedRay.setAttribute('y2', refY);

      if (rVal == null) {
        refractedRay.setAttribute('x1', 0);
        refractedRay.setAttribute('y1', 0);
        refractedRay.setAttribute('x2', 0);
        refractedRay.setAttribute('y2', 0);
      } else {
        const rRad = rVal * Math.PI / 180;
        refractedRay.setAttribute('x1', ORIGIN.x);
        refractedRay.setAttribute('y1', ORIGIN.y);
        refractedRay.setAttribute('x2', ORIGIN.x + Math.sin(rRad) * RAY_LEN);
        refractedRay.setAttribute('y2', ORIGIN.y + Math.cos(rRad) * RAY_LEN);
      }

      if (angleLabel) angleLabel.textContent = `${i.toFixed(0)}°  →  ${rVal == null ? '—' : rVal.toFixed(1) + '°'}`;
      if (iOut) iOut.textContent = i.toFixed(1);
      if (rOut) rOut.textContent = rVal == null ? '—' : rVal.toFixed(2);
    }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';
      stage.appendChild(build());

      const iCtl = slider({ label: 'Angle of incidence', min: 0, max: 80, step: 1, value: i, unit: '°', format: (v) => v.toFixed(0) });
      iCtl.input.addEventListener('input', () => { i = iCtl.value; paint(); onChange(); });
      controls.appendChild(iCtl.wrap);

      const box = readout([
        { label: 'Incident angle i', value: '<span data-i>30</span>', unit: '°', small: true },
        { label: 'Refracted angle r', value: '<span data-r>—</span>', unit: '°' },
        { label: 'n₂ / n₁', value: '1.50', small: true },
        { label: 'Formula', value: 'n₁ sin i = n₂ sin r', small: true }
      ]);
      controls.appendChild(box);
      iOut = box.querySelector('[data-i]');
      rOut = box.querySelector('[data-r]');

      paint();
    }

    function state() {
      const rVal = r();
      return {
        i: Number(i.toFixed(1)),
        r: rVal == null ? null : Number(rVal.toFixed(2)),
        sinI: Number(Math.sin(i * Math.PI / 180).toFixed(4)),
        sinR: rVal == null ? null : Number(Math.sin(rVal * Math.PI / 180).toFixed(4))
      };
    }

    return {
      id: 'refraction', mount, state,
      reset() { i = 30; paint(); },
      destroy() { /* nothing to cancel */ }
    };
  }

  /* ----------------------------------------------------------
     9. Flame Test
     ---------------------------------------------------------- */
  function createFlame() {
    const METALS = [
      { symbol: 'Li', name: 'Lithium',   colour: '#e3170a', label: 'Crimson red',     nm: 670 },
      { symbol: 'Na', name: 'Sodium',    colour: '#ffb400', label: 'Golden yellow',   nm: 589 },
      { symbol: 'K',  name: 'Potassium', colour: '#b47aff', label: 'Lilac / violet',  nm: 766 },
      { symbol: 'Ca', name: 'Calcium',   colour: '#f26419', label: 'Brick red',       nm: 622 },
      { symbol: 'Cu', name: 'Copper',    colour: '#00b894', label: 'Blue-green',      nm: 510 },
      { symbol: 'Ba', name: 'Barium',    colour: '#7bc950', label: 'Apple green',     nm: 524 },
      { symbol: 'Sr', name: 'Strontium', colour: '#f8285a', label: 'Crimson',         nm: 606 }
    ];
    let idx = 1;  // Na default
    let onChange = () => {};
    let stage, controls;
    let flameGroup, metalLabel, mOut, cOut, nmOut;

    function current() { return METALS[idx]; }

    const VB = { w: 300, h: 320 };
    const FLAME_X = 150;
    const FLAME_Y = 260;

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'Flame test' });
      svg.style.maxHeight = '320px';

      // Burner base
      svg.appendChild(S('rect', { x: 110, y: 260, width: 80, height: 40, rx: 4, fill: 'var(--ink-3)', opacity: .5 }));
      svg.appendChild(S('rect', { x: 130, y: 240, width: 40, height: 20, rx: 3, fill: 'var(--ink-3)', opacity: .85 }));

      // Flame container (redrawn in paint)
      flameGroup = S('g');
      svg.appendChild(flameGroup);

      // Wire loop with metal ball
      svg.appendChild(S('line', { x1: 60, y1: 80, x2: 120, y2: 140, stroke: 'var(--ink-3)', 'stroke-width': 1.5 }));
      svg.appendChild(S('circle', { cx: 120, cy: 140, r: 5, fill: 'var(--ink-4)' }));

      metalLabel = S('text', { x: 50, y: 60, fill: 'var(--ink-2)', 'font-size': 13, 'font-family': 'inherit', 'font-weight': 600 });
      metalLabel.textContent = 'Na';
      svg.appendChild(metalLabel);

      return svg;
    }

    function paint() {
      const m = current();
      flameGroup.innerHTML = '';

            const outer = S('path', {
        class: 'flame-fire',
        d: `M ${FLAME_X} ${FLAME_Y - 180} Q ${FLAME_X - 50} ${FLAME_Y - 100} ${FLAME_X - 35} ${FLAME_Y - 40} Q ${FLAME_X - 25} ${FLAME_Y - 10} ${FLAME_X} ${FLAME_Y} Q ${FLAME_X + 25} ${FLAME_Y - 10} ${FLAME_X + 35} ${FLAME_Y - 40} Q ${FLAME_X + 50} ${FLAME_Y - 100} ${FLAME_X} ${FLAME_Y - 180} Z`,
        fill: m.colour,
        opacity: .85
      });
      flameGroup.appendChild(outer);

      const inner = S('path', {
        class: 'flame-fire-inner',
        d: `M ${FLAME_X} ${FLAME_Y - 110} Q ${FLAME_X - 20} ${FLAME_Y - 60} ${FLAME_X - 14} ${FLAME_Y - 25} Q ${FLAME_X - 10} ${FLAME_Y - 8} ${FLAME_X} ${FLAME_Y} Q ${FLAME_X + 10} ${FLAME_Y - 8} ${FLAME_X + 14} ${FLAME_Y - 25} Q ${FLAME_X + 20} ${FLAME_Y - 60} ${FLAME_X} ${FLAME_Y - 110} Z`,
        fill: '#ffffff',
        opacity: .4
      });
      flameGroup.appendChild(inner);

      
      flameGroup.appendChild(inner);

      if (metalLabel) metalLabel.textContent = m.symbol;
      if (mOut) mOut.textContent = m.symbol;
      if (cOut) cOut.textContent = m.label;
      if (nmOut) nmOut.textContent = m.nm;
    }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl; controls = controlsEl;
      stage.innerHTML = ''; controls.innerHTML = '';
      stage.appendChild(build());

      const sel = document.createElement('select');
      sel.className = 'select';
      sel.setAttribute('aria-label', 'Choose a metal salt');
      sel.innerHTML = METALS.map((m, i) => `<option value="${i}"${i === idx ? ' selected' : ''}>${m.name} (${m.symbol})</option>`).join('');
      sel.addEventListener('change', () => { idx = Number(sel.value); paint(); onChange(); });
      controls.appendChild(sel);
            // Fix dropdown option text color in dark mode
      sel.style.color = 'var(--ink-1)';
      sel.style.backgroundColor = 'var(--surface-1)';

      const box = readout([
        { label: 'Metal', value: '<span data-m>Na</span>', small: true },
        { label: 'Flame colour', value: '<span data-c>Golden yellow</span>' },
        { label: 'Wavelength', value: '<span data-w>589</span>', unit: 'nm', small: true },
        { label: 'Formula', value: 'E = hc / λ', small: true }
      ]);
      controls.appendChild(box);

      mOut = box.querySelector('[data-m]');
      cOut = box.querySelector('[data-c]');
      nmOut = box.querySelector('[data-w]');

      paint();
    }

    function state() {
      const m = current();
      return { metal: m.symbol, name: m.name, colour: m.label, wavelength: m.nm };
    }

    return {
      id: 'flame', mount, state,
      reset() { idx = 1; paint(); },
      destroy() { /* nothing to cancel */ }
    };
  }

  /* ----------------------------------------------------------
     Registry
     ---------------------------------------------------------- */
    const registry = {
    pendulum:   createPendulum,
    ohm:        createOhm,
    titration:  createTitration,
    projectile: createProjectile,
    magnetic:   createMagnetic,
    lens:       createLens,
    ph:         createPh,
    refraction: createRefraction,
    flame:      createFlame
  };
  function get(id) {
    const make = registry[id];
    return make ? make() : null;
  }

  return { get, registry };
})();