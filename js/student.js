/* ============================================================
   student.js — final: onboarding, hero greeting, progress card,
                per-experiment sims, flip cards (Phase 8),
                lens + pH experiments wired in.
   ============================================================ */

(function () {
  'use strict';

  const {
    $, $$, h, fmt, clamp, wait, debounce, escapeHtml,
    store, bus, router, theme, toast, palette, icons,
    attachSpecular, attachTilt, observeReveals, countUp,
    ensureSeed, ready
  } = VL;

  /* ============================================================
     Session + guards
     ============================================================ */
  function session() { return store.get('session'); }
  function signIn(user) {
    store.set('session', {
      id: user.id, role: user.role, name: user.name, email: user.email,
      avatar: user.avatar || user.name.split(' ').map(w => w[0]).join('').slice(0, 2)
    });
    bus.emit('auth');
  }
  function signOut() { store.update(s => { delete s.session; }); bus.emit('auth'); }

  VL.guardStudent = (fn) => (params, meta) => {
    const s = session();
    if (!s) { router.replace('/signin'); return; }
    if (s.role !== 'student') { router.replace('/admin'); return; }
    fn(params, meta);
  };
  VL.guardAdmin = (fn) => (params, meta) => {
    const s = session();
    if (!s) { router.replace('/signin'); return; }
    if (s.role !== 'admin') { toast.warn("That area is for teachers — taking you home."); router.replace('/home'); return; }
    fn(params, meta);
  };

  /* ============================================================
     Data accessors
     ============================================================ */
  function experiments() { return store.get('experiments', []) || []; }
  function experimentById(id) { return experiments().find(e => e.id === id); }
  function submissions() { return store.get('submissions', []) || []; }
  function drafts() { return store.get('drafts', {}) || {}; }
  function draftKey(uid, eid) { return `${uid}::${eid}`; }

  function mySubmissions(userId) {
    return submissions().filter(s => s.studentId === userId)
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  }
  function statusFor(userId, expId) {
    const mine = mySubmissions(userId).filter(s => s.experimentId === expId);
    if (!mine.length) {
      const d = drafts()[draftKey(userId, expId)];
      if (d && (d.readings?.length || d.conclusion || Object.keys(d.answers || {}).length)) return 'in-progress';
      return 'new';
    }
    const latest = mine[0];
    return latest.status === 'graded' ? 'graded' : latest.status === 'changes' ? 'changes' : 'submitted';
  }
  function statusChip(status) {
    const map = {
      'new': ['chip', 'New'], 'in-progress': ['chip chip--orange', 'In progress'],
      'submitted': ['chip chip--orange', 'Submitted'], 'graded': ['chip chip--green', 'Graded'],
      'changes': ['chip chip--red', 'Changes asked']
    };
    const [cls, label] = map[status] || ['chip', status];
    return `<span class="${cls}">${label}</span>`;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function streakDays(userId) {
    const map = store.get('studentDays', {}) || {};
    const days = map[userId] || {};
    let count = 0; const d = new Date();
    while (count < 400) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!days[key]) break;
      count++; d.setDate(d.getDate() - 1);
    }
    return count;
  }
  function markActiveToday(userId) {
    const today = todayKey();
    store.update(s => {
      s.studentDays = s.studentDays || {};
      s.studentDays[userId] = s.studentDays[userId] || {};
      s.studentDays[userId][today] = true;
    });
  }
    // Create ONE global audio context to prevent browser blocking
  let globalAudioCtx = null;

  function playSound(type) {
    try {
      if (!globalAudioCtx) {
        globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Resume context if it was suspended by the browser
      if (globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume();
      }

      const osc = globalAudioCtx.createOscillator();
      const gain = globalAudioCtx.createGain();
      osc.connect(gain);
      gain.connect(globalAudioCtx.destination);

      const now = globalAudioCtx.currentTime;

      if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); 
        osc.stop(now + 0.5);
      } else if (type === 'wrong') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now); // A3
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.2); // A2
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); 
        osc.stop(now + 0.3);
      }
    } catch (e) { 
      console.warn("Audio not supported", e); 
    }
  }
  function seedStudentExtras() { /* no-op; demo data is scrubbed by core.js */ }

  /* ============================================================
     Teacher gate (Ctrl+Shift+A)
     ============================================================ */
  VL.requestAdminAccess = function () {
    if ($('#admin-gate')) return;
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim'; scrim.style.pointerEvents = 'none';

    const dialog = document.createElement('div');
    dialog.id = 'admin-gate';
    dialog.className = 'glass glass--refract';
    dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.96);z-index:81;width:min(360px,calc(100vw - 32px));padding:28px;border-radius:24px;opacity:0;transition:all .3s var(--ease-spring);display:flex;flex-direction:column;gap:16px;';
    dialog.innerHTML = `
      <div style="text-align:center">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--blue);color:white;display:grid;place-items:center;margin:0 auto 12px">${icons.svg('user', { size: 24 })}</div>
        <h2 style="font-size:20px;font-weight:600;letter-spacing:-.018em">Teacher Access</h2>
        <p style="color:var(--ink-3);font-size:14px;margin-top:4px">Enter the teacher code to unlock the admin portal.</p>
      </div>
      <input class="input" id="gate-code" type="password" maxlength="20" placeholder="Secret code" autocomplete="off" style="text-align:center;letter-spacing:4px;font-size:18px">
      <div style="display:flex;gap:8px">
        <button class="btn" type="button" id="gate-cancel" style="flex:1">Cancel</button>
        <button class="btn btn--primary" type="button" id="gate-submit" style="flex:1">Unlock</button>
      </div>`;

    document.body.appendChild(scrim);
    document.body.appendChild(dialog);

    requestAnimationFrame(() => {
      scrim.classList.add('open'); scrim.style.pointerEvents = '';
      dialog.style.opacity = '1'; dialog.style.transform = 'translate(-50%,-50%) scale(1)';
    });

    const input = dialog.querySelector('#gate-code');
    const close = () => {
      scrim.classList.remove('open');
      dialog.style.opacity = '0'; dialog.style.transform = 'translate(-50%,-50%) scale(.96)';
      setTimeout(() => { scrim.remove(); dialog.remove(); }, 300);
    };

    const _secret = atob('dGVhY2gyMDI2');

    scrim.addEventListener('click', close);
    dialog.querySelector('#gate-cancel').addEventListener('click', close);
    dialog.querySelector('#gate-submit').addEventListener('click', () => {
      if (input.value.trim().toLowerCase() === _secret) {
        const admin = (store.get('users', []) || []).find(u => u.role === 'admin');
        signIn(admin);
        close();
        toast.success('Welcome back, Dr. Iyer.');
        router.go('/admin');
      } else {
        input.style.borderColor = 'var(--red)';
        toast.error('Incorrect code. Try again.');
        setTimeout(() => input.style.borderColor = '', 800);
      }
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') dialog.querySelector('#gate-submit').click(); });
    setTimeout(() => input.focus(), 100);
  };

  /* ============================================================
     Nav + shell
     ============================================================ */
   const NAV_STUDENT = [
    { href: '#/home',        label: 'Home',        icon: 'home' },
    { href: '#/experiments', label: 'Experiments', icon: 'flask' },
    { href: '#/quizzes',     label: 'Quizzes',     icon: 'clipboard' }, // <--- NEW
    { href: '#/progress',    label: 'Progress',    icon: 'chart' }
  ];
    const NAV_ADMIN = [
    { href: '#/admin',              label: 'Dashboard',   icon: 'chart' },
    { href: '#/admin/experiments',  label: 'Experiments', icon: 'flask' },
    { href: '#/admin/submissions',  label: 'Submissions', icon: 'clipboard' },
    { href: '#/admin/students',     label: 'Students',    icon: 'users' },
    { href: '#/admin/batches',      label: 'Batches',     icon: 'clipboard' }
  ];
  function currentNavList() { const s = session(); if (!s) return []; return s.role === 'admin' ? NAV_ADMIN : NAV_STUDENT; }

  function renderShell() {
    const app = $('#app');
    if (!$('#view', app)) app.insertAdjacentHTML('beforeend', '<main id="view" tabindex="-1"></main>');
    const s = session();
    $('#sidebar', app)?.remove(); $('#tabbar', app)?.remove(); $('#topbar', app)?.remove();
    if (!s) return;

    const items = currentNavList();
    const here = '#' + (location.hash.replace(/^#/, '') || '/home');
    const isAdmin = s.role === 'admin';
        const titleMap = {
      '#/home': 'Virtual Lab', '#/experiments': 'Experiments','#/quizzes': 'Quizzes', '#/progress': 'Progress',
      '#/admin': 'Admin', '#/admin/experiments': 'Experiments',
      '#/admin/submissions': 'Submissions', '#/admin/students': 'Students',
      '#/admin/batches': 'Batches'
    };

    const side = document.createElement('aside');
    side.id = 'sidebar'; side.className = 'glass';
    side.setAttribute('aria-label', isAdmin ? 'Admin navigation' : 'Primary navigation');
    side.innerHTML = `
      <div class="sidebar__brand">${icons.svg('flask')}<b>Virtual Lab</b></div>
      <div class="sidebar__group"><span class="sidebar__lens" aria-hidden="true"></span>
        ${items.map(it => `<a class="sidebar__item" href="${it.href}" data-href="${it.href}">${icons.svg(it.icon, { size: 20 })}<span>${it.label}</span></a>`).join('')}
      </div>
      <div class="sidebar__foot">
        <span class="avatar" aria-hidden="true">${escapeHtml(s.avatar || '')}</span>
        <span class="sidebar__who"><b>${escapeHtml(s.name)}</b><span>${escapeHtml(s.email)}</span></span>
        <button class="icon-btn" type="button" data-action="theme" aria-label="Change theme">${icons.svg(theme.resolved() === 'dark' ? 'moon' : 'sun', { size: 18 })}</button>
        <button class="icon-btn" type="button" data-action="signout" aria-label="Sign out">${icons.svg('logout', { size: 18 })}</button>
      </div>`;
    app.appendChild(side);

    const top = document.createElement('header');
    top.id = 'topbar';
    top.innerHTML = `
      <span class="brand">${icons.svg('flask', { size: 20 })}<span>${titleMap[here] || 'Virtual Lab'}</span></span>
      <span class="spacer"></span>
      <button class="icon-btn" type="button" data-action="theme" aria-label="Change theme">${icons.svg(theme.resolved() === 'dark' ? 'moon' : 'sun', { size: 18 })}</button>
      <button class="icon-btn" type="button" data-action="palette" aria-label="Search">${icons.svg('search', { size: 18 })}</button>`;
    app.prepend(top);

    const bar = document.createElement('nav');
    bar.id = 'tabbar'; bar.className = 'glass'; bar.setAttribute('aria-label', 'Primary');
    bar.innerHTML = `<span class="tabbar__lens" aria-hidden="true"></span>` + items.map(it =>
      `<a class="tabbar__item" href="${it.href}" data-href="${it.href}">${icons.svg(it.icon, { size: 22 })}<span>${it.label}</span></a>`
    ).join('');
    app.appendChild(bar);

    updateNavActive();
  }

  function updateNavActive() {
    const here = location.hash.replace(/^#/, '') || '/home';
    const list = currentNavList();
    let best = null;
    list.forEach(it => {
      const p = it.href.replace(/^#/, '');
      if (here === p || here.startsWith(p + '/')) {
        if (!best || p.length > best.href.replace(/^#/, '').length) best = it;
      }
    });
    const activeHref = best ? best.href.replace(/^#/, '') : '';

    const update = (container, isSidebar) => {
      if (!container) return;
      const lens = container.querySelector('.sidebar__lens, .tabbar__lens');
      let activeEl = null;
      $$('a[data-href]', container).forEach(a => {
        const p = a.getAttribute('data-href').replace(/^#/, '');
        const on = p === activeHref;
        if (on) { a.setAttribute('aria-current', 'page'); activeEl = a; } else a.removeAttribute('aria-current');
      });
      if (!lens || !activeEl) { if (lens) lens.style.opacity = '0'; return; }
      const cRect = container.getBoundingClientRect();
      const aRect = activeEl.getBoundingClientRect();
      lens.style.opacity = '1';
      if (isSidebar) {
        const parent = lens.parentElement.getBoundingClientRect();
        lens.style.transform = `translateY(${aRect.top - parent.top}px)`;
        lens.style.height = aRect.height + 'px';
      } else {
        lens.style.transform = `translateX(${aRect.left - cRect.left}px)`;
        lens.style.width = aRect.width + 'px';
      }
    };
    update($('#sidebar'), true); update($('#tabbar'), false);
  }

  function cycleVisibleTheme(e) {
    const resolved = theme.resolved();
    const next = resolved === 'light' ? 'dark' : 'light';
    theme.set(next, e);
    toast.info(`Theme: ${next}`, { duration: 1600, icon: next === 'dark' ? 'moon' : 'sun' });
    $$('[data-action="theme"]').forEach(btn => {
      btn.innerHTML = icons.svg(next === 'dark' ? 'moon' : 'sun', { size: 18 });
    });
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.getAttribute('data-action');
    if (a === 'theme') cycleVisibleTheme(e);
    else if (a === 'signout') { signOut(); toast.info('Signed out. See you soon.'); router.replace('/signin'); }
    else if (a === 'palette') palette.show();
  });

  /* ============================================================
     View helpers
     ============================================================ */
  function setView(node) {
    const v = $('#view'); if (!v) return;
    v.innerHTML = ''; v.appendChild(node); window.scrollTo(0, 0);
    observeReveals(v); attachSpecular(v);
    $$('.card, .panel, .home-continue', v).forEach(el => attachTilt(el, 4));
    $$('[data-count]', v).forEach(el => {
      const to = Number(el.getAttribute('data-count'));
      const decimals = Number(el.getAttribute('data-decimals') || 0);
      const suffix = el.getAttribute('data-suffix') || '';
      const prefix = el.getAttribute('data-prefix') || '';
      countUp(el, to, { decimals, suffix, prefix });
    });
  }
  function wrap(content) {
    const w = document.createElement('div');
    w.className = 'view-wrap';
    if (typeof content === 'string') w.innerHTML = content;
    else w.appendChild(content);
    return w;
  }

  /* ============================================================
     Onboarding
     ============================================================ */
    /* ============================================================
     Onboarding / Auth
     ============================================================ */
  async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function onboardingView() {
    const root = document.createElement('div');
    root.className = 'signin';
    let isSignup = false;

    root.innerHTML = `
      <div class="signin__card glass glass--refract">
        <div class="signin__brand">
          <span class="signin__mark">${icons.svg('flask', { size: 28, sw: 1.75 })}</span>
          <h1>Virtual Lab</h1>
          <p id="auth-subtitle">Sign in to continue your progress.</p>
        </div>

        <form id="onboarding-form" style="display:flex;flex-direction:column;gap:16px" novalidate>
          <div class="field" id="name-group" style="display:none">
            <label class="field__label" for="on-name">Your name</label>
            <input class="input" id="on-name" name="name" type="text" minlength="2" maxlength="60" autocomplete="name" placeholder="e.g. Aarav Sharma">
            <span class="field__error" id="on-name-err" hidden></span>
          </div>
          <div class="field">
            <label class="field__label" for="on-email">Email</label>
            <input class="input" id="on-email" name="email" type="email" autocomplete="email" placeholder="you@student.edu" required>
            <span class="field__error" id="on-email-err" hidden></span>
          </div>
          <div class="field">
            <label class="field__label" for="on-pass">Password</label>
            <input class="input" id="on-pass" name="password" type="password" minlength="4" placeholder="••••••••" required>
            <span class="field__error" id="on-pass-err" hidden></span>
          </div>
          <button class="btn btn--primary btn--lg" type="submit" id="auth-btn">
            <span>Sign In</span>${icons.svg('arrow-right', { size: 18 })}
          </button>
        </form>
        
        <div style="text-align:center; margin-top: 10px;">
          <button type="button" class="btn btn--ghost btn--sm" id="toggle-auth" style="font-weight: 500; color: var(--blue);">
            Don't have an account? Sign Up
          </button>
        </div>
      </div>`;

    const form = root.querySelector('#onboarding-form');
    const nameGroup = root.querySelector('#name-group');
    const nameEl = root.querySelector('#on-name');
    const emailEl = root.querySelector('#on-email');
    const passEl = root.querySelector('#on-pass');
    const submitBtn = root.querySelector('#auth-btn');
    const subtitle = root.querySelector('#auth-subtitle');
    const toggleBtn = root.querySelector('#toggle-auth');
    
    const nameErr = root.querySelector('#on-name-err');
    const emailErr = root.querySelector('#on-email-err');
    const passErr = root.querySelector('#on-pass-err');

    toggleBtn.addEventListener('click', () => {
      isSignup = !isSignup;
      nameGroup.style.display = isSignup ? 'flex' : 'none';
      nameEl.required = isSignup;
      submitBtn.innerHTML = `<span>${isSignup ? 'Create Account' : 'Sign In'}</span>${icons.svg('arrow-right', { size: 18 })}`;
      subtitle.textContent = isSignup ? 'Create an account to save your progress.' : 'Sign in to continue your progress.';
      toggleBtn.textContent = isSignup ? 'Already have an account? Sign In' : "Don't have an account? Sign Up";
      nameErr.hidden = true; emailErr.hidden = true; passErr.hidden = true;
    });

    function showErr(node, msg) { node.textContent = msg; node.hidden = false; }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      nameErr.hidden = true; emailErr.hidden = true; passErr.hidden = true;

      const name = nameEl.value.trim();
      const email = emailEl.value.trim().toLowerCase();
      const pass = passEl.value;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showErr(emailErr, 'Please enter a valid email address.');
        return;
      }
      if (pass.length < 4) {
        showErr(passErr, 'Password must be at least 4 characters.');
        return;
      }
      if (isSignup && name.length < 2) {
        showErr(nameErr, 'Please enter your name (at least 2 characters).');
        return;
      }

      const users = store.get('users', []) || [];
      const existing = users.find(u => (u.email || '').toLowerCase() === email && u.role === 'student');
      const passHash = await hashPassword(pass);

      if (isSignup) {
        if (existing) {
          showErr(emailErr, 'An account with this email already exists.');
          return;
        }
        const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const newUser = {
          id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          role: 'student', name, email, avatar: initials, passwordHash: passHash, createdAt: Date.now()
        };
        store.update(s => { s.users = s.users || []; s.users.push(newUser); });
        signIn(newUser);
      } else {
        if (!existing) {
          showErr(emailErr, "No account found with this email.");
          return;
        }
        if (existing.passwordHash && existing.passwordHash !== passHash) {
          showErr(passErr, 'Incorrect password.');
          return;
        }
        // If legacy account with no password, set it now
        if (!existing.passwordHash) {
           store.update(s => {
             const u = s.users.find(x => x.id === existing.id);
             if (u) u.passwordHash = passHash;
           });
        }
        signIn(existing);
      }

      markActiveToday(session().id);
      renderShell();
      toast.success(`Welcome, ${session().name.split(' ')[0]}.`);
            // Set a flag so the home page knows to delay its entrance animation
      sessionStorage.setItem('vl_just_logged_in', '1'); 
      router.replace('/home');
      setTimeout(() => playSuccess(), 300); // Triggers the confetti
    });

    setTimeout(() => emailEl.focus(), 100);
    return root;
  }

  /* ============================================================
     Home
     ============================================================ */
  function greeting() {
    const hr = new Date().getHours();
    if (hr < 5) return 'Still up?';
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    if (hr < 22) return 'Good evening';
    return 'Winding down';
  }
  function relativeDay(ts) {
    if (!ts) return 'never';
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 7) return `${d} days ago`;
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
    function myBatch(userId) {
    const batches = store.get('batches', []) || [];
    return batches.find(b => (b.studentIds || []).includes(userId));
  }

  function realUpcomingDeadlines(userId) {
    const batch = myBatch(userId);
    if (!batch || !batch.assignments) return [];
    const now = Date.now();
    return batch.assignments.map(a => {
      const exp = experimentById(a.experimentId);
      if (!exp) return null;
      const ms = a.deadline - now;
      const days = Math.ceil(ms / 86400000);
      return {
        title: exp.title,
        subject: exp.subject,
        days: Math.max(0, days),
        expId: exp.id,
        when: new Date(a.deadline)
      };
    }).filter(Boolean).sort((a, b) => a.days - b.days);
  }
      // Check if the user just logged in to trigger the delayed animation
    const justLoggedIn = sessionStorage.getItem('vl_just_logged_in') === '1';
    if (justLoggedIn) sessionStorage.removeItem('vl_just_logged_in');

    const root = document.createElement('div');
    // Add the delay class if they just logged in
    if (justLoggedIn) root.className = 'wait-for-tick';

    function homeView() {
    const s = session();
    const streak = streakDays(s.id);

    // Check if they just logged in
    const justLoggedIn = sessionStorage.getItem('vl_just_logged_in') === '1';
    if (justLoggedIn) sessionStorage.removeItem('vl_just_logged_in');

    const facts = [
      "⚡ Did you know? A single lightning bolt contains about 1 billion joules of energy.",
      "💧 Did you know? Water is the only substance on Earth that naturally exists in three states: solid, liquid, and gas.",
      "📄 Did you know? If you could fold a piece of paper 42 times, it would reach the moon.",
      "🪙 Did you know? The human body contains about 0.2 milligrams of gold.",
      "☀️ Did you know? Light from the Sun takes exactly 8 minutes and 20 seconds to reach Earth.",
      "🌌 Did you know? A teaspoon of neutron star material would weigh about 6 billion tons.",
      "🗼 Did you know? The Eiffel Tower is about 15 centimeters taller in the summer due to thermal expansion.",
      "🔬 Did you know? There are more atoms in a single glass of water than there are glasses of water in all the oceans."
    ];

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="home-hero-center">
        
        <!-- Notice the inline style here: if they just logged in, it starts invisible -->
        <div class="hero-glass-panel" id="hero-panel" style="${justLoggedIn ? 'opacity: 0; transform: translateY(20px);' : ''}">
          <h1 class="hero-title">
            <span class="hero-greeting">Welcome, 👋</span><br>
            <span class="hero-name">${escapeHtml(s.name)}.</span>
          </h1>
          <p class="hero-sub">Get ready with your lab coat. 🥼</p>
          
          <div class="hero-action">
            <a href="#/experiments" class="btn btn--primary btn--lg btn-hero pulse-hover">
              <span>Go to Experiments</span>
              ${icons.svg('arrow-right', { size: 20 })}
            </a>
          </div>

          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--line);">
            <p id="fun-fact" class="hero-fact-text">${facts[0]}</p>
            <button id="next-fact" class="btn btn--ghost btn--sm" style="color: var(--blue);">
              ${icons.svg('refresh', { size: 14 })}<span>Another fact</span>
            </button>
          </div>
          
          ${streak > 0 ? `
            <div class="hero-streak" style="margin-top: 24px;">
              <span class="chip chip--blue">${icons.svg('sparkle', { size: 14 })} ${streak}-day streak 🔥</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // IF THEY JUST LOGGED IN: Wait 1.6 seconds, then smoothly fade the panel in
    if (justLoggedIn) {
      setTimeout(() => {
        const panel = root.querySelector('#hero-panel');
        if (panel) {
          // Add smooth transition
          panel.style.transition = 'opacity 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)';
          // Trigger the fade in
          panel.style.opacity = '1';
          panel.style.transform = 'translateY(0)';
        }
      }, 1600); // 1600ms = waits for the tick mark and confetti to clear
    }

    // Fact generator logic
    const factEl = root.querySelector('#fun-fact');
    let factIndex = 0;
    root.querySelector('#next-fact').addEventListener('click', () => {
      factEl.style.opacity = '0';
      setTimeout(() => {
        factIndex = (factIndex + 1) % facts.length;
        factEl.textContent = facts[factIndex];
        factEl.style.opacity = '1';
      }, 300);
    });

    if (VL.attachTilt) VL.attachTilt(root.querySelector('.hero-glass-panel'), 5);

    return root;
  }
  /* ============================================================
     Experiment metadata for flip cards
     ============================================================ */
  const EXP_INFO = {
    e_pendulum: {
      scientist: 'Galileo Galilei', year: 'c. 1602',
      formula: 'T = 2π√(L/g)',
      learn: 'How period depends only on length (not mass), and how to estimate g from the slope.'
    },
    e_ohm: {
      scientist: 'Georg Simon Ohm', year: '1827',
      formula: 'V = IR',
      learn: 'Verify Ohm\'s law and derive an unknown resistance from the V–I slope.'
    },
    e_titration: {
      scientist: 'F. A. H. Descroizilles', year: '1806',
      formula: 'M₁V₁ = M₂V₂',
      learn: 'Find an unknown acid concentration by standardising with a base.'
    },
    e_projectile: {
      scientist: 'Galileo Galilei', year: '1638',
      formula: 'R = u² sin(2θ) / g',
      learn: 'How launch angle controls range, and why 45° is optimal.'
    },
    e_magnetic: {
      scientist: 'Hans Christian Ørsted', year: '1820',
      formula: 'B = μ₀I / (2πr)',
      learn: 'How magnetic field strength falls off with distance from a straight wire.'
    },
    e_lens: {
      scientist: 'Ibn al-Haytham', year: 'c. 1021',
      formula: '1/f = 1/v + 1/u',
      learn: 'Real vs. virtual images and how object distance controls magnification.'
    },
    e_ph: {
      scientist: 'S. P. L. Sørensen', year: '1909',
      formula: 'pH = −log₁₀[H⁺]',
      learn: 'Read the pH scale and recognise acids and bases from indicator colours.'
    },
        e_refraction: {
      scientist: 'Willebrord Snellius', year: '1621',
      formula: 'n₁ sin i = n₂ sin r',
      learn: 'How light bends when it enters a denser medium, and how to derive the refractive index from measured angles.'
    },
    e_flame: {
      scientist: 'Bunsen & Kirchhoff', year: '1860',
      formula: 'E = hc / λ',
      learn: 'How each metal has a signature flame colour, and how the wavelength identifies the element.'
    }
  };

  /* Lightweight mini-preview for each experiment. */
  function miniPreview(id) {
    const reduce = VL.prefersReducedMotion();
    switch (id) {
      case 'e_pendulum':
        return `
          <svg viewBox="0 0 100 100" class="mp">
            <g class="mp-pend-arm">
              <line x1="50" y1="10" x2="50" y2="72" stroke="var(--ink-3)" stroke-width="1.5"/>
              <circle cx="50" cy="72" r="8" fill="var(--blue)"/>
            </g>
            <circle cx="50" cy="10" r="2.2" fill="var(--ink-3)"/>
          </svg>`;
      case 'e_ohm':
        return `
          <svg viewBox="0 0 100 70" class="mp">
            <path d="M15 55 L15 15 L85 15 L85 55 Z" fill="none" stroke="var(--ink-4)" stroke-width="1.5" opacity="0.4"/>
            <path d="M15 55 L15 15 L85 15 L85 55 Z" fill="none" stroke="var(--blue)" stroke-width="2" stroke-dasharray="4 8" class="mp-flow"/>
            <circle cx="50" cy="15" r="6" fill="var(--surface-1)" stroke="var(--ink-3)" stroke-width="1.2"/>
            <rect x="78" y="30" width="14" height="14" rx="2" fill="var(--surface-1)" stroke="var(--ink-3)" stroke-width="1.2"/>
          </svg>`;
      case 'e_titration':
        return `
          <svg viewBox="0 0 100 100" class="mp">
            <rect x="42" y="8" width="16" height="48" rx="4" fill="none" stroke="var(--ink-3)" stroke-width="1.5"/>
            <rect x="44" y="26" width="12" height="28" rx="2" fill="var(--blue)" opacity="0.5"/>
            <line x1="50" y1="56" x2="50" y2="66" stroke="var(--ink-3)" stroke-width="1.5"/>
            <circle cx="50" cy="70" r="2.2" fill="var(--blue)" class="mp-drop"/>
            <path d="M32 72 L68 72 L74 92 L26 92 Z" fill="var(--blue)" opacity="0.22" stroke="var(--ink-3)" stroke-width="1.2"/>
          </svg>`;
      case 'e_projectile':
        return `
          <svg viewBox="0 0 100 70" class="mp">
            <line x1="10" y1="60" x2="90" y2="60" stroke="var(--ink-4)" stroke-width="1" opacity="0.5"/>
            <path d="M10 60 Q50 -10 90 60" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.55"/>
            <circle r="4" fill="var(--blue)">
              ${reduce ? '' : '<animateMotion dur="2.4s" repeatCount="indefinite" path="M10 60 Q50 -10 90 60"/>'}
            </circle>
          </svg>`;
      case 'e_magnetic':
        return `
          <svg viewBox="0 0 100 100" class="mp">
            <line x1="50" y1="8" x2="50" y2="92" stroke="var(--ink-3)" stroke-width="2"/>
            <circle cx="50" cy="50" r="14" fill="none" stroke="var(--blue)" stroke-width="1.2" stroke-dasharray="3 3" class="mp-ring mp-ring-1"/>
            <circle cx="50" cy="50" r="24" fill="none" stroke="var(--blue)" stroke-width="1.2" stroke-dasharray="3 3" class="mp-ring mp-ring-2"/>
            <circle cx="50" cy="50" r="34" fill="none" stroke="var(--blue)" stroke-width="1.2" stroke-dasharray="3 3" class="mp-ring mp-ring-3"/>
          </svg>`;
      case 'e_lens':
        return `
          <svg viewBox="0 0 100 80" class="mp">
            <line x1="10" y1="40" x2="90" y2="40" stroke="var(--ink-4)" stroke-width="0.8" opacity="0.5"/>
            <ellipse cx="50" cy="40" rx="5" ry="28" fill="var(--blue-soft)" stroke="var(--blue)" stroke-width="1.2"/>
            <circle cx="66" cy="40" r="2" fill="var(--ink-3)"/>
            <circle cx="34" cy="40" r="2" fill="var(--ink-3)"/>
            <path d="M20 22 L50 22 L66 40" stroke="var(--orange)" stroke-width="1.2" fill="none" class="mp-ray"/>
            <path d="M20 58 L50 58 L66 40" stroke="var(--purple)" stroke-width="1.2" fill="none" class="mp-ray"/>
          </svg>`;
      case 'e_ph':
        return `
          <svg viewBox="0 0 80 100" class="mp">
            <rect x="22" y="42" width="36" height="48" rx="3" fill="none" stroke="var(--ink-3)" stroke-width="1.5"/>
            <rect x="25" y="60" width="30" height="27" rx="2" class="mp-ph-fill"/>
          </svg>`;
              case 'e_refraction':
        return `
          <svg viewBox="0 0 100 80" class="mp">
            <rect x="0" y="40" width="100" height="40" fill="var(--blue-soft)" opacity="0.5"/>
            <line x1="0" y1="40" x2="100" y2="40" stroke="var(--ink-4)" stroke-width="1"/>
            <line x1="50" y1="6" x2="50" y2="74" stroke="var(--ink-4)" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.5"/>
            <path d="M20 10 L50 40" stroke="var(--orange)" stroke-width="2" stroke-linecap="round" class="mp-ray"/>
            <path d="M50 40 L68 72" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" class="mp-ray"/>
          </svg>`;
      case 'e_flame':
        return `
          <svg viewBox="0 0 100 100" class="mp">
            <rect x="35" y="82" width="30" height="12" rx="2" fill="var(--ink-4)"/>
            <rect x="44" y="74" width="12" height="8" rx="1" fill="var(--ink-3)"/>
            <path d="M50 15 Q35 45 40 65 Q42 75 50 78 Q58 75 60 65 Q65 45 50 15 Z" fill="#ffb400" opacity="0.85" class="mp-flame"/>
            <path d="M50 35 Q44 55 45 68 Q46 73 50 76 Q54 73 55 68 Q56 55 50 35 Z" fill="#fff" opacity="0.4"/>
          </svg>`;
      default:
        return `<svg viewBox="0 0 100 100" class="mp"><circle cx="50" cy="50" r="30" fill="none" stroke="var(--ink-3)" stroke-width="1.5" opacity="0.4"/></svg>`;

    }
  }

  /* Wire the hover-5s flip and touch-tap behaviour on a card. */
  function attachFlipCard(el, expId) {
    const timerFill = el.querySelector('.exp-card3d__timer-fill');
    const front = el.querySelector('[data-front]');
    const backBtn = el.querySelector('[data-back]');
    const isTouch = window.matchMedia('(hover: none)').matches;
    let t = null;

    const flip = (on) => el.classList.toggle('flipped', !!on);

    const clearTimer = () => {
      if (t) { clearTimeout(t); t = null; }
      el.classList.remove('hovering');
      if (timerFill) {
        timerFill.style.animation = 'none';
        void timerFill.offsetWidth; /* restart */
      }
    };

    el.addEventListener('mouseenter', () => {
      if (isTouch || el.classList.contains('flipped')) return;
      clearTimer();
      el.classList.add('hovering');
      if (timerFill) timerFill.style.animation = '';
      t = setTimeout(() => {
        flip(true);
        el.classList.remove('hovering');
        t = null;
      }, 1000);
    });

    el.addEventListener('mouseleave', clearTimer);

    front.addEventListener('click', () => {
      if (isTouch && !el.classList.contains('flipped')) { flip(true); return; }
      router.go('/experiments/' + expId);
    });

    if (backBtn) backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      flip(false);
    });

    el.tabIndex = 0;
    el.setAttribute('role', 'link');
    el.setAttribute('aria-label', 'Open experiment');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (el.classList.contains('flipped')) router.go('/experiments/' + expId);
        else flip(true);
      }
    });
  }

  /* ============================================================
     Experiments list — Phase 8 flip cards
     ============================================================ */
  function experimentsView() {
    const s = session();
    const all = experiments();
    const state = { q: '', subject: 'All', difficulty: 'All', sort: 'easiest' };
    const subjects = ['All', ...Array.from(new Set(all.map(e => e.subject)))];
    const difficulties = ['All', 'Easy', 'Medium', 'Hard'];
    const diffDots = { Easy: 1, Medium: 2, Hard: 3 };

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="section-head"><h2>Experiments</h2><span style="color:var(--ink-3);font-size:14px" id="exp-count">${all.length} published</span></div>
      <div class="list-tools">
        <div class="search-wrap">${icons.svg('search', { size: 18 })}<input class="input" id="exp-search" type="search" placeholder="Search by title or aim…" aria-label="Search experiments"></div>
        <div class="filters">
          ${subjects.map(sub => `<button class="tab" type="button" data-subject="${escapeHtml(sub)}"${sub === 'All' ? ' aria-selected="true"' : ''}>${escapeHtml(sub)}</button>`).join('')}
          <span class="spacer"></span>
          <select class="select" id="exp-diff" aria-label="Difficulty" style="max-width:170px">${difficulties.map(d => `<option value="${d}">${d === 'All' ? 'All difficulties' : d}</option>`).join('')}</select>
          <select class="select" id="exp-sort" aria-label="Sort by" style="max-width:170px"><option value="easiest">Easiest first</option><option value="shortest">Shortest first</option><option value="recent">Recently added</option></select>
        </div>
      </div>
      <div class="exp-grid3d" id="exp-grid" data-stagger></div>`;

    const grid = root.querySelector('#exp-grid');
    const count = root.querySelector('#exp-count');

    function filtered() {
      let list = all.slice();
      const q = state.q.trim().toLowerCase();
      if (q) list = list.filter(e => e.title.toLowerCase().includes(q) || e.aim.toLowerCase().includes(q));
      if (state.subject !== 'All') list = list.filter(e => e.subject === state.subject);
      if (state.difficulty !== 'All') list = list.filter(e => e.difficulty === state.difficulty);
      if (state.sort === 'easiest') list.sort((a, b) => (diffDots[a.difficulty] || 9) - (diffDots[b.difficulty] || 9) || a.duration - b.duration);
      else if (state.sort === 'shortest') list.sort((a, b) => a.duration - b.duration);
      else if (state.sort === 'recent') list.sort((a, b) => (b.order || 0) - (a.order || 0));
      return list;
    }

        function card(e) {
      const status = statusFor(s.id, e.id);
      const info = EXP_INFO[e.id] || {};
      const preview = miniPreview(e.id);

      const batch = myBatch(s.id);
      const assign = batch?.assignments?.find(a => a.experimentId === e.id);
      let assignChip = '';
      if (assign) {
        const daysLeft = Math.ceil((assign.deadline - Date.now()) / 86400000);
        const isLate = daysLeft < 0;
        const label = isLate ? 'Overdue' : `Due ${new Date(assign.deadline).toLocaleDateString(undefined, {month:'short', day:'numeric'})}`;
        assignChip = `<span class="chip ${isLate ? 'chip--red' : 'chip--orange'}">${label}</span>`;
      }

      const el = document.createElement('div');
      el.className = 'exp-card3d';
      el.dataset.expId = e.id;
      el.innerHTML = `
        <div class="exp-card3d__inner">
          <div class="exp-card3d__face exp-card3d__front" data-front>
            <div class="exp-card3d__preview">${preview}</div>
            <div class="exp-card3d__body">
              <div class="exp-card3d__title">${escapeHtml(e.title)}</div>
              <div class="exp-card3d__meta" style="flex-wrap:wrap; gap:6px">
                <span class="chip">${escapeHtml(e.subject)}</span>
                ${assignChip}
                <span style="color:var(--ink-3);font-size:12px;margin-left:auto">${e.duration} min</span>
              </div>
              <div style="margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; color:var(--ink-3); text-transform:capitalize">${escapeHtml(e.difficulty)}</span>
                ${statusChip(status)}
              </div>
            </div>
            <svg class="exp-card3d__timer" viewBox="0 0 26 26" aria-hidden="true">
              <circle cx="13" cy="13" r="11" fill="none" stroke="var(--fill-2)" stroke-width="2"/>
              <circle cx="13" cy="13" r="11" fill="none" stroke="var(--blue)" stroke-width="2"
                      stroke-dasharray="69.115" stroke-dashoffset="69.115" class="exp-card3d__timer-fill"/>
            </svg>
          </div>
          <div class="exp-card3d__face exp-card3d__back">
            <div class="exp-card3d__back-body">
              <div class="card__eyebrow">About this experiment</div>
              <h3>${escapeHtml(e.title)}</h3>
              <p class="exp-card3d__aim">${escapeHtml(e.aim)}</p>
              ${info.scientist ? `<p class="exp-card3d__sci"><b>${escapeHtml(info.scientist)}</b>${info.year ? ` · ${info.year}` : ''}</p>` : ''}
              ${info.formula ? `<div class="exp-card3d__formula">${escapeHtml(info.formula)}</div>` : ''}
              ${info.learn ? `<p class="exp-card3d__learn"><b>You'll learn:</b> ${escapeHtml(info.learn)}</p>` : ''}
            </div>
            <div class="exp-card3d__back-actions">
              <button class="btn btn--sm" type="button" data-back>Back</button>
              <a class="btn btn--primary btn--sm" href="#/experiments/${e.id}" data-start>Start experiment</a>
            </div>
          </div>
        </div>`;

      attachFlipCard(el, e.id);
      return el;
    }

    function paint() {
      const list = filtered();
      count.textContent = `${list.length} of ${all.length} published`;
      grid.innerHTML = '';
      if (!list.length) {
        grid.innerHTML = `<div class="panel" style="grid-column:1/-1"><div class="empty-note">No experiment matches those filters.<br><button class="btn btn--sm" style="margin-top:12px" type="button" data-clear>${icons.svg('refresh', { size: 14 })}<span>Clear filters</span></button></div></div>`;
        grid.querySelector('[data-clear]').addEventListener('click', () => {
          state.q = ''; state.subject = 'All'; state.difficulty = 'All'; state.sort = 'easiest';
          root.querySelector('#exp-search').value = '';
          root.querySelector('#exp-diff').value = 'All';
          root.querySelector('#exp-sort').value = 'easiest';
          $$('.tab', root).forEach(t => t.setAttribute('aria-selected', String(t.dataset.subject === 'All')));
          paint();
        });
        return;
      }
      list.forEach(e => grid.appendChild(card(e)));
      observeReveals(root);
    }

    root.querySelector('#exp-search').addEventListener('input', debounce((e) => { state.q = e.target.value; paint(); }, 120));
    $$('.tab', root).forEach(t => t.addEventListener('click', () => {
      state.subject = t.dataset.subject;
      $$('.tab', root).forEach(x => x.setAttribute('aria-selected', String(x === t)));
      paint();
    }));
    root.querySelector('#exp-diff').addEventListener('change', (e) => { state.difficulty = e.target.value; paint(); });
    root.querySelector('#exp-sort').addEventListener('change', (e) => { state.sort = e.target.value; paint(); });
    queueMicrotask(paint);
    return root;
  }

  /* ============================================================
     Experiment page
     ============================================================ */
  const STEPS = [
    { id: 'aim', label: 'Aim' }, { id: 'theory', label: 'Theory' },
    { id: 'sim', label: 'Simulate' }, { id: 'obs', label: 'Observe' },
    { id: 'graph', label: 'Graph' },
    { id: 'conclusion', label: 'Conclusion' }
  ];

  const EXP_CONFIG = {
    e_pendulum: {
      simulator: 'pendulum',
      columns: [
        { key: 'L', label: 'Length', unit: 'm', decimals: 2 },
        { key: 'T', label: 'Period', unit: 's', decimals: 3 },
        { key: 'T2', label: 'T²', unit: 's²', decimals: 3 }
      ],
      record: (sim) => ({ L: sim.L, T: sim.T, T2: Number((sim.T * sim.T).toFixed(4)) }),
      plot: { x: 'L', y: 'T2', xLabel: 'Length L (m)', yLabel: 'T² (s²)', throughOrigin: true }
    },
    e_ohm: {
      simulator: 'ohm',
      columns: [
        { key: 'V', label: 'Voltage', unit: 'V', decimals: 2 },
        { key: 'R', label: 'Resistance', unit: 'Ω', decimals: 2 },
        { key: 'I', label: 'Current', unit: 'A', decimals: 3 }
      ],
      record: (sim) => ({ V: sim.V, R: sim.R, I: sim.I }),
      plot: { x: 'I', y: 'V', xLabel: 'Current I (A)', yLabel: 'Voltage V (V)', throughOrigin: true }
    },
    e_titration: {
      simulator: 'titration',
      columns: [
        { key: 'trial', label: 'Trial', unit: '', decimals: 0 },
        { key: 'V', label: 'Volume of NaOH', unit: 'mL', decimals: 1 },
        { key: 'M', label: 'Molarity of HCl', unit: 'M', decimals: 4 }
      ],
      record: (sim, rows) => ({ trial: rows.length + 1, V: sim.V, M: sim.M == null ? null : sim.M }),
      plot: { x: 'trial', y: 'V', xLabel: 'Trial number', yLabel: 'Volume of NaOH (mL)', throughOrigin: false }
    },
    e_projectile: {
      simulator: 'projectile',
      columns: [
        { key: 'u', label: 'Launch speed', unit: 'm/s', decimals: 1 },
        { key: 'angle', label: 'Angle', unit: '°', decimals: 1 },
        { key: 'R', label: 'Range', unit: 'm', decimals: 2 }
      ],
      record: (sim) => ({ u: sim.u, angle: sim.angle, R: sim.R }),
      plot: { x: 'angle', y: 'R', xLabel: 'Launch angle θ (°)', yLabel: 'Range R (m)', throughOrigin: false }
    },
    e_magnetic: {
      simulator: 'magnetic',
      columns: [
        { key: 'I', label: 'Current', unit: 'A', decimals: 2 },
        { key: 'r', label: 'Distance', unit: 'cm', decimals: 1 },
        { key: 'B', label: 'Field B', unit: 'mT', decimals: 3 }
      ],
      record: (sim) => ({ I: sim.I, r: sim.r, B: sim.B }),
      plot: { x: 'r', y: 'B', xLabel: 'Distance r (cm)', yLabel: 'Field B (mT)', throughOrigin: false }
    },
    e_lens: {
      simulator: 'lens',
      columns: [
        { key: 'u', label: 'Object distance', unit: 'cm', decimals: 1 },
        { key: 'v', label: 'Image distance', unit: 'cm', decimals: 2 },
        { key: 'm', label: 'Magnification', unit: '', decimals: 2 }
      ],
      record: (sim) => ({ u: sim.u, v: sim.v, m: sim.m }),
      plot: { x: 'u', y: 'v', xLabel: 'Object distance u (cm)', yLabel: 'Image distance v (cm)', throughOrigin: false }
    },
    e_ph: {
      simulator: 'ph',
      columns: [
        { key: 'solution', label: 'Solution', unit: '', decimals: 0 },
        { key: 'pH', label: 'pH', unit: '', decimals: 1 }
      ],
      record: (sim, rows) => ({ index: rows.length + 1, solution: sim.solution, pH: sim.pH }),
      plot: { x: 'index', y: 'pH', xLabel: 'Reading #', yLabel: 'pH', throughOrigin: false }
    },
        e_refraction: {
      simulator: 'refraction',
      columns: [
        { key: 'i', label: 'Angle of incidence', unit: '°', decimals: 1 },
        { key: 'r', label: 'Angle of refraction', unit: '°', decimals: 2 },
        { key: 'sinI', label: 'sin i', unit: '', decimals: 4 },
        { key: 'sinR', label: 'sin r', unit: '', decimals: 4 }
      ],
      record: (sim) => ({ i: sim.i, r: sim.r, sinI: sim.sinI, sinR: sim.sinR }),
      plot: { x: 'sinR', y: 'sinI', xLabel: 'sin r', yLabel: 'sin i', throughOrigin: true }
    },
    e_flame: {
      simulator: 'flame',
      columns: [
        { key: 'metal', label: 'Metal', unit: '', decimals: 0 },
        { key: 'colour', label: 'Flame colour', unit: '', decimals: 0 },
        { key: 'wavelength', label: 'Wavelength', unit: 'nm', decimals: 0 }
      ],
      record: (sim, rows) => ({ index: rows.length + 1, metal: sim.metal, colour: sim.colour, wavelength: sim.wavelength }),
      plot: { x: 'index', y: 'wavelength', xLabel: 'Reading #', yLabel: 'Wavelength (nm)', throughOrigin: false }
    }
  };

  function draftFor(userId, expId) { return drafts()[draftKey(userId, expId)] || null; }
  function saveDraft(userId, expId, patch) {
    store.update(s => {
      s.drafts = s.drafts || {};
      const k = draftKey(userId, expId);
      s.drafts[k] = Object.assign(
        { readings: [], answers: {}, conclusion: '', updatedAt: Date.now() },
        s.drafts[k] || {}, patch, { updatedAt: Date.now() }
      );
    });
  }
  function clearDraft(userId, expId) {
    store.update(s => { if (s.drafts) delete s.drafts[draftKey(userId, expId)]; });
  }
    function quizzesView() {
    const s = session();
    const mySubs = mySubmissions(s.id);
    
    // Get all experiments that actually have quiz questions
    const allQuizzes = experiments().filter(e => e.quiz && e.quiz.length > 0);

    const root = document.createElement('div');
    
    root.innerHTML = `
      <div class="section-head">
        <h2>Quizzes</h2>
        <span style="color:var(--ink-3);font-size:14px">${allQuizzes.length} available</span>
      </div>
      <p style="color:var(--ink-3);font-size:15px;margin-bottom:20px">
        Test your knowledge. Quizzes are separate from experiment reports, so you can take them anytime.
      </p>

      <div class="exp-grid" data-stagger>
        ${allQuizzes.map((e, i) => {
          // Check if the student has submitted answers for this quiz
          const sub = mySubs.find(x => x.experimentId === e.id && x.quizTotal > 0);
          const isDone = !!sub && sub.quizScore != null;
          const score = isDone ? `${sub.quizScore}/${sub.quizTotal}` : null;
          
          return `
            <div class="panel fade-up" style="display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:20px;">
              <div class="exp-card__head">
                <div>
                  <div class="chip" style="margin-bottom:8px">${escapeHtml(e.subject)}</div>
                  <div class="exp-card__title">${escapeHtml(e.title)}</div>
                </div>
              </div>
              
              <div style="font-size:14px;color:var(--ink-3)">
                ${e.quiz.length} question${e.quiz.length === 1 ? '' : 's'} · ${e.duration} min
              </div>

              <div style="margin-top:auto; padding-top:16px; display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--line);">
                ${isDone 
                  ? `<span class="chip chip--green">${icons.svg('check', { size: 12 })} Score: ${score}</span>`
                  : `<span class="chip chip--orange">Not taken yet</span>`
                }
                
                <!-- This links to the NEW standalone quiz page -->
                <a href="#/quiz/${e.id}" class="btn btn--primary btn--sm">
                  ${isDone ? 'Retake Quiz' : 'Start Quiz'} ${icons.svg('arrow-right', { size: 14 })}
                </a>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // If there are no quizzes, show a nice empty state
    if (allQuizzes.length === 0) {
      root.innerHTML = `
        <div class="section-head"><h2>Quizzes</h2></div>
        <div class="panel">
          <div class="empty-note">No quizzes have been published yet. Check back later!</div>
        </div>
      `;
    }

    return root;
  }
  function experimentPage(id) {
    const s = session();
    const exp = experimentById(id);
    if (!exp) { router.replace('/experiments'); return null; }

    const cfg = EXP_CONFIG[id];
    const hasSimulator = cfg && typeof VL.simulators?.get === 'function' && VL.simulators.get(cfg.simulator);
    const safeCfg = cfg || {
      simulator: null,
      columns: [{ key: 'reading', label: 'Reading', unit: '', decimals: 2 }],
      record: () => null,
      plot: { x: 'x', y: 'y', xLabel: 'x', yLabel: 'y', throughOrigin: false }
    };

    const draft = draftFor(s.id, id) || { readings: [], answers: {}, conclusion: '' };
    const readingRows = Array.isArray(draft.readings) ? draft.readings.slice() : [];
    const answers = Object.assign({}, draft.answers || {});
    let conclusion = draft.conclusion || '';

    const root = document.createElement('div');
    const heroId = 'exp-hero-' + exp.id;

    root.innerHTML = `
      <div class="exp-hero glass" style="view-transition-name:${heroId}">
        <div class="exp-hero__left">
          <a class="back" href="#/experiments">${icons.svg('chevron-left', { size: 14 })}<span>All experiments</span></a>
          <h1>${escapeHtml(exp.title)}</h1>
          <div class="meta">
            <span class="chip chip--blue">${escapeHtml(exp.subject)}</span>
            <span class="chip">${exp.duration} min</span>
            <span class="chip">${escapeHtml(exp.difficulty)}</span>
            <span class="chip">${icons.svg('clock', { size: 12 })} autosaves</span>
          </div>
        </div>
        <div style="text-align:right"><div class="card__eyebrow" style="margin-bottom:4px">Draft</div><div id="draft-state" style="font-size:13px;color:var(--ink-3)">Saved just now</div></div>
      </div>

      <nav class="stepper glass" aria-label="Experiment steps">
        ${STEPS.map((st, i) => `<a class="stepper__step" href="#sec-${st.id}" data-step="${st.id}"><span class="num">${i + 1}</span><span>${st.label}</span></a>`).join('')}
      </nav>

      <section class="exp-section panel" id="sec-aim">
        <h2>Aim</h2>
        <p>${escapeHtml(exp.aim)}</p>
        <details><summary>Apparatus &amp; materials</summary><ul class="apparatus">${(exp.apparatus || []).map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul></details>
      </section>

      <section class="exp-section panel" id="sec-theory">
        <h2>Theory</h2>
        <p>${escapeHtml(exp.theory)}</p>
      </section>

      <section class="exp-section panel" id="sec-sim">
        <h2>Simulator</h2>
        <p style="color:var(--ink-3);font-size:15px">${hasSimulator
          ? 'Move the sliders. The readout updates live. When a run looks good, record it below.'
          : 'This experiment does not have an interactive simulator yet.'}</p>
        <div class="sim">
          <div class="sim__stage" id="sim-stage" role="img" aria-label="Simulator"></div>
          <div class="sim__controls" id="sim-controls"></div>
        </div>
      </section>

      <section class="exp-section panel" id="sec-obs">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <h2 style="margin-bottom:0">Observations</h2>
          <button class="btn btn--primary btn--sm" type="button" id="record-reading" style="transition:all .2s"${hasSimulator ? '' : ' disabled aria-disabled="true"'}>${icons.svg('plus', { size: 14 })}<span>Record reading</span></button>
        </div>
        <div style="overflow:auto;margin-top:12px"><table class="obs-table" id="obs-table"><thead><tr>${safeCfg.columns.map(c => `<th>${escapeHtml(c.label)}${c.unit ? ` <span style="text-transform:none;letter-spacing:0">(${escapeHtml(c.unit)})</span>` : ''}</th>`).join('')}<th style="width:72px" aria-label="Actions"></th></tr></thead><tbody id="obs-body"></tbody></table></div>
        <div id="obs-empty"></div>
      </section>

      <section class="exp-section panel" id="sec-graph">
        <h2>Graph</h2>
        <div class="plot-wrap"><svg class="plot" id="plot" viewBox="0 0 480 320" role="img" aria-label="Auto-plotted graph"></svg></div>
        <div id="fit-line" style="font-size:13px;color:var(--ink-3);margin-top:6px"></div>
      </section>

            <!-- REPLACE THE OLD sec-quiz WITH THIS -->
      <section class="exp-section panel" id="sec-quiz-cta">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="margin:0;font-size:18px">Quick Check</h2>
            <p style="margin:4px 0 0;color:var(--ink-3);font-size:14px">Ready to test your knowledge on this experiment?</p>
          </div>
          <a href="#/quiz/${exp.id}" class="btn btn--primary">Take the Quiz ${icons.svg('arrow-right', { size: 16 })}</a>
        </div>
      </section>

      <section class="exp-section panel" id="sec-conclusion">
        <h2>Conclusion</h2>
        <p style="color:var(--ink-3);font-size:15px;margin-bottom:12px">Two or three sentences. What did you find, and does it match the theory?</p>
        <textarea class="textarea" id="conclusion" placeholder="e.g. T² vs L is a straight line through the origin, so T ∝ √L as predicted…"></textarea>
        <div class="submit-bar">
          <span class="submit-hint" id="submit-hint">Readings will be checked before you submit.</span>
          <button class="btn" type="button" id="save-now">${icons.svg('check', { size: 16 })}<span>Save draft</span></button>
          <button class="btn btn--primary" type="button" id="submit-report">${icons.svg('upload', { size: 16 })}<span>Submit report</span></button>
        </div>
      </section>`;

    const obsBody = root.querySelector('#obs-body');
    const obsEmpty = root.querySelector('#obs-empty');
    const plotEl = root.querySelector('#plot');
    const fitLineEl = root.querySelector('#fit-line');
    const conclEl = root.querySelector('#conclusion');
    const quizBody = root.querySelector('#quiz-body');
    const hint = root.querySelector('#submit-hint');
    conclEl.value = conclusion;

    let saveTimer = null;
    function markSaved() {
      const st = root.querySelector('#draft-state'); if (!st) return;
      st.textContent = 'Saved just now';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { st.textContent = 'Draft saved'; }, 1600);
    }
    const autosave = debounce((patch) => { saveDraft(s.id, id, patch); markSaved(); }, 400);

    const sim = hasSimulator ? VL.simulators.get(cfg.simulator) : null;
    const stage = root.querySelector('#sim-stage');
    const controls = root.querySelector('#sim-controls');
    if (sim) sim.mount(stage, controls, () => {});
    else {
      stage.innerHTML = `<div class="empty-note" style="padding:44px 20px;text-align:center"><b style="display:block;font-size:15px;color:var(--ink-2);margin-bottom:6px">Simulator coming soon</b><span style="font-size:13px">This experiment's interactive simulation is still being built.</span></div>`;
      controls.innerHTML = '';
    }

    function paintObs() {
      obsBody.innerHTML = '';
      if (!readingRows.length) obsEmpty.innerHTML = `<div class="empty-note">No readings yet.${hasSimulator ? ' Set the simulator, then press <b>Record reading</b>.' : ' Use the edit button in the table to enter readings manually.'}</div>`;
      else obsEmpty.innerHTML = '';

      readingRows.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = safeCfg.columns.map(c => {
          const v = row[c.key];
          const text = v == null ? '—' : (typeof v === 'number' ? v.toFixed(c.decimals) : String(v));
          return `<td class="tnum">${escapeHtml(text)}</td>`;
        }).join('') +
        `<td class="actions"><span class="row-actions"><button class="icon-btn" type="button" data-act="edit" data-i="${i}" aria-label="Edit">${icons.svg('edit', { size: 15 })}</button><button class="icon-btn" type="button" data-act="del" data-i="${i}" aria-label="Delete">${icons.svg('trash', { size: 15 })}</button></span></td>`;
        obsBody.appendChild(tr);
      });

      obsBody.querySelectorAll('[data-act]').forEach(b => {
        b.addEventListener('click', () => {
          const i = Number(b.dataset.i);
          if (b.dataset.act === 'del') {
            readingRows.splice(i, 1);
            saveDraft(s.id, id, { readings: readingRows });
            markSaved(); paintObs(); updateSubmitState();
          } else editReading(i);
        });
      });
      paintPlot(); updateSubmitState();
    }

    function editReading(i) {
      const row = readingRows[i] || {};
      const dialog = document.createElement('div');
      dialog.className = 'modal glass glass--refract open';
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
      dialog.innerHTML = `
        <div class="modal__head">
          <div class="modal__title">Edit reading ${i + 1}</div>
          <button class="icon-btn" type="button" data-close aria-label="Close">${icons.svg('x', { size: 16 })}</button>
        </div>
        <div class="modal__body" style="display:flex;flex-direction:column;gap:16px">
          ${safeCfg.columns.map(c => `<div class="field"><label class="field__label" for="ed-${c.key}">${escapeHtml(c.label)}${c.unit ? ` (${escapeHtml(c.unit)})` : ''}</label><input class="input" id="ed-${c.key}" type="text" value="${escapeHtml(String(row[c.key] ?? ''))}"></div>`).join('')}
        </div>
        <div class="modal__foot">
          <button class="btn" type="button" data-close>Cancel</button>
          <button class="btn btn--primary" type="button" data-save>Save</button>
        </div>`;
      const scrim = document.createElement('div'); scrim.className = 'modal-scrim open';
      document.body.appendChild(scrim); document.body.appendChild(dialog);
      const close = () => { dialog.remove(); scrim.remove(); };
      scrim.addEventListener('click', close);
      dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
      dialog.querySelector('[data-save]').addEventListener('click', () => {
        safeCfg.columns.forEach(c => {
          const v = dialog.querySelector('#ed-' + c.key).value;
          if (v === '') { row[c.key] = null; return; }
          const num = Number(v);
          row[c.key] = Number.isFinite(num) && /^-?\d/.test(v) ? num : v;
        });
        readingRows[i] = row;
        saveDraft(s.id, id, { readings: readingRows });
        markSaved(); close(); paintObs();
      });
      dialog.querySelector('.input')?.focus();
    }

    root.querySelector('#record-reading').addEventListener('click', (e) => {
      if (!sim) return;
      const simState = sim.state() || {};
      const row = safeCfg.record(simState, readingRows);
      if (!row || Object.values(row).every(v => v == null)) { toast.warn('Nothing to record yet — adjust the simulator first.'); return; }
      readingRows.push(row);
      saveDraft(s.id, id, { readings: readingRows });
      markSaved(); paintObs();
      const btn = e.currentTarget;
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => btn.style.transform = '', 150);
      if (navigator.vibrate) navigator.vibrate(40);
      toast.success(`Reading ${readingRows.length} added.`);
    });

    function niceNum(v) {
      const a = Math.abs(v);
      if (a >= 100) return v.toFixed(0);
      if (a >= 10) return v.toFixed(1);
      if (a >= 1) return v.toFixed(2);
      return v.toFixed(3);
    }
    function physicalSlopeNote(expId, slope) {
      if (expId === 'e_pendulum') { const g = 4 * Math.PI * Math.PI / slope; return `this gives g ≈ ${g.toFixed(2)} m/s²`; }
      if (expId === 'e_ohm') return `this gives R ≈ ${slope.toFixed(2)} Ω`;
      return '';
    }

    function paintPlot() {
      const { x, y, xLabel, yLabel, throughOrigin } = safeCfg.plot;
      const pts = readingRows.map(r => ({ x: Number(r[x]), y: Number(r[y]) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      plotEl.innerHTML = '';
      const W = 480, H = 320, m = { t: 20, r: 20, b: 46, l: 60 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
      const NS = 'http://www.w3.org/2000/svg';
      const el = (t, attrs) => { const n = document.createElementNS(NS, t); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

      plotEl.appendChild(el('line', { class: 'axis', x1: m.l, y1: m.t + ih, x2: m.l + iw, y2: m.t + ih }));
      plotEl.appendChild(el('line', { class: 'axis', x1: m.l, y1: m.t, x2: m.l, y2: m.t + ih }));
      const xl = el('text', { class: 'axis-label', x: m.l + iw / 2, y: H - 12, 'text-anchor': 'middle' }); xl.textContent = xLabel; plotEl.appendChild(xl);
      const yl = el('text', { class: 'axis-label', x: 14, y: m.t + ih / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${m.t + ih / 2})` }); yl.textContent = yLabel; plotEl.appendChild(yl);

      if (!pts.length) {
        const empty = el('text', { class: 'tick-label', x: W / 2, y: H / 2, 'text-anchor': 'middle' });
        empty.textContent = 'No readings yet.';
        plotEl.appendChild(empty); fitLineEl.textContent = ''; return;
      }

      let xMin = Math.min(...pts.map(p => p.x)), xMax = Math.max(...pts.map(p => p.x));
      let yMin = Math.min(...pts.map(p => p.y)), yMax = Math.max(...pts.map(p => p.y));
      if (xMin === xMax) { xMin -= 1; xMax += 1; }
      if (yMin === yMax) { yMin -= 1; yMax += 1; }
      xMin = Math.max(0, xMin - (xMax - xMin) * 0.08); xMax += (xMax - xMin) * 0.08;
      yMin = Math.max(0, yMin - (yMax - yMin) * 0.10); yMax += (yMax - yMin) * 0.10;

      const X = (v) => m.l + ((v - xMin) / (xMax - xMin)) * iw;
      const Y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

      for (let i = 0; i <= 4; i++) {
        const v = xMin + (xMax - xMin) * (i / 4); const px = X(v);
        plotEl.appendChild(el('line', { class: 'grid', x1: px, y1: m.t, x2: px, y2: m.t + ih }));
        const t = el('text', { class: 'tick-label', x: px, y: m.t + ih + 16, 'text-anchor': 'middle' }); t.textContent = niceNum(v); plotEl.appendChild(t);
      }
      for (let i = 0; i <= 3; i++) {
        const v = yMin + (yMax - yMin) * (i / 3); const py = Y(v);
        plotEl.appendChild(el('line', { class: 'grid', x1: m.l, y1: py, x2: m.l + iw, y2: py }));
        const t = el('text', { class: 'tick-label', x: m.l - 8, y: py + 4, 'text-anchor': 'end' }); t.textContent = niceNum(v); plotEl.appendChild(t);
      }

      let slope, intercept;
      if (throughOrigin) {
        const num = pts.reduce((a, p) => a + p.x * p.y, 0), den = pts.reduce((a, p) => a + p.x * p.x, 0);
        slope = den ? num / den : 0; intercept = 0;
      } else {
        const n = pts.length;
        const sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
        const sxy = pts.reduce((a, p) => a + p.x * p.y, 0), sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
        const d = n * sxx - sx * sx;
        slope = d ? (n * sxy - sx * sy) / d : 0;
        intercept = n ? (sy - slope * sx) / n : 0;
      }

      if (pts.length >= 2) {
        plotEl.appendChild(el('line', { class: 'fit',
          x1: X(xMin), y1: Y(slope * xMin + intercept),
          x2: X(xMax), y2: Y(slope * xMax + intercept) }));
      }
      pts.forEach(p => plotEl.appendChild(el('circle', { class: 'point', cx: X(p.x), cy: Y(p.y), r: 5.5 })));

      if (pts.length >= 2) {
        const physical = physicalSlopeNote(exp.id, slope);
        fitLineEl.innerHTML = `Best-fit: slope ≈ <b class="tnum">${slope.toFixed(3)}</b>${intercept && Math.abs(intercept) > 0.01 ? `, intercept ≈ ${intercept.toFixed(3)}` : ''}${physical ? ` — ${physical}` : ''}`;
      } else fitLineEl.textContent = 'Add one more reading to fit a line.';
    }

    
      function playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      } else if (type === 'wrong') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.2); // A2
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) { /* Audio not supported */ }
  }
    


    conclEl.addEventListener('input', () => { conclusion = conclEl.value; autosave({ conclusion }); updateSubmitState(); });
    root.querySelector('#save-now').addEventListener('click', () => { saveDraft(s.id, id, { readings: readingRows, answers, conclusion }); markSaved(); toast.success('Draft saved.'); });

       function updateSubmitState() {
      const need = [];
      if (readingRows.length < 2) need.push('at least 2 readings');
      if (conclusion.trim().length < 20) need.push('a conclusion (20+ characters)');
      const btn = root.querySelector('#submit-report');
      const can = need.length === 0;
      btn.disabled = !can;
      btn.setAttribute('aria-disabled', String(!can));
      hint.textContent = can ? 'Ready to submit. Your teacher will see this report.' : `Still need: ${need.join(', ')}.`;
    }

        root.querySelector('#submit-report').addEventListener('click', () => {
      const submission = {
        id: 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        studentId: s.id, studentName: s.name,
        experimentId: exp.id, experimentTitle: exp.title,
        submittedAt: Date.now(),
        readings: readingRows.slice(),
        answers: {}, // Empty, filled by separate quiz page
        quizScore: 0, quizTotal: exp.quiz ? exp.quiz.length : 0,
        conclusion: conclusion.trim(),
        status: 'pending', score: null, feedback: ''
      };
      // ... rest of the save logic stays the same
      const written = store.update(st => { st.submissions = st.submissions || []; st.submissions.unshift(submission); return true; });
      if (!written) { toast.error('Could not save your report. Check storage, then try again.'); return; }
      clearDraft(s.id, exp.id); markActiveToday(s.id);
      try { playSuccess(); } catch (err) { console.warn('[playSuccess]', err); }
      toast.success('Report submitted. Nice work.');
      setTimeout(() => router.go('/progress'), 700);
    });

    queueMicrotask(() => {
      paintObs(); paintQuiz(); updateSubmitState();
      const stepLinks = $$('.stepper__step', root);
      const sections = $$('.exp-section', root);
      stepLinks.forEach(link => link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetEl = document.getElementById(link.getAttribute('href').substring(1));
        if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          const sid = en.target.id.replace(/^sec-/, '');
          stepLinks.forEach(a => a.dataset.step === sid ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'));
        });
      }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
      sections.forEach(sec => io.observe(sec));
    });

    return root;
  }

  /* ============================================================
     Success animation
     ============================================================ */
  function playSuccess() {
    if (VL.prefersReducedMotion()) return;
    const overlay = document.createElement('div'); overlay.className = 'done-overlay';
        overlay.innerHTML = `<div class="badge" style="background: var(--green) !important; color: #fff !important; box-shadow: 0 24px 60px rgba(52, 199, 89, .40), inset 0 1px 0 rgba(255, 255, 255, .35) !important;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path class="check-draw" style="--len:40" d="m4.5 12.5 5 5 10-11"/></svg></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));
    const cv = document.createElement('canvas'); cv.id = 'confetti';
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    cv.style.width = '100%'; cv.style.height = '100%'; document.body.appendChild(cv); cv.classList.add('on');
    const ctx = cv.getContext('2d');
    const colours = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE'];
    const parts = []; const cx = cv.width / 2, cy = cv.height / 2;
    for (let i = 0; i < 70; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * (3 + Math.random() * 5), vy: Math.sin(a) * (3 + Math.random() * 5), g: 0.22, life: 1, size: 4 + Math.random() * 4, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, colour: colours[(Math.random() * colours.length) | 0] });
    }
    const start = performance.now();
    function frame(now) {
      const t = (now - start) / 1000; ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(p => {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life = Math.max(0, 1 - t / 1.1);
        ctx.save(); ctx.globalAlpha = p.life; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6); ctx.restore();
      });
      if (t < 1.15) requestAnimationFrame(frame);
      else { cv.remove(); overlay.classList.remove('on'); setTimeout(() => overlay.remove(), 260); }
    }
    requestAnimationFrame(frame);
  }
    function quizView(id) {
    const s = session();
    const exp = experimentById(id);
    if (!exp || !exp.quiz || !exp.quiz.length) { router.replace('/quizzes'); return null; }

    const mySubs = mySubmissions(s.id).filter(x => x.experimentId === id);
    const latestSub = mySubs[0];
    const answers = latestSub && latestSub.answers ? Object.assign({}, latestSub.answers) : {};

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="exp-hero glass" style="margin-bottom: 20px;">
        <div class="exp-hero__left">
          <a class="back" href="#/quizzes">${icons.svg('chevron-left', { size: 14 })}<span>All Quizzes</span></a>
          <h1>Quiz: ${escapeHtml(exp.title)}</h1>
          <div class="meta">
            <span class="chip chip--blue">${exp.quiz.length} Questions</span>
            ${latestSub && latestSub.quizScore != null ? `<span class="chip chip--green">Previous Score: ${latestSub.quizScore}/${latestSub.quizTotal}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="panel" id="quiz-container"></div>
      <div class="submit-bar" style="margin-top: 20px; justify-content: flex-end;">
        <button class="btn btn--primary btn--lg" id="submit-quiz" disabled>Submit Quiz</button>
      </div>
    `;

    const container = root.querySelector('#quiz-container');
    const submitBtn = root.querySelector('#submit-quiz');

    function paintQuiz() {
      container.innerHTML = '';
      exp.quiz.forEach((q, i) => {
        const chosen = answers[i];
        const locked = chosen != null;
        const wrap = document.createElement('div');
        wrap.className = 'quiz__q';
        wrap.innerHTML = `
          <div class="quiz__prompt"><span class="qnum">${i + 1}</span><span>${escapeHtml(q.q)}</span></div>
          <div class="quiz__opts">
            ${q.options.map((opt, oi) => {
              const isCorrect = oi === q.correct;
              const isChosen = chosen === oi;
              const cls = !locked ? '' : (isCorrect ? 'correct' : (isChosen ? 'wrong' : ''));
              return `<button class="quiz__opt ${cls}" type="button" data-q="${i}" data-o="${oi}" ${locked ? 'disabled' : ''}><span class="mark">${icons.svg('check', { size: 12, sw: 3 })}</span><span>${escapeHtml(opt)}</span></button>`;
            }).join('')}
          </div>`;
        container.appendChild(wrap);
      });

      container.querySelectorAll('.quiz__opt:not([disabled])').forEach(b => {
        b.addEventListener('click', () => {
          const qi = Number(b.dataset.q); const oi = Number(b.dataset.o);
          if (answers[qi] != null) return;
          answers[qi] = oi;
          paintQuiz();
          const right = oi === exp.quiz[qi].correct;
          if (right) playSound('correct');
          else {
            playSound('wrong');
            toast.warn(`Not quite. The right answer is: ${exp.quiz[qi].options[exp.quiz[qi].correct]}`);
          }
          checkSubmitState();
        });
      });
      checkSubmitState();
    }

    function checkSubmitState() {
      const allAnswered = exp.quiz.every((_, i) => answers[i] != null);
      submitBtn.disabled = !allAnswered;
    }

    submitBtn.addEventListener('click', () => {
      let right = 0;
      exp.quiz.forEach((q, i) => { if (answers[i] === q.correct) right++; });
      
      store.update(st => {
        st.submissions = st.submissions || [];
        let sub = st.submissions.find(x => x.studentId === s.id && x.experimentId === id);
        
        if (sub) {
          sub.answers = Object.assign({}, answers);
          sub.quizScore = right;
          sub.quizTotal = exp.quiz.length;
        } else {
          // If they haven't done the experiment yet, create a pending submission just for the quiz
          st.submissions.unshift({
            id: 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId: s.id, studentName: s.name,
            experimentId: exp.id, experimentTitle: exp.title,
            submittedAt: Date.now(),
            readings: [], answers: Object.assign({}, answers),
            quizScore: right, quizTotal: exp.quiz.length,
            conclusion: '', status: 'pending', score: null, feedback: ''
          });
        }
      });
      
      playSuccess();
      toast.success(`Quiz submitted! You scored ${right}/${exp.quiz.length}.`);
      setTimeout(() => router.go('/quizzes'), 1000);
    });

    paintQuiz();
    return root;
  }
  /* ============================================================
     Progress
     ============================================================ */
  function progressView() {
    const s = session();
    const all = experiments();
    const mySubs = mySubmissions(s.id);
    const graded = mySubs.filter(x => x.status === 'graded');
    const avg = graded.length ? graded.reduce((a, b) => a + (b.score || 0), 0) / graded.length : 0;
    const perfect = mySubs.some(x => x.quizTotal > 0 && x.quizScore === x.quizTotal);
    const streak = streakDays(s.id);

    const totalExps = all.length;
    const completedExpIds = new Set();
    mySubs.forEach(sub => { if (sub.status === 'graded' || sub.status === 'pending') completedExpIds.add(sub.experimentId); });
    const draftMap = drafts();
    let startedDrafts = 0;
    Object.keys(draftMap).forEach(k => {
      if (k.startsWith(s.id + '::')) {
        const eid = k.split('::')[1];
        if (!completedExpIds.has(eid)) startedDrafts++;
      }
    });
    const completed = completedExpIds.size;
    const remaining = Math.max(0, totalExps - completed);
    const pct = totalExps ? Math.round((completed / totalExps) * 100) : 0;
    const R = 52, C = 2 * Math.PI * R, dash = C * (pct / 100);
    const perExp = all.map(e => ({ exp: e, status: statusFor(s.id, e.id) }));

    const badges = [
      { key: 'first', icon: 'flask', name: 'First Experiment', hint: 'Submit one report.', unlocked: mySubs.length >= 1 },
      { key: 'streak', icon: 'sparkle', name: '3-Day Streak', hint: 'Open the lab three days in a row.', unlocked: streak >= 3 },
      { key: 'perfect', icon: 'award', name: 'Perfect Quiz', hint: 'Answer every question right.', unlocked: perfect },
      { key: 'five', icon: 'star', name: 'Five Reports', hint: 'Submit five reports.', unlocked: mySubs.length >= 5 }
    ];

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="section-head no-print"><h2>My progress</h2><button class="btn btn--sm" type="button" id="print-report">${icons.svg('download', { size: 14 })}<span>Print report</span></button></div>
      <div class="print-title">Virtual Lab — Report for ${escapeHtml(s.name)}<small>Generated ${new Date().toLocaleString()}</small></div>

      <div class="panel fade-up progress-completion" data-stagger style="margin-bottom:16px">
        <span class="card__eyebrow">Course completion</span>
        <div class="ring-wrap" style="margin-top:8px">
          <div class="ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="track" cx="60" cy="60" r="${R}" fill="none" stroke-width="10"></circle>
              <circle class="arc" cx="60" cy="60" r="${R}" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C - dash}"></circle>
            </svg>
            <div class="ring-label"><div><b>${pct}%</b><span>${completed} of ${totalExps} done</span></div></div>
          </div>
          <div style="min-width:0">
            <p style="font-size:15px;line-height:21px;color:var(--ink-2)"><b class="tnum">${completed}</b> experiment${completed === 1 ? '' : 's'} completed · <b class="tnum">${remaining}</b> remaining.</p>
            <div class="bar" style="margin-top:10px"><span class="bar__fill ${pct >= 75 ? 'bar__fill--green' : pct >= 40 ? '' : 'bar__fill--orange'}" style="transform:scaleX(${pct / 100});transform-origin:left"></span></div>
            ${startedDrafts ? `<p style="font-size:13px;color:var(--ink-3);margin-top:10px">${startedDrafts} experiment${startedDrafts === 1 ? '' : 's'} started but not yet submitted.</p>` : ''}
          </div>
        </div>
      </div>

      <div class="stat-row" data-stagger>
        <div class="stat fade-up"><div class="label">Reports submitted</div><span class="value tnum" data-count="${mySubs.length}">0</span><div class="sub">${mySubs.filter(x => x.status === 'pending').length} waiting on review</div></div>
        <div class="stat fade-up"><div class="label">Average score</div><span class="value tnum" data-count="${avg}" data-decimals="1">0</span><div class="sub">${graded.length ? `across ${graded.length} graded report${graded.length === 1 ? '' : 's'}` : 'No graded reports yet'}</div></div>
        <div class="stat fade-up"><div class="label">Current streak</div><span class="value tnum" data-count="${streak}">0</span><div class="sub">${streak ? 'day' + (streak === 1 ? '' : 's') + ' in a row' : 'start one today'}</div></div>
      </div>

      <div class="section-head"><h2>Badges</h2></div>
      <div class="badge-grid" data-stagger>
        ${badges.map(b => `<div class="badge fade-up ${b.unlocked ? '' : 'locked'}"><span class="medal">${icons.svg(b.icon, { size: 22 })}</span><b>${escapeHtml(b.name)}</b><span>${escapeHtml(b.hint)}</span></div>`).join('')}
      </div>

      <div class="section-head"><h2>Individual experiments</h2></div>
      <div class="panel" data-stagger>
        ${perExp.length ? perExp.map(({ exp, status }) => {
          const tone = status === 'graded' ? 'chip chip--green' : status === 'submitted' ? 'chip chip--orange' : status === 'in-progress' ? 'chip chip--orange' : status === 'changes' ? 'chip chip--red' : 'chip';
          const label = status === 'graded' ? 'Graded' : status === 'submitted' ? 'Submitted' : status === 'in-progress' ? 'In progress' : status === 'changes' ? 'Changes asked' : 'Not started';
          return `<div class="sub-row fade-up">
            <span class="status-dot status-dot--${status === 'graded' ? 'graded' : status === 'submitted' ? 'submitted' : status === 'in-progress' ? 'progress' : 'new'}" aria-hidden="true"></span>
            <div style="min-width:0"><div class="sub-title">${escapeHtml(exp.title)}</div><div class="sub-meta">${escapeHtml(exp.subject)} · ${exp.duration} min</div></div>
            <span class="${tone}">${label}</span>
          </div>`;
        }).join('') : `<div class="empty-note">No experiments have been published yet.</div>`}
      </div>

      <div class="section-head"><h2>Recent submissions</h2></div>
      <div class="panel" data-stagger>
        ${mySubs.length ? mySubs.map(x => {
          const sTone = x.status === 'graded' ? 'chip chip--green' : x.status === 'changes' ? 'chip chip--red' : 'chip chip--orange';
          const sLabel = x.status === 'graded' ? 'Graded' : x.status === 'changes' ? 'Changes asked' : 'Pending review';
          return `<div class="sub-row fade-up">
            <span class="status-dot status-dot--${x.status === 'graded' ? 'graded' : 'submitted'}" aria-hidden="true"></span>
            <div style="min-width:0"><div class="sub-title">${escapeHtml(x.experimentTitle)}</div><div class="sub-meta">${relativeDay(x.submittedAt)} · quiz ${x.quizScore}/${x.quizTotal} · <span class="${sTone}">${sLabel}</span></div>
            ${x.feedback ? `<div class="sub-meta" style="margin-top:6px;color:var(--ink-2)"><b style="font-weight:600">Teacher:</b> ${escapeHtml(x.feedback)}</div>` : ''}</div>
            <div class="sub-score tnum">${x.score == null ? '—' : x.score}<small>/10</small></div>
          </div>`;
        }).join('') : `<div class="empty-note">No reports yet.</div>`}
      </div>`;

    root.querySelector('#print-report').addEventListener('click', () => window.print());
    return root;
  }

  /* ============================================================
     404
     ============================================================ */
  function notFoundView() {
    const root = document.createElement('div'); root.className = 'nf';
    root.innerHTML = `<div class="nf__inner"><div class="nf__code">404</div><h1 style="font-size:24px;letter-spacing:-.018em;font-weight:600">That page isn't here</h1><p style="color:var(--ink-3);font-size:15px;line-height:22px">The link may be old, or the experiment was removed.</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:4px"><a class="btn btn--primary" href="#/home">${icons.svg('home', { size: 16 })}<span>Home</span></a><a class="btn" href="#/experiments">${icons.svg('flask', { size: 16 })}<span>Experiments</span></a></div></div>`;
    return root;
  }
  VL.notFound = () => { const v = $('#view'); if (v) setView(wrap(notFoundView())); else renderShell(); };

  /* ============================================================
     Palette
     ============================================================ */
  function rebuildPalette() {
    const s = session(); const items = [];
    if (!s) { items.push({ label: 'Sign in', icon: 'user', group: 'Page', run: () => router.go('/signin') }); palette.setItems(items); return; }
    const nav = s.role === 'admin' ? NAV_ADMIN : NAV_STUDENT;
    nav.forEach(it => items.push({ label: it.label, hint: it.href.replace('#', ''), icon: it.icon, group: 'Page', run: () => router.go(it.href.replace('#', '')) }));
    if (s.role === 'student') experiments().forEach(e => items.push({ label: e.title, hint: `${e.subject} · ${e.duration} min`, icon: 'flask', group: 'Experiment', run: () => router.go('/experiments/' + e.id) }));
    items.push({ label: 'Theme: Light', icon: 'sun', group: 'Theme', run: () => theme.set('light') });
    items.push({ label: 'Theme: Dark', icon: 'moon', group: 'Theme', run: () => theme.set('dark') });
    items.push({ label: 'Theme: Auto (day/night)', icon: 'monitor', group: 'Theme', run: () => theme.set('auto') });
    items.push({ label: 'Sign out', icon: 'logout', group: 'Account', run: () => { signOut(); toast.info('Signed out.'); router.replace('/signin'); } });
    (VL.paletteExtra || []).forEach(i => items.push(i));
    palette.setItems(items);
  }

  /* ============================================================
     Routes + boot
     ============================================================ */
  function registerRoutes() {
    router
      .register('/', () => { const s = session(); router.replace(s ? (s.role === 'admin' ? '/admin' : '/home') : '/signin'); })
      .register('/signin', () => { const s = session(); if (s) { router.replace(s.role === 'admin' ? '/admin' : '/home'); return; } renderShell(); setView(onboardingView()); })
      .register('/home', VL.guardStudent(() => { renderShell(); setView(wrap(homeView())); }))
      .register('/quizzes', VL.guardStudent(() => { renderShell(); setView(wrap(quizzesView())); }))
      .register('/quiz/:id', VL.guardStudent(({ id }) => { renderShell(); const page = quizView(id); if (page) setView(wrap(page)); }))
      .register('/experiments', VL.guardStudent(() => { renderShell(); setView(wrap(experimentsView())); }))
      .register('/experiments/:id', VL.guardStudent(({ id }) => { renderShell(); const page = experimentPage(id); if (page) setView(wrap(page)); }))
      .register('/progress', VL.guardStudent(() => { renderShell(); setView(wrap(progressView())); }));
    bus.on('route', () => { updateNavActive(); rebuildPalette(); });
    bus.on('auth', () => { renderShell(); updateNavActive(); rebuildPalette(); });
    bus.on('external-change', () => router.handle());
    bus.on('reset', () => { seedStudentExtras(); toast.info('Demo data reset.'); const s = session(); if (s) router.replace(s.role === 'admin' ? '/admin' : '/home'); else router.replace('/signin'); });
  }

  ready(() => {
    VL.mountBackground(); VL.injectRefractFilter();
    theme.init(); ensureSeed(); seedStudentExtras();
    registerRoutes(); renderShell(); rebuildPalette(); router.start();
    window.addEventListener('resize', debounce(updateNavActive, 120));
  });

  VL.app = {
    session, signIn, signOut,
    experiments, experimentById, submissions, statusFor, statusChip,
    streakDays, setView, wrap, renderShell, updateNavActive,
    seedStudentExtras, rebuildPalette, NAV_STUDENT, NAV_ADMIN
  };
})();