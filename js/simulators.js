/* ============================================================
   simulators.js — three self-contained, plain-DOM simulators.
   Each one exposes:
     mount(stageEl, controlsEl, onChange)
     state()  → current physical state (used when recording a row)
     reset()  → back to defaults
     destroy() → cancel animation frames and drop listeners

   They only touch SVG + input[type=range]. No dependencies.
   ============================================================ */

window.VL = window.VL || {};
VL.simulators = (function () {
  'use strict';

  /* A tiny SVG helper. */
  const S = (tag, attrs = {}) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  /* ----------------------------------------------------------
     Shared slider component
     ---------------------------------------------------------- */
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
    return { wrap, input, paint, get value() { return Number(input.value); }, set value(v) { input.value = v; paint(); } };
  }

  /* ----------------------------------------------------------
     1. Simple Pendulum
     ---------------------------------------------------------- */
  function createPendulum() {
    const g = 9.81;
    let L = 0.80;          // metres
    let theta = 0.32;      // radians (about 18°)
    let omega = 0;         // angular velocity, rad/s
    let last = 0;
    let raf = null;
    let listening = true;
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

      // Stand
      const stand = S('g');
      stand.appendChild(S('line', { x1: 60, y1: PIVOT.y, x2: 340, y2: PIVOT.y, stroke: 'currentColor', 'stroke-width': 2, opacity: .25, 'stroke-linecap': 'round' }));
      stand.appendChild(S('line', { x1: 60, y1: PIVOT.y, x2: 60, y2: 380, stroke: 'currentColor', 'stroke-width': 2, opacity: .18, 'stroke-linecap': 'round' }));
      stand.appendChild(S('line', { x1: 40, y1: 380, x2: 360, y2: 380, stroke: 'currentColor', 'stroke-width': 2, opacity: .18, 'stroke-linecap': 'round' }));
      svg.appendChild(stand);

      // Swing arc guide
      arc = S('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1, opacity: .12 });
      svg.appendChild(arc);

      // String + bob + pivot
      string = S('line', { stroke: 'currentColor', 'stroke-width': 2, opacity: .55, 'stroke-linecap': 'round' });
      svg.appendChild(string);
      pivot = S('circle', { cx: PIVOT.x, cy: PIVOT.y, r: 5, fill: 'currentColor', opacity: .8 });
      svg.appendChild(pivot);
      bob = S('circle', { r: 18, fill: 'var(--blue)' });
      bob.style.filter = 'drop-shadow(0 6px 12px rgba(0,122,255,.35))';
      svg.appendChild(bob);

      // Length label
      lengthLabel = S('text', { x: 14, y: VB.h - 16, fill: 'var(--ink-3)', 'font-size': 12, 'font-family': 'inherit' });
      svg.appendChild(lengthLabel);

      return svg;
    }

    function drawArc() {
      // Draw an arc of radius L_px spanning ±0.55 rad so it stays on screen.
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

      // Nonlinear pendulum: θ'' = −(g/L)·sinθ
      const alpha = -(g / L) * Math.sin(theta);
      omega += alpha * dt;
      theta += omega * dt;

      render();
      raf = requestAnimationFrame(tick);
    }

    function start() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
    function stop()  { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    function mount(stageEl, controlsEl, cb) {
      onChange = cb || (() => {});
      stage = stageEl;
      controls = controlsEl;
      stage.innerHTML = '';
      controls.innerHTML = '';

      stage.appendChild(build());
      drawArc();
      render();

      lenCtl = slider({
        label: 'Length', min: 0.20, max: 1.20, step: 0.01, value: L,
        unit: 'm', format: (v) => v.toFixed(2)
      });
      lenCtl.input.addEventListener('input', () => {
        L = lenCtl.value;
        lenCtl.paint();
        drawArc();
        render();
        paintReadout();
        onChange();
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
      resetBtn.className = 'btn';
      resetBtn.type = 'button';
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
      id: 'pendulum',
      mount,
      state,
      reset() { L = 0.80; theta = 0.32; omega = 0; if (lenCtl) { lenCtl.value = 0.80; } drawArc(); render(); paintReadout(); },
      destroy() { stop(); }
    };
  }

  /* ----------------------------------------------------------
     2. Ohm's Law circuit
     ---------------------------------------------------------- */
  function createOhm() {
    let V = 6;       // volts
    let R = 10;      // ohms
    let dashOffset = 0;
    let raf = null;
    let last = 0;
    let onChange = () => {};
    let stage, controls, wirePath, currentPath, ampLabel, voltLabel, resLabel;
    let vCtl, rCtl, iOut, rShown;

    const VB = { w: 420, h: 280 };

    // A closed rectangular circuit path, clockwise from the battery.
    // (60,80) top-left  →  (360,80) top-right  →  (360,220)  →  (60,220)  →  back
    const PATH = 'M 60 220 L 60 80 L 360 80 L 360 220 Z';

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': "Ohm's law circuit" });
      svg.style.maxHeight = '300px';

      // Base wire
      wirePath = S('path', { d: PATH, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, opacity: .28, 'stroke-linejoin': 'round' });
      svg.appendChild(wirePath);

      // Animated current overlay — dashed, offset changes each frame.
      currentPath = S('path', {
        d: PATH, fill: 'none',
        stroke: 'var(--blue)',
        'stroke-width': 3,
        'stroke-dasharray': '6 14',
        'stroke-linecap': 'round'
      });
      svg.appendChild(currentPath);

      // Battery (left side, between y=110 and y=190)
      const bat = S('g');
      bat.appendChild(S('rect', { x: 46, y: 120, width: 28, height: 14, rx: 3, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      bat.appendChild(S('rect', { x: 46, y: 146, width: 28, height: 14, rx: 3, fill: 'currentColor', opacity: .9 }));
      bat.appendChild(S('text', { x: 46, y: 108, fill: 'var(--ink-3)', 'font-size': 11, 'font-family': 'inherit', 'text-anchor': 'middle' }));
      svg.appendChild(bat);

      // Ammeter (top wire, at x≈210)
      const amp = S('g');
      amp.appendChild(S('circle', { cx: 210, cy: 80, r: 18, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      ampLabel = S('text', { x: 210, y: 84, 'text-anchor': 'middle', fill: 'var(--ink-1)', 'font-size': 12, 'font-family': 'inherit', 'font-weight': 600 });
      ampLabel.textContent = 'A';
      amp.appendChild(ampLabel);
      svg.appendChild(amp);

      // Resistor (right wire, at y≈150)
      const res = S('g');
      res.appendChild(S('rect', { x: 340, y: 122, width: 40, height: 56, rx: 6, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      resLabel = S('text', { x: 360, y: 156, 'text-anchor': 'middle', fill: 'var(--ink-1)', 'font-size': 12, 'font-family': 'inherit', 'font-weight': 600 });
      resLabel.textContent = `${R}Ω`;
      res.appendChild(resLabel);
      svg.appendChild(res);

      // Voltmeter (parallel across resistor)
      const volt = S('g');
      volt.appendChild(S('path', { d: 'M 360 122 L 400 122 L 400 178 L 360 178', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, opacity: .35, 'stroke-linejoin': 'round' }));
      volt.appendChild(S('circle', { cx: 400, cy: 150, r: 16, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      voltLabel = S('text', { x: 400, y: 154, 'text-anchor': 'middle', fill: 'var(--ink-1)', 'font-size': 11, 'font-family': 'inherit', 'font-weight': 600 });
      voltLabel.textContent = `${V}V`;
      volt.appendChild(voltLabel);
      svg.appendChild(volt);

      // + / − marks
      const plus = S('text', { x: 100, y: 60, fill: 'var(--ink-4)', 'font-size': 11, 'font-family': 'inherit' });
      plus.textContent = '+';
      const minus = S('text', { x: 100, y: 250, fill: 'var(--ink-4)', 'font-size': 11, 'font-family': 'inherit' });
      minus.textContent = '−';
      svg.appendChild(plus);
      svg.appendChild(minus);

      return svg;
    }

    function tick(t) {
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      const I = V / R;                       // amperes
      // Speed scaled so 1 A → ~200 px/s. Bigger current = faster dashes.
      const speed = 60 + Math.min(600, I * 200);
      dashOffset -= speed * dt;
      currentPath.setAttribute('stroke-dashoffset', String(dashOffset));

      // Dash density also reflects current so a tiny current looks sparse.
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
      stage = stageEl;
      controls = controlsEl;
      stage.innerHTML = '';
      controls.innerHTML = '';

      stage.appendChild(build());

      vCtl = slider({ label: 'Voltage', min: 0, max: 12, step: 0.1, value: V, unit: 'V', format: (v) => v.toFixed(1) });
      vCtl.input.addEventListener('input', () => { V = vCtl.value; paintLabels(); onChange(); });
      controls.appendChild(vCtl.wrap);

      rCtl = slider({ label: 'Resistance', min: 1, max: 100, step: 0.5, value: R, unit: 'Ω', format: (v) => v.toFixed(1) });
      rCtl.input.addEventListener('input', () => { R = rCtl.value; paintLabels(); onChange(); });
      controls.appendChild(rCtl.wrap);

      const readout = document.createElement('div');
      readout.className = 'sim__readout';
      readout.innerHTML =
        `<div class="readout-row">
           <span class="label">Current</span>
           <span class="value tnum"><span data-i>0.00</span><span class="unit">A</span></span>
         </div>
         <div class="readout-row">
           <span class="label">Resistance</span>
           <span class="value small tnum"><span data-r>0.0</span><span class="unit">Ω</span></span>
         </div>
         <div class="readout-row">
           <span class="label">Formula</span>
           <span class="value small">I = V / R</span>
         </div>`;
      controls.appendChild(readout);
      iOut = readout.querySelector('[data-i]');
      rShown = readout.querySelector('[data-r]');

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
      id: 'ohm',
      mount,
      state,
      reset() { V = 6; R = 10; if (vCtl) vCtl.value = V; if (rCtl) rCtl.value = R; paintLabels(); },
      destroy() { if (raf) cancelAnimationFrame(raf); raf = null; }
    };
  }

  /* ----------------------------------------------------------
     3. Acid–Base Titration
     ---------------------------------------------------------- */
  function createTitration() {
    const ENDPOINT_ML = 20.0;      // 20.0 mL of 0.1 M NaOH neutralises 20 mL of 0.1 M HCl
    const M_NAOH = 0.1;
    const V_HCL = 20.0;
    let added = 0;                 // mL dispensed so far
    let dragging = false;
    let onChange = () => {};
    let stage, controls;
    let buretteLevel, flaskLiquid, flaskFill, drop, volOut, colourLabel, concOut, mLOut;

    const VB = { w: 400, h: 380 };
    const BURETTE = { x: 200, top: 30, bottom: 200, innerTop: 44, innerBottom: 190 };

    /* Pink intensity ramps from 0 at 19.4 mL to 1 at 20.4 mL. */
    function pinkness() {
      return Math.max(0, Math.min(1, (added - 19.4) / 1.0));
    }

    function build() {
      const svg = S('svg', { viewBox: `0 0 ${VB.w} ${VB.h}`, role: 'img', 'aria-label': 'Acid–base titration' });
      svg.style.maxHeight = '380px';

      // Burette body
      svg.appendChild(S('rect', { x: BURETTE.x - 14, y: BURETTE.top, width: 28, height: BURETTE.bottom - BURETTE.top, rx: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, opacity: .55 }));
      // Burette liquid
      buretteLevel = S('rect', {
        x: BURETTE.x - 11, y: BURETTE.innerTop, width: 22, height: BURETTE.innerBottom - BURETTE.innerTop,
        rx: 4, fill: 'rgba(10,132,255,.35)'
      });
      svg.appendChild(buretteLevel);

      // Stopcock
      svg.appendChild(S('line', { x1: BURETTE.x - 8, y1: BURETTE.bottom, x2: BURETTE.x + 8, y2: BURETTE.bottom, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .65 }));
      svg.appendChild(S('circle', { cx: BURETTE.x, cy: BURETTE.bottom + 8, r: 5, fill: 'var(--surface-1)', stroke: 'currentColor', 'stroke-width': 1.75 }));
      svg.appendChild(S('line', { x1: BURETTE.x, y1: BURETTE.bottom + 13, x2: BURETTE.x, y2: 240, stroke: 'currentColor', 'stroke-width': 1.5, opacity: .5 }));

      // Drop (invisible until animation plays)
      drop = S('ellipse', { cx: BURETTE.x, cy: 250, rx: 3, ry: 5, fill: 'rgba(10,132,255,.6)', opacity: 0 });
      svg.appendChild(drop);

      // Conical flask — a simple trapezoid with a rounded bottom.
      const flaskPath = 'M 150 260 L 250 260 L 275 340 Q 275 355 260 355 L 140 355 Q 125 355 125 340 Z';
      svg.appendChild(S('path', { d: flaskPath, fill: 'rgba(255,255,255,.30)', stroke: 'currentColor', 'stroke-width': 1.75, opacity: .55 }));

      // Flask liquid (pink-ish changes as endpoint approaches)
      flaskFill = S('path', {
        d: 'M 152 300 L 248 300 L 272 340 Q 272 353 258 353 L 142 353 Q 128 353 128 340 Z',
        fill: 'rgba(180, 220, 255, .35)'
      });
      svg.appendChild(flaskFill);
      flaskLiquid = flaskFill; // alias

      // Colour label
      colourLabel = S('text', { x: 200, y: 372, 'text-anchor': 'middle', fill: 'var(--ink-3)', 'font-size': 12, 'font-family': 'inherit' });
      svg.appendChild(colourLabel);

      // Volume label near burette
      volOut = S('text', { x: 240, y: BURETTE.bottom + 60, fill: 'var(--ink-3)', 'font-size': 13, 'font-family': 'inherit', 'font-weight': 500 });
      svg.appendChild(volOut);

      return svg;
    }

    function refresh() {
      // Burette level shrinks as we dispense.
      const total = 50;
      const frac = Math.max(0, 1 - added / total);
      const h = (BURETTE.innerBottom - BURETTE.innerTop) * frac;
      buretteLevel.setAttribute('y', String(BURETTE.innerBottom - h));
      buretteLevel.setAttribute('height', String(h));

      // Flask colour deepens toward the endpoint.
      const p = pinkness();
      const r = Math.round(180 + 60 * p);
      const g = Math.round(220 - 120 * p);
      const b = Math.round(255 - 140 * p);
      flaskLiquid.setAttribute('fill', `rgba(${r}, ${g}, ${b}, ${0.35 + 0.45 * p})`);

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
        // At (or past) the endpoint, M₁V₁ = M₂V₂.
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
      stage = stageEl;
      controls = controlsEl;
      stage.innerHTML = '';
      controls.innerHTML = '';

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
      quick.appendChild(addHalf);
      quick.appendChild(reset);
      controls.appendChild(quick);

      const readout = document.createElement('div');
      readout.className = 'sim__readout';
      readout.innerHTML =
        `<div class="readout-row">
           <span class="label">Volume added</span>
           <span class="value tnum"><span data-ml>0.0</span><span class="unit">mL</span></span>
         </div>
         <div class="readout-row">
           <span class="label">Estimated [HCl]</span>
           <span class="value tnum"><span data-c>—</span><span class="unit">M</span></span>
         </div>
         <div class="readout-row">
           <span class="label">NaOH (standard)</span>
           <span class="value small tnum">0.100 <span class="unit">M</span></span>
         </div>
         <div class="readout-row">
           <span class="label">HCl taken</span>
           <span class="value small tnum">20.0 <span class="unit">mL</span></span>
         </div>`;
      controls.appendChild(readout);
      mLOut = readout.querySelector('[data-ml]');
      concOut = readout.querySelector('[data-c]');

      refresh();
    }

    function state() {
      return {
        V: Number(added.toFixed(2)),
        M: added >= 19 ? Number(((M_NAOH * added) / V_HCL).toFixed(3)) : null
      };
    }

    return {
      id: 'titration',
      mount,
      state,
      reset() { setAdded(0); },
      destroy() { /* nothing to cancel */ }
    };
  }

  /* Factory used by the experiment page. */
  const registry = {
    pendulum: createPendulum,
    ohm: createOhm,
    titration: createTitration
  };
  function get(id) {
    const make = registry[id];
    return make ? make() : null;
  }

  return { get, registry };
})();