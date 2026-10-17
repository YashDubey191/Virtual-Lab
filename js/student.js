/* ============================================================
   student.js — session, shell, sign-in, home, experiments list,
   experiment page (simulator + table + plot + quiz + submit),
   progress screen. Also registers role guards used by admin.js.

   Everything on the page routes through VL.router so state is
   always driven by the URL hash.
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
     1.  Session
     ============================================================ */
  function session() { return store.get('session'); }
  function signIn(user) {
    store.set('session', {
      id: user.id, role: user.role, name: user.name,
      email: user.email, avatar: user.avatar || user.name.split(' ').map(w => w[0]).join('').slice(0, 2)
    });
    bus.emit('auth');
  }
  function signOut() {
    store.update(s => { delete s.session; });
    bus.emit('auth');
  }

  /* ============================================================
     2.  Role guards — exported so admin.js can reuse them
     ============================================================ */
  VL.guardStudent = (fn) => (params, meta) => {
    const s = session();
    if (!s) { router.replace('/signin'); return; }
    if (s.role !== 'student') { router.replace('/admin'); return; }
    fn(params, meta);
  };
  VL.guardAdmin = (fn) => (params, meta) => {
    const s = session();
    if (!s) { router.replace('/signin'); return; }
    if (s.role !== 'admin') {
      toast.warn("That area is for teachers — taking you home.");
      router.replace('/home');
      return;
    }
    fn(params, meta);
  };

  /* ============================================================
     3.  Data helpers
     ============================================================ */
  function experiments()      { return store.get('experiments', []) || []; }
  function experimentById(id) { return experiments().find(e => e.id === id); }
  function submissions()      { return store.get('submissions', []) || []; }
  function drafts()           { return store.get('drafts', {}) || {}; }
  function draftKey(uid, eid) { return `${uid}::${eid}`; }

  function mySubmissions(userId) {
    return submissions()
      .filter(s => s.studentId === userId)
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  }
  function statusFor(userId, expId) {
    const mine = mySubmissions(userId).filter(s => s.experimentId === expId);
    if (!mine.length) {
      const d = drafts()[draftKey(userId, expId)];
      if (d && (d.readings?.length || d.conclusion || d.answeredCount)) return 'in-progress';
      return 'new';
    }
    const latest = mine[0];
    return latest.status === 'graded' ? 'graded'
         : latest.status === 'changes' ? 'changes'
         : 'submitted';
  }
  function statusChip(status) {
    const map = {
      'new':          ['chip', 'New'],
      'in-progress':  ['chip chip--orange', 'In progress'],
      'submitted':    ['chip chip--orange', 'Submitted'],
      'graded':       ['chip chip--green', 'Graded'],
      'changes':      ['chip chip--red', 'Changes asked'],
      'pending':      ['chip chip--orange', 'Pending review']
    };
    const [cls, label] = map[status] || ['chip', status];
    return `<span class="${cls}">${label}</span>`;
  }

  function streakDays(userId) {
    const map = store.get('studentDays', {}) || {};
    const days = map[userId] || {};
    let count = 0;
    const d = new Date();
    while (count < 400) {
      const key = d.toISOString().slice(0, 10);
      if (!days[key]) break;
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }
  function markActiveToday(userId) {
    const today = new Date().toISOString().slice(0, 10);
    store.update(s => {
      s.studentDays = s.studentDays || {};
      s.studentDays[userId] = s.studentDays[userId] || {};
      s.studentDays[userId][today] = true;
    });
  }

  /* One-time demo extras for a fresh install. Runs on boot and on reset. */
  function seedStudentExtras() {
    // Per-student active days
    if (!store.get('studentDays')) {
      const map = {};
      const ids = ['u_1','u_2','u_3','u_4','u_5','u_6','u_7','u_8'];
      const today = new Date();
      ids.forEach((id, i) => {
        map[id] = {};
        const streak = 1 + (i % 4);
        for (let k = 0; k < streak; k++) {
          const d = new Date(today); d.setDate(d.getDate() - k);
          map[id][d.toISOString().slice(0, 10)] = true;
        }
      });
      store.set('studentDays', map);
    }

    // A couple of past submissions so progress and admin queues aren't empty.
    if (!(store.get('submissions') || []).length) {
      const now = Date.now();
      const demo = [
        {
          id: 'sub_demo_1',
          studentId: 'u_1', studentName: 'Aarav Sharma',
          experimentId: 'e_ohm', experimentTitle: "Ohm's Law — voltage, current, resistance",
          submittedAt: now - 1000 * 60 * 60 * 26,
          readings: [
            { V: 2, R: 10, I: 0.2 },
            { V: 4, R: 10, I: 0.4 },
            { V: 6, R: 10, I: 0.6 },
            { V: 8, R: 10, I: 0.8 }
          ],
          answers: { 0: 1, 1: 2, 2: 2 },
          quizScore: 3, quizTotal: 3,
          conclusion: 'V is proportional to I. The V–I graph is a straight line through the origin and the slope gives R ≈ 10 Ω.',
          status: 'graded', score: 8,
          feedback: 'Neat readings and the slope is spot on. Next time include the uncertainty in R.'
        },
        {
          id: 'sub_demo_2',
          studentId: 'u_1', studentName: 'Aarav Sharma',
          experimentId: 'e_titration', experimentTitle: 'Acid–Base Titration — find the strength of HCl',
          submittedAt: now - 1000 * 60 * 60 * 5,
          readings: [
            { trial: 1, V: 20.1, M: 0.1005 },
            { trial: 2, V: 19.9, M: 0.0995 },
            { trial: 3, V: 20.0, M: 0.1000 }
          ],
          answers: { 0: 1, 1: 0, 2: 2 },
          quizScore: 3, quizTotal: 3,
          conclusion: 'The three concordant readings give a mean of 20.0 mL. So the HCl molarity is 0.100 M.',
          status: 'pending', score: null, feedback: ''
        }
      ];
      store.set('submissions', demo);
    }
  }

  /* ============================================================
     4.  Shell — sidebar (desktop) + tab bar (mobile)
     ============================================================ */
  const NAV_STUDENT = [
    { href: '#/home',        label: 'Home',        icon: 'home' },
    { href: '#/experiments', label: 'Experiments', icon: 'flask' },
    { href: '#/progress',    label: 'Progress',    icon: 'chart' }
  ];
  const NAV_ADMIN = [
    { href: '#/admin',              label: 'Dashboard',   icon: 'chart' },
    { href: '#/admin/experiments',  label: 'Experiments', icon: 'flask' },
    { href: '#/admin/submissions',  label: 'Submissions', icon: 'clipboard' },
    { href: '#/admin/students',     label: 'Students',    icon: 'users' }
  ];

  function currentNavList() {
    const s = session();
    if (!s) return [];
    return s.role === 'admin' ? NAV_ADMIN : NAV_STUDENT;
  }

  function renderShell() {
    const app = $('#app');
    if (!$('#view', app)) {
      app.insertAdjacentHTML('beforeend', '<main id="view" tabindex="-1"></main>');
    }
    const s = session();

    // Signed out: no sidebar/tabbar, no top bar.
    $('#sidebar', app)?.remove();
    $('#tabbar', app)?.remove();
    $('#topbar', app)?.remove();
    if (!s) return;

    const items = currentNavList();
    const here = '#' + (location.hash.replace(/^#/, '') || '/home');
    const isAdmin = s.role === 'admin';
    const titleMap = {
      '#/home': 'Virtual Lab', '#/experiments': 'Experiments', '#/progress': 'Progress',
      '#/admin': 'Admin', '#/admin/experiments': 'Experiments',
      '#/admin/submissions': 'Submissions', '#/admin/students': 'Students'
    };

    /* Sidebar */
    const side = document.createElement('aside');
    side.id = 'sidebar';
    side.className = 'glass';
    side.setAttribute('aria-label', isAdmin ? 'Admin navigation' : 'Primary navigation');
    side.innerHTML =
      `<div class="sidebar__brand">${icons.svg('flask')}<b>Virtual Lab</b></div>` +
      `<div class="sidebar__group">
         <span class="sidebar__lens" aria-hidden="true"></span>
         ${items.map(it => `
           <a class="sidebar__item" href="${it.href}" data-href="${it.href}">
             ${icons.svg(it.icon, { size: 20 })}
             <span>${it.label}</span>
           </a>`).join('')}
       </div>` +
      `<div class="sidebar__foot">
         <span class="avatar" aria-hidden="true">${escapeHtml(s.avatar || '')}</span>
         <span class="sidebar__who">
           <b>${escapeHtml(s.name)}</b>
           <span>${escapeHtml(s.email)}</span>
         </span>
         <button class="icon-btn" type="button" data-action="theme" aria-label="Change theme" title="Change theme">
           ${icons.svg('sun', { size: 18 })}
         </button>
         <button class="icon-btn" type="button" data-action="signout" aria-label="Sign out" title="Sign out">
           ${icons.svg('logout', { size: 18 })}
         </button>
       </div>`;
    app.appendChild(side);

    /* Mobile top bar */
    const top = document.createElement('header');
    top.id = 'topbar';
    top.innerHTML =
      `<span class="brand">${icons.svg('flask', { size: 20 })}<span>${titleMap[here] || 'Virtual Lab'}</span></span>` +
      `<span class="spacer"></span>` +
      `<button class="icon-btn" type="button" data-action="theme" aria-label="Change theme">${icons.svg('sun', { size: 18 })}</button>` +
      `<button class="icon-btn" type="button" data-action="palette" aria-label="Search">${icons.svg('search', { size: 18 })}</button>`;
    app.prepend(top);

    /* Tab bar */
    const bar = document.createElement('nav');
    bar.id = 'tabbar';
    bar.className = 'glass';
    bar.setAttribute('aria-label', 'Primary');
    bar.innerHTML =
      `<span class="tabbar__lens" aria-hidden="true"></span>` +
      items.map(it => `
        <a class="tabbar__item" href="${it.href}" data-href="${it.href}">
          ${icons.svg(it.icon, { size: 22 })}
          <span>${it.label}</span>
        </a>`).join('');
    app.appendChild(bar);

    updateNavActive();
  }

  function updateNavActive() {
    const here = location.hash.replace(/^#/, '') || '/home';
    const list = currentNavList();
    // Longest match wins so /admin/experiments isn't beaten by /admin.
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
        if (on) { a.setAttribute('aria-current', 'page'); activeEl = a; }
        else a.removeAttribute('aria-current');
      });
      if (!lens || !activeEl) { if (lens) lens.style.opacity = '0'; return; }
      const cRect = container.getBoundingClientRect();
      const aRect = activeEl.getBoundingClientRect();
      lens.style.opacity = '1';
      if (isSidebar) {
        // Sidebar lens sits below the group label. Its parent is .sidebar__group.
        const parent = lens.parentElement.getBoundingClientRect();
        const y = aRect.top - parent.top;
        lens.style.transform = `translateY(${y}px)`;
        lens.style.height = aRect.height + 'px';
      } else {
        const x = aRect.left - cRect.left;
        lens.style.transform = `translateX(${x}px)`;
        lens.style.width = aRect.width + 'px';
      }
    };
    update($('#sidebar'), true);
    update($('#tabbar'), false);
  }

  /* Global click handlers for theme / sign-out / palette in the shell. */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.getAttribute('data-action');
    if (a === 'theme') {
      const mode = theme.cycle(e);
      toast.info(mode === 'auto' ? 'Theme follows your system.' : `Theme: ${mode}.`, { duration: 1800, icon: mode === 'dark' ? 'moon' : 'sun' });
    } else if (a === 'signout') {
      signOut();
      toast.info('Signed out. See you soon.');
      router.replace('/signin');
    } else if (a === 'palette') {
      palette.show();
    }
  });

  /* ============================================================
     5.  View helper
     ============================================================ */
  function setView(node) {
    const v = $('#view');
    if (!v) return;
    v.innerHTML = '';
    v.appendChild(node);
    window.scrollTo(0, 0);
    observeReveals(v);
    attachSpecular(v);
    $$('.card, .panel, .home-continue, .exp-card', v).forEach(el => attachTilt(el, 4));
    // Count-up elements
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
     6.  Sign-in
     ============================================================ */
  function signinView() {
    const root = document.createElement('div');
    root.className = 'signin';
    root.innerHTML = `
      <div class="signin__card glass glass--refract">
        <div class="signin__brand">
          <span class="signin__mark">${icons.svg('flask', { size: 28, sw: 1.75 })}</span>
          <h1>Virtual Lab</h1>
          <p>Run the experiment, record what you see, submit your report. Nothing here can explode.</p>
        </div>

        <div class="segmented" role="tablist" aria-label="Sign in as">
          <span class="segmented__thumb" aria-hidden="true"></span>
          <button class="segmented__btn" role="tab" aria-selected="true"  data-role="student" type="button">Student</button>
          <button class="segmented__btn" role="tab" aria-selected="false" data-role="admin"   type="button">Teacher</button>
        </div>

        <form id="signin-form" style="display:flex;flex-direction:column;gap:16px">
          <div class="field">
            <label class="field__label" for="si-email">Email</label>
            <input class="input" id="si-email" name="email" type="email" autocomplete="username" required>
          </div>
          <div class="field">
            <label class="field__label" for="si-pass">Password</label>
            <input class="input" id="si-pass" name="password" type="password" autocomplete="current-password" value="demo" required>
            <span class="field__hint">Demo password is <b>demo</b>. Nothing is checked.</span>
          </div>
          <button class="btn btn--primary btn--lg" type="submit">
            <span>Sign in</span>
            ${icons.svg('arrow-right', { size: 18 })}
          </button>
        </form>

        <div>
          <div class="field__hint" style="margin-bottom:6px">Try a demo account:</div>
          <div class="demo-fill" id="demo-fill">
            <button type="button" data-email="aarav@student.edu" data-role="student">Aarav · Student</button>
            <button type="button" data-email="diya@student.edu"  data-role="student">Diya · Student</button>
            <button type="button" data-email="meera@lab.edu"     data-role="admin">Dr. Iyer · Teacher</button>
          </div>
        </div>
      </div>`;

    let mode = 'student';

    const thumb = root.querySelector('.segmented__thumb');
    const segBtns = $$('.segmented__btn', root);
    const email = root.querySelector('#si-email');

    function setMode(next) {
      mode = next;
      segBtns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.role === next)));
      thumb.style.transform = next === 'admin' ? 'translateX(100%)' : 'translateX(0)';
      email.value = next === 'admin' ? 'meera@lab.edu' : 'aarav@student.edu';
    }
    segBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.role)));
    setMode('student');

    $$('#demo-fill button', root).forEach(b => {
      b.addEventListener('click', () => {
        setMode(b.dataset.role);
        email.value = b.dataset.email;
        root.querySelector('#si-pass').focus();
      });
    });

    root.querySelector('#signin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const emailVal = email.value.trim().toLowerCase();
      const users = store.get('users', []) || [];
      const user = users.find(u => u.email.toLowerCase() === emailVal);
      if (!user) {
        toast.error("We couldn't find that account. Try one of the demo chips.");
        return;
      }
      signIn(user);
      markActiveToday(user.id);
      renderShell();
      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`);
      router.replace(user.role === 'admin' ? '/admin' : '/home');
    });

    return root;
  }

  /* ============================================================
     7.  Home
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
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 7) return `${d} days ago`;
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function upcomingDeadlines() {
    const now = new Date();
    const list = [
      { title: "Ohm's Law write-up",              subject: 'Physics',   days: 2 },
      { title: 'Titration — three concordant runs', subject: 'Chemistry', days: 4 },
      { title: 'Magnetic field mapping',          subject: 'Physics',   days: 9 }
    ];
    return list.map(d => {
      const when = new Date(now); when.setDate(now.getDate() + d.days);
      return { ...d, when };
    });
  }

  function homeView() {
    const s = session();
    const exps = experiments();
    const mySubs = mySubmissions(s.id);
    const gradedSubs = mySubs.filter(x => x.status === 'graded');
    const avg = gradedSubs.length
      ? gradedSubs.reduce((a, b) => a + (b.score || 0), 0) / gradedSubs.length
      : 0;

    /* Continue card — most recent draft or submission that isn't graded yet. */
    const draftMap = drafts();
    const openDrafts = Object.entries(draftMap)
      .filter(([k]) => k.startsWith(s.id + '::'))
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
    let continueCard;
    if (openDrafts.length) {
      const [k, d] = openDrafts[0];
      const eid = k.split('::')[1];
      const exp = experimentById(eid);
      if (exp) {
        const step = d.readings?.length ? `${d.readings.length} readings so far` : 'Just started';
        continueCard = {
          title: exp.title, note: step,
          href: `#/experiments/${exp.id}`,
          cta: 'Pick up where you left off',
          when: relativeDay(d.updatedAt || Date.now())
        };
      }
    }
    if (!continueCard) {
      const pending = mySubs.find(x => x.status === 'pending');
      if (pending) {
        const exp = experimentById(pending.experimentId);
        if (exp) continueCard = {
          title: exp.title, note: 'Submitted — waiting for your teacher',
          href: `#/experiments/${exp.id}`,
          cta: 'Read your submission',
          when: relativeDay(pending.submittedAt)
        };
      }
    }
    if (!continueCard) {
      const fresh = exps.find(e => statusFor(s.id, e.id) === 'new');
      if (fresh) continueCard = {
        title: fresh.title, note: fresh.aim.slice(0, 90) + (fresh.aim.length > 90 ? '…' : ''),
        href: `#/experiments/${fresh.id}`,
        cta: 'Start your first experiment',
        when: 'suggested'
      };
    }

    /* Suggested — up to 3 experiments not yet submitted. */
    const submittedIds = new Set(mySubs.map(x => x.experimentId));
    const suggested = exps
      .filter(e => !submittedIds.has(e.id))
      .slice(0, 3);

    /* Ring metrics */
    const totalPublished = exps.length;
    const done = mySubs.filter(x => x.status === 'pending' || x.status === 'graded').length;
    const pct = totalPublished ? Math.round((done / totalPublished) * 100) : 0;
    const streak = streakDays(s.id);
    const deadlineList = upcomingDeadlines();
    const [nearest] = [...deadlineList].sort((a, b) => a.days - b.days);

    /* Ring SVG — circumference 2πr with r=52 */
    const R = 52, C = 2 * Math.PI * R;
    const dash = C * (pct / 100);

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="greeting">
        <div>
          <h1>${escapeHtml(greeting())}, ${escapeHtml(s.name.split(' ')[0])}.</h1>
          <p>${streak > 0
            ? `You've been active ${streak} day${streak === 1 ? '' : 's'} in a row. Nice.`
            : 'A fresh start — try one short experiment today.'}</p>
        </div>
        <div class="chip chip--blue" title="Current streak">
          ${icons.svg('sparkle', { size: 14 })} ${streak}-day streak
        </div>
      </div>

      <div class="home-grid" data-stagger>

        <div class="home-continue panel fade-up" data-home="continue">
          <span class="card__eyebrow">Continue</span>
          ${continueCard ? `
            <h3>${escapeHtml(continueCard.title)}</h3>
            <p>${escapeHtml(continueCard.note)}</p>
            <div style="display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:16px">
              <a class="btn btn--primary" href="${continueCard.href}">
                <span>${escapeHtml(continueCard.cta)}</span>
                ${icons.svg('arrow-right', { size: 18 })}
              </a>
              <span style="color:var(--ink-3);font-size:13px">${escapeHtml(continueCard.when)}</span>
            </div>`
            : `
            <h3>All caught up</h3>
            <p>Nothing is waiting. Have a look at the suggested experiments below.</p>
            <div style="margin-top:auto;padding-top:16px">
              <a class="btn" href="#/experiments">
                <span>Browse experiments</span>
                ${icons.svg('arrow-right', { size: 18 })}
              </a>
            </div>`}
        </div>

        <div class="panel fade-up" data-home="ring">
          <span class="card__eyebrow">This course</span>
          <div class="ring-wrap">
            <div class="ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle class="track" cx="60" cy="60" r="${R}" fill="none" stroke-width="10"></circle>
                <circle class="arc" cx="60" cy="60" r="${R}" fill="none" stroke-width="10" stroke-linecap="round"
                  stroke-dasharray="${C}" stroke-dashoffset="${C - dash}"></circle>
              </svg>
              <div class="ring-label">
                <div>
                  <b>${pct}%</b>
                  <span>${done} of ${totalPublished} done</span>
                </div>
              </div>
            </div>
            <div style="min-width:0">
              <p style="font-size:15px;line-height:20px;color:var(--ink-2)">
                ${avg ? `Average score is <b class="tnum">${avg.toFixed(1)}</b> out of 10 across ${gradedSubs.length} graded report${gradedSubs.length === 1 ? '' : 's'}.`
                      : 'Once your reports are graded, your scores will show up here.'}
              </p>
            </div>
          </div>
        </div>

        <div class="panel fade-up" data-home="deadlines">
          <span class="card__eyebrow">Upcoming</span>
          <div class="deadline-list">
            ${deadlineList.map(d => {
              const tone = d.days <= 2 ? 'hot' : d.days <= 5 ? 'warn' : '';
              return `<div class="deadline">
                <span class="deadline__dot ${tone}" aria-hidden="true"></span>
                <span class="deadline__body">
                  <b>${escapeHtml(d.title)}</b>
                  <span>${escapeHtml(d.subject)}</span>
                </span>
                <span class="deadline__when">${d.when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              </div>`;
            }).join('')}
          </div>
          ${nearest && nearest.days <= 2 ? `<p style="margin-top:12px;color:var(--orange);font-size:13px">Nearest: <b>${escapeHtml(nearest.title)}</b> in ${nearest.days} day${nearest.days === 1 ? '' : 's'}.</p>` : ''}
        </div>

        <div class="panel fade-up" data-home="suggest">
          <span class="card__eyebrow">Worth trying</span>
          <div class="deadline-list">
            ${suggested.length
              ? suggested.map(e => `
                <a class="deadline" href="#/experiments/${e.id}" style="text-decoration:none;color:inherit">
                  <span class="deadline__dot" aria-hidden="true"></span>
                  <span class="deadline__body">
                    <b>${escapeHtml(e.title)}</b>
                    <span>${escapeHtml(e.subject)} · ${e.duration} min · ${escapeHtml(e.difficulty)}</span>
                  </span>
                  <span class="deadline__when">${icons.svg('chevron-right', { size: 16 })}</span>
                </a>`).join('')
              : `<div class="empty-note">You've tried every published experiment. Ask your teacher to add one.</div>`}
          </div>
        </div>
      </div>`;

    return root;
  }

  /* ============================================================
     8.  Experiments list
     ============================================================ */
  function experimentsView() {
    const s = session();
    const all = experiments();
    const state = {
      q: '',
      subject: 'All',
      difficulty: 'All',
      sort: 'easiest'
    };

    const subjects = ['All', ...Array.from(new Set(all.map(e => e.subject)))];
    const difficulties = ['All', 'Easy', 'Medium', 'Hard'];
    const diffDots = { Easy: 1, Medium: 2, Hard: 3 };

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="section-head">
        <h2>Experiments</h2>
        <span style="color:var(--ink-3);font-size:14px" id="exp-count">${all.length} published</span>
      </div>

      <div class="list-tools">
        <div class="search-wrap">
          ${icons.svg('search', { size: 18 })}
          <input class="input" id="exp-search" type="search" placeholder="Search by title or aim…" aria-label="Search experiments">
        </div>
        <div class="filters">
          ${subjects.map(sub => `<button class="tab" type="button" data-subject="${escapeHtml(sub)}"${sub === 'All' ? ' aria-selected="true"' : ''}>${escapeHtml(sub)}</button>`).join('')}
          <span class="spacer"></span>
          <select class="select" id="exp-diff" aria-label="Difficulty" style="max-width:170px">
            ${difficulties.map(d => `<option value="${d}">${d === 'All' ? 'All difficulties' : d}</option>`).join('')}
          </select>
          <select class="select" id="exp-sort" aria-label="Sort by" style="max-width:170px">
            <option value="easiest">Easiest first</option>
            <option value="shortest">Shortest first</option>
            <option value="recent">Recently added</option>
          </select>
        </div>
      </div>

      <div class="exp-grid" id="exp-grid" data-stagger></div>`;

    const grid = root.querySelector('#exp-grid');
    const count = root.querySelector('#exp-count');

    function filtered() {
      let list = all.slice();
      const q = state.q.trim().toLowerCase();
      if (q) list = list.filter(e =>
        e.title.toLowerCase().includes(q) || e.aim.toLowerCase().includes(q));
      if (state.subject !== 'All') list = list.filter(e => e.subject === state.subject);
      if (state.difficulty !== 'All') list = list.filter(e => e.difficulty === state.difficulty);
      if (state.sort === 'easiest')
        list.sort((a, b) => (diffDots[a.difficulty] || 9) - (diffDots[b.difficulty] || 9) || a.duration - b.duration);
      else if (state.sort === 'shortest') list.sort((a, b) => a.duration - b.duration);
      else if (state.sort === 'recent') list.sort((a, b) => (b.order || 0) - (a.order || 0));
      return list;
    }

    function card(e) {
      const status = statusFor(s.id, e.id);
      const dots = diffDots[e.difficulty] || 1;
      const el = document.createElement('a');
      el.className = 'exp-card panel fade-up';
      el.href = `#/experiments/${e.id}`;
      el.style.viewTransitionName = 'exp-hero-' + e.id;
      el.innerHTML = `
        <div class="exp-card__head">
          <div style="min-width:0">
            <div class="chip" style="margin-bottom:8px">${escapeHtml(e.subject)}</div>
            <div class="exp-card__title">${escapeHtml(e.title)}</div>
          </div>
        </div>
        <div class="exp-card__aim">${escapeHtml(e.aim)}</div>
        <div class="exp-card__meta">
          <span class="item">${icons.svg('clock', { size: 14 })} ${e.duration} min</span>
          <span class="item" title="Difficulty">
            <span class="dots" aria-label="Difficulty ${e.difficulty}">
              ${[1,2,3].map(i => `<span class="${i <= dots ? 'on' : ''}"></span>`).join('')}
            </span>
          </span>
          <span class="item" style="margin-left:auto">${statusChip(status)}</span>
        </div>`;
      return el;
    }

    function paint() {
      const list = filtered();
      count.textContent = `${list.length} of ${all.length} published`;
      grid.innerHTML = '';
      if (!list.length) {
        grid.innerHTML = `
          <div class="panel" style="grid-column:1/-1">
            <div class="empty-note">
              No experiment matches those filters.<br>
              <button class="btn btn--sm" style="margin-top:12px" type="button" data-clear>
                ${icons.svg('refresh', { size: 14 })}<span>Clear filters</span>
              </button>
            </div>
          </div>`;
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
      list.forEach((e, i) => {
        const c = card(e);
        c.style.setProperty('--i', i);
        grid.appendChild(c);
      });
      observeReveals(root);
    }

    root.querySelector('#exp-search').addEventListener('input', debounce((e) => {
      state.q = e.target.value; paint();
    }, 120));

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
     9.  Experiment page
     ============================================================ */
  const STEPS = [
    { id: 'aim',        label: 'Aim' },
    { id: 'theory',     label: 'Theory' },
    { id: 'sim',        label: 'Simulate' },
    { id: 'obs',        label: 'Observe' },
    { id: 'graph',      label: 'Graph' },
    { id: 'quiz',       label: 'Quiz' },
    { id: 'conclusion', label: 'Conclusion' }
  ];

  /* Per-experiment: which simulator, columns and how to derive a row. */
  const EXP_CONFIG = {
    e_pendulum: {
      simulator: 'pendulum',
      columns: [
        { key: 'L',  label: 'Length',   unit: 'm',  decimals: 2 },
        { key: 'T',  label: 'Period',   unit: 's',  decimals: 3 },
        { key: 'T2', label: 'T²',       unit: 's²', decimals: 3 }
      ],
      record: (sim) => ({ L: sim.L, T: sim.T, T2: Number((sim.T * sim.T).toFixed(4)) }),
      plot: { x: 'L', y: 'T2', xLabel: 'Length L (m)', yLabel: 'T² (s²)', throughOrigin: true }
    },
    e_ohm: {
      simulator: 'ohm',
      columns: [
        { key: 'V', label: 'Voltage',    unit: 'V',  decimals: 2 },
        { key: 'R', label: 'Resistance', unit: 'Ω',  decimals: 2 },
        { key: 'I', label: 'Current',    unit: 'A',  decimals: 3 }
      ],
      record: (sim) => ({ V: sim.V, R: sim.R, I: sim.I }),
      plot: { x: 'I', y: 'V', xLabel: 'Current I (A)', yLabel: 'Voltage V (V)', throughOrigin: true }
    },
    e_titration: {
      simulator: 'titration',
      columns: [
        { key: 'trial', label: 'Trial',           unit: '',   decimals: 0 },
        { key: 'V',     label: 'Volume of NaOH',  unit: 'mL', decimals: 1 },
        { key: 'M',     label: 'Molarity of HCl', unit: 'M',  decimals: 4 }
      ],
      record: (sim, rows) => ({
        trial: rows.length + 1,
        V: sim.V,
        M: sim.M == null ? null : sim.M
      }),
      plot: { x: 'trial', y: 'V', xLabel: 'Trial number', yLabel: 'Volume of NaOH (mL)', throughOrigin: false }
    }
  };

  function draftFor(userId, expId) {
    const all = drafts();
    return all[draftKey(userId, expId)] || null;
  }
  function saveDraft(userId, expId, patch) {
    store.update(s => {
      s.drafts = s.drafts || {};
      const k = draftKey(userId, expId);
      s.drafts[k] = Object.assign({ readings: [], answers: {}, conclusion: '', updatedAt: Date.now() }, s.drafts[k] || {}, patch, { updatedAt: Date.now() });
    });
  }
  function clearDraft(userId, expId) {
    store.update(s => {
      if (s.drafts) delete s.drafts[draftKey(userId, expId)];
    });
  }

  function experimentPage(id) {
    const s = session();
    const exp = experimentById(id);
    if (!exp) { router.replace('/experiments'); return null; }
    const cfg = EXP_CONFIG[id] || EXP_CONFIG.e_pendulum;
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
        <div style="text-align:right">
          <div class="card__eyebrow" style="margin-bottom:4px">Draft</div>
          <div id="draft-state" style="font-size:13px;color:var(--ink-3)">Saved just now</div>
        </div>
      </div>

      <nav class="stepper glass" aria-label="Experiment steps">
        ${STEPS.map((st, i) => `
          <a class="stepper__step" href="#sec-${st.id}" data-step="${st.id}">
            <span class="num">${i + 1}</span><span>${st.label}</span>
          </a>`).join('')}
      </nav>

      <section class="exp-section panel" id="sec-aim">
        <h2>Aim</h2>
        <p>${escapeHtml(exp.aim)}</p>
        <details>
          <summary>Apparatus &amp; materials</summary>
          <ul class="apparatus">
            ${(exp.apparatus || []).map(a => `<li>${escapeHtml(a)}</li>`).join('')}
          </ul>
        </details>
      </section>

      <section class="exp-section panel" id="sec-theory">
        <h2>Theory</h2>
        <p>${escapeHtml(exp.theory)}</p>
      </section>

      <section class="exp-section panel" id="sec-sim">
        <h2>Simulator</h2>
        <p style="color:var(--ink-3);font-size:15px">Move the sliders. The readout updates live. When a run looks good, record it below.</p>
        <div class="sim">
          <div class="sim__stage" id="sim-stage" role="img" aria-label="Simulator"></div>
          <div class="sim__controls" id="sim-controls"></div>
        </div>
      </section>

      <section class="exp-section panel" id="sec-obs">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <h2 style="margin-bottom:0">Observations</h2>
          <button class="btn btn--primary btn--sm" type="button" id="record-reading">
            ${icons.svg('plus', { size: 14 })}<span>Record reading</span>
          </button>
        </div>
        <div style="overflow:auto;margin-top:12px">
          <table class="obs-table" id="obs-table">
            <thead>
              <tr>
                ${cfg.columns.map(c => `<th>${escapeHtml(c.label)}${c.unit ? ` <span style="text-transform:none;letter-spacing:0">(${escapeHtml(c.unit)})</span>` : ''}</th>`).join('')}
                <th style="width:72px" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody id="obs-body"></tbody>
          </table>
        </div>
        <div id="obs-empty"></div>
      </section>

      <section class="exp-section panel" id="sec-graph">
        <h2>Graph</h2>
        <div class="plot-wrap">
          <svg class="plot" id="plot" viewBox="0 0 480 320" role="img" aria-label="Auto-plotted graph"></svg>
        </div>
        <div id="fit-line" style="font-size:13px;color:var(--ink-3);margin-top:6px"></div>
      </section>

      <section class="exp-section panel" id="sec-quiz">
        <h2>Quick check</h2>
        <div id="quiz-body"></div>
      </section>

      <section class="exp-section panel" id="sec-conclusion">
        <h2>Conclusion</h2>
        <p style="color:var(--ink-3);font-size:15px;margin-bottom:12px">Two or three sentences. What did you find, and does it match the theory?</p>
        <textarea class="textarea" id="conclusion" placeholder="e.g. T² vs L is a straight line through the origin, so T ∝ √L as predicted…"></textarea>
        <div class="submit-bar">
          <span class="submit-hint" id="submit-hint">Readings will be checked before you submit.</span>
          <button class="btn" type="button" id="save-now">${icons.svg('check', { size: 16 })}<span>Save draft</span></button>
          <button class="btn btn--primary" type="button" id="submit-report">
            ${icons.svg('upload', { size: 16 })}<span>Submit report</span>
          </button>
        </div>
      </section>
    `;

    const obsBody   = root.querySelector('#obs-body');
    const obsEmpty  = root.querySelector('#obs-empty');
    const plotEl    = root.querySelector('#plot');
    const fitLineEl = root.querySelector('#fit-line');
    const conclEl   = root.querySelector('#conclusion');
    const quizBody  = root.querySelector('#quiz-body');
    const hint      = root.querySelector('#submit-hint');

    conclEl.value = conclusion;

    /* -- Draft save ticker ------------------------------------- */
    let saveTimer = null;
    function markSaved() {
      const st = root.querySelector('#draft-state');
      if (!st) return;
      st.textContent = 'Saved just now';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { st.textContent = 'Draft saved'; }, 1600);
    }
    const autosave = debounce((patch) => {
      saveDraft(s.id, id, patch);
      markSaved();
    }, 400);

    /* -- Simulator --------------------------------------------- */
    const sim = VL.simulators.get(cfg.simulator);
    const stage = root.querySelector('#sim-stage');
    const controls = root.querySelector('#sim-controls');
    if (sim) sim.mount(stage, controls, () => { /* no-op; recording is manual */ });

    /* -- Observation table ------------------------------------- */
    function paintObs() {
      obsBody.innerHTML = '';
      if (!readingRows.length) {
        obsEmpty.innerHTML = `<div class="empty-note">No readings yet. Set the simulator, then press <b>Record reading</b>.</div>`;
      } else {
        obsEmpty.innerHTML = '';
      }
      readingRows.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.style.animationDelay = '0ms';
        tr.innerHTML =
          cfg.columns.map(c => {
            const v = row[c.key];
            const text = v == null ? '—' : Number(v).toFixed(c.decimals);
            return `<td class="tnum">${text}</td>`;
          }).join('') +
          `<td class="actions">
             <span class="row-actions">
               <button class="icon-btn" type="button" data-act="edit" data-i="${i}" aria-label="Edit reading ${i + 1}">${icons.svg('edit', { size: 15 })}</button>
               <button class="icon-btn" type="button" data-act="del" data-i="${i}" aria-label="Delete reading ${i + 1}">${icons.svg('trash', { size: 15 })}</button>
             </span>
           </td>`;
        obsBody.appendChild(tr);
      });
      root.querySelector('#fit-line').textContent = '';

      obsBody.querySelectorAll('[data-act]').forEach(b => {
        b.addEventListener('click', () => {
          const i = Number(b.dataset.i);
          if (b.dataset.act === 'del') {
            readingRows.splice(i, 1);
            saveDraft(s.id, id, { readings: readingRows });
            markSaved();
            paintObs();
            paintPlot();
            updateSubmitState();
          } else if (b.dataset.act === 'edit') {
            editReading(i);
          }
        });
      });
      paintPlot();
      updateSubmitState();
    }

    function editReading(i) {
      const row = readingRows[i];
      const dialog = document.createElement('div');
      dialog.className = 'modal glass glass--refract open';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.innerHTML =
        `<div class="modal__head">
           <div class="modal__title">Edit reading ${i + 1}</div>
           <button class="icon-btn" type="button" data-close aria-label="Close">${icons.svg('x', { size: 16 })}</button>
         </div>
         <div class="modal__body" style="display:flex;flex-direction:column;gap:16px">
           ${cfg.columns.map(c => `
             <div class="field">
               <label class="field__label" for="ed-${c.key}">${escapeHtml(c.label)}${c.unit ? ` (${escapeHtml(c.unit)})` : ''}</label>
               <input class="input" id="ed-${c.key}" type="number" step="any" value="${row[c.key] ?? ''}">
             </div>`).join('')}
         </div>
         <div class="modal__foot">
           <button class="btn" type="button" data-close>Cancel</button>
           <button class="btn btn--primary" type="button" data-save>Save</button>
         </div>`;
      const scrim = document.createElement('div');
      scrim.className = 'modal-scrim open';
      document.body.appendChild(scrim);
      document.body.appendChild(dialog);

      const close = () => { dialog.remove(); scrim.remove(); };
      scrim.addEventListener('click', close);
      dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
      dialog.querySelector('[data-save]').addEventListener('click', () => {
        cfg.columns.forEach(c => {
          const v = dialog.querySelector('#ed-' + c.key).value;
          row[c.key] = v === '' ? null : Number(v);
        });
        saveDraft(s.id, id, { readings: readingRows });
        markSaved();
        close();
        paintObs();
      });
      dialog.querySelector('.input')?.focus();
    }

    root.querySelector('#record-reading').addEventListener('click', () => {
      const simState = sim ? sim.state() : {};
      const row = cfg.record(simState, readingRows);
      if (!row || Object.values(row).every(v => v == null)) {
        toast.warn('Nothing to record yet — adjust the simulator first.');
        return;
      }
      readingRows.push(row);
      saveDraft(s.id, id, { readings: readingRows });
      markSaved();
      paintObs();
      toast.success(`Reading ${readingRows.length} added.`);
    });

    /* -- Plot ---------------------------------------------------- */
    function paintPlot() {
      const { x, y, xLabel, yLabel, throughOrigin } = cfg.plot;
      const pts = readingRows
        .map(r => ({ x: Number(r[x]), y: Number(r[y]) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

      plotEl.innerHTML = '';
      const W = 480, H = 320;
      const m = { t: 20, r: 20, b: 46, l: 60 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;

      const NS = 'http://www.w3.org/2000/svg';
      const el = (t, attrs) => { const n = document.createElementNS(NS, t); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

      // Axes
      plotEl.appendChild(el('line', { class: 'axis', x1: m.l, y1: m.t + ih, x2: m.l + iw, y2: m.t + ih }));
      plotEl.appendChild(el('line', { class: 'axis', x1: m.l, y1: m.t, x2: m.l, y2: m.t + ih }));

      // Axis labels
      const xl = el('text', { class: 'axis-label', x: m.l + iw / 2, y: H - 12, 'text-anchor': 'middle' });
      xl.textContent = xLabel; plotEl.appendChild(xl);
      const yl = el('text', { class: 'axis-label', x: 14, y: m.t + ih / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${m.t + ih / 2})` });
      yl.textContent = yLabel; plotEl.appendChild(yl);

      if (!pts.length) {
        const empty = el('text', { class: 'tick-label', x: W / 2, y: H / 2, 'text-anchor': 'middle' });
        empty.textContent = 'No readings yet — the graph will draw itself here.';
        plotEl.appendChild(empty);
        fitLineEl.textContent = '';
        return;
      }

      // Bounds with a bit of padding
      let xMin = Math.min(...pts.map(p => p.x));
      let xMax = Math.max(...pts.map(p => p.x));
      let yMin = Math.min(...pts.map(p => p.y));
      let yMax = Math.max(...pts.map(p => p.y));
      if (xMin === xMax) { xMin -= 1; xMax += 1; }
      if (yMin === yMax) { yMin -= 1; yMax += 1; }
      const xPad = (xMax - xMin) * 0.08;
      const yPad = (yMax - yMin) * 0.10;
      xMin = Math.max(0, xMin - xPad); xMax += xPad;
      yMin = Math.max(0, yMin - yPad); yMax += yPad;

      const X = (v) => m.l + ((v - xMin) / (xMax - xMin)) * iw;
      const Y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

      // Grid + ticks (5 on x, 4 on y)
      for (let i = 0; i <= 4; i++) {
        const v = xMin + (xMax - xMin) * (i / 4);
        const px = X(v);
        plotEl.appendChild(el('line', { class: 'grid', x1: px, y1: m.t, x2: px, y2: m.t + ih }));
        const t = el('text', { class: 'tick-label', x: px, y: m.t + ih + 16, 'text-anchor': 'middle' });
        t.textContent = niceNum(v); plotEl.appendChild(t);
      }
      for (let i = 0; i <= 3; i++) {
        const v = yMin + (yMax - yMin) * (i / 3);
        const py = Y(v);
        plotEl.appendChild(el('line', { class: 'grid', x1: m.l, y1: py, x2: m.l + iw, y2: py }));
        const t = el('text', { class: 'tick-label', x: m.l - 8, y: py + 4, 'text-anchor': 'end' });
        t.textContent = niceNum(v); plotEl.appendChild(t);
      }

      // Best-fit line
      let slope, intercept;
      if (throughOrigin) {
        // Least-squares through the origin.
        const num = pts.reduce((a, p) => a + p.x * p.y, 0);
        const den = pts.reduce((a, p) => a + p.x * p.x, 0);
        slope = den ? num / den : 0;
        intercept = 0;
      } else {
        // Ordinary least squares.
        const n = pts.length;
        const sx = pts.reduce((a, p) => a + p.x, 0);
        const sy = pts.reduce((a, p) => a + p.y, 0);
        const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
        const sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
        const d = n * sxx - sx * sx;
        slope = d ? (n * sxy - sx * sy) / d : 0;
        intercept = n ? (sy - slope * sx) / n : 0;
      }

      if (pts.length >= 2) {
        const x0 = xMin, x1 = xMax;
        const y0 = slope * x0 + intercept;
        const y1 = slope * x1 + intercept;
        plotEl.appendChild(el('line', {
          class: 'fit',
          x1: X(x0), y1: Y(y0), x2: X(x1), y2: Y(y1)
        }));
      }

      // Points
      pts.forEach(p => {
        plotEl.appendChild(el('circle', { class: 'point', cx: X(p.x), cy: Y(p.y), r: 5.5 }));
      });

      // Fit summary
      if (pts.length >= 2) {
        const physical = physicalSlopeNote(exp.id, slope);
        fitLineEl.innerHTML = `Best-fit line: <b class="tnum">slope ≈ ${slope.toFixed(3)}</b>` +
          (intercept && Math.abs(intercept) > 0.01 ? `, intercept ≈ ${intercept.toFixed(3)}` : '') +
          (physical ? ` — ${physical}` : '');
      } else {
        fitLineEl.textContent = 'Add one more reading to fit a line.';
      }
    }

    function niceNum(v) {
      if (Math.abs(v) >= 100) return v.toFixed(0);
      if (Math.abs(v) >= 10) return v.toFixed(1);
      if (Math.abs(v) >= 1) return v.toFixed(2);
      return v.toFixed(3);
    }

    function physicalSlopeNote(expId, slope) {
      if (expId === 'e_pendulum') {
        const g = 4 * Math.PI * Math.PI / slope;
        return `this gives g ≈ ${g.toFixed(2)} m/s²`;
      }
      if (expId === 'e_ohm') return `this gives R ≈ ${slope.toFixed(2)} Ω`;
      return '';
    }

    /* -- Quiz ---------------------------------------------------- */
    const quiz = Array.isArray(exp.quiz) ? exp.quiz : [];
    function paintQuiz() {
      quizBody.innerHTML = '';
      if (!quiz.length) {
        quizBody.innerHTML = '<div class="empty-note">No quiz questions for this experiment.</div>';
        updateSubmitState();
        return;
      }
      quiz.forEach((q, i) => {
        const chosen = answers[i];
        const locked = chosen != null;
        const wrap = document.createElement('div');
        wrap.className = 'quiz__q';
        wrap.innerHTML =
          `<div class="quiz__prompt">
             <span class="qnum">${i + 1}</span>
             <span>${escapeHtml(q.q)}</span>
           </div>
           <div class="quiz__opts">
             ${q.options.map((opt, oi) => {
               const isCorrect = oi === q.correct;
               const isChosen = chosen === oi;
               const cls = !locked ? '' : (isCorrect ? 'correct' : (isChosen ? 'wrong' : ''));
               return `<button class="quiz__opt ${cls}" type="button" data-q="${i}" data-o="${oi}" ${locked ? 'disabled' : ''}>
                 <span class="mark">${icons.svg('check', { size: 12, sw: 3 })}</span>
                 <span>${escapeHtml(opt)}</span>
               </button>`;
             }).join('')}
           </div>`;
        quizBody.appendChild(wrap);
      });
      quizBody.querySelectorAll('.quiz__opt:not([disabled])').forEach(b => {
        b.addEventListener('click', () => {
          const qi = Number(b.dataset.q);
          const oi = Number(b.dataset.o);
          if (answers[qi] != null) return;
          answers[qi] = oi;
          saveDraft(s.id, id, { answers });
          markSaved();
          paintQuiz();
          const right = oi === quiz[qi].correct;
          if (right) toast.success('Correct.');
          else toast.warn(`Not quite. The right answer is: ${quiz[qi].options[quiz[qi].correct]}`);
        });
      });
      updateSubmitState();
    }

    function quizScore() {
      let right = 0;
      quiz.forEach((q, i) => { if (answers[i] === q.correct) right++; });
      return { right, total: quiz.length };
    }

    /* -- Conclusion --------------------------------------------- */
    conclEl.addEventListener('input', () => {
      conclusion = conclEl.value;
      autosave({ conclusion });
      updateSubmitState();
    });

    root.querySelector('#save-now').addEventListener('click', () => {
      saveDraft(s.id, id, { readings: readingRows, answers, conclusion });
      markSaved();
      toast.success('Draft saved.');
    });

    /* -- Submit -------------------------------------------------- */
    function updateSubmitState() {
      const need = [];
      if (readingRows.length < 2) need.push('at least 2 readings');
      if (conclusion.trim().length < 20) need.push('a conclusion');
      const quizDone = Object.keys(answers).length === quiz.length && quiz.length > 0;
      if (!quizDone) need.push('all quiz questions');
      const btn = root.querySelector('#submit-report');
      const can = need.length === 0;
      btn.disabled = !can;
      btn.setAttribute('aria-disabled', String(!can));
      hint.textContent = can
        ? 'Ready to submit. Your teacher will see this report.'
        : `Still need: ${need.join(', ')}.`;
    }

    root.querySelector('#submit-report').addEventListener('click', () => {
      const { right, total } = quizScore();
      const submission = {
        id: 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        studentId: s.id,
        studentName: s.name,
        experimentId: exp.id,
        experimentTitle: exp.title,
        submittedAt: Date.now(),
        readings: readingRows.slice(),
        answers: Object.assign({}, answers),
        quizScore: right,
        quizTotal: total,
        conclusion: conclusion.trim(),
        status: 'pending',
        score: null,
        feedback: ''
      };
      store.update(st => {
        st.submissions = st.submissions || [];
        st.submissions.unshift(submission);
      });
      clearDraft(s.id, exp.id);
      markActiveToday(s.id);
      playSuccess();
      toast.success('Report submitted. Nice work.');
      setTimeout(() => { router.go('/progress'); }, 700);
    });

    /* -- Stepper highlight on scroll ----------------------------- */
    queueMicrotask(() => {
      paintObs();
      paintQuiz();
      updateSubmitState();

      const stepLinks = $$('.stepper__step', root);
      const sections = $$('.exp-section', root);
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          const id = en.target.id.replace(/^sec-/, '');
          stepLinks.forEach(a => {
            const on = a.dataset.step === id;
            if (on) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
          });
        });
      }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
      sections.forEach(sec => io.observe(sec));
    });

    return root;
  }

  /* ============================================================
     10.  Success overlay + confetti
     ============================================================ */
  function playSuccess() {
    if (VL.prefersReducedMotion()) return;

    // Checkmark badge
    const overlay = document.createElement('div');
    overlay.className = 'done-overlay';
    overlay.innerHTML = `<div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path class="check-draw" style="--len:40" d="m4.5 12.5 5 5 10-11"/></svg></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));

    // Confetti
    const cv = document.createElement('canvas');
    cv.id = 'confetti';
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    cv.style.width = '100%';
    cv.style.height = '100%';
    document.body.appendChild(cv);
    cv.classList.add('on');
    const ctx = cv.getContext('2d');
    const colours = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE'];
    const parts = [];
    const cx = cv.width / 2;
    const cy = cv.height / 2;
    for (let i = 0; i < 70; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const s = 6 + Math.random() * 6;
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(a) * (3 + Math.random() * 5),
        vy: Math.sin(a) * (3 + Math.random() * 5),
        g: 0.22,
        life: 1,
        size: 4 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        colour: colours[(Math.random() * colours.length) | 0]
      });
    }
    const start = performance.now();
    function frame(now) {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(p => {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - t / 1.1);
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (t < 1.15) requestAnimationFrame(frame);
      else {
        cv.remove();
        overlay.classList.remove('on');
        setTimeout(() => overlay.remove(), 260);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     11.  My progress
     ============================================================ */
  function progressView() {
    const s = session();
    const mySubs = mySubmissions(s.id);
    const graded = mySubs.filter(x => x.status === 'graded');
    const avg = graded.length ? graded.reduce((a, b) => a + (b.score || 0), 0) / graded.length : 0;
    const perfect = mySubs.some(x => x.quizTotal > 0 && x.quizScore === x.quizTotal);
    const streak = streakDays(s.id);

    const badges = [
      { key: 'first',  icon: 'flask',  name: 'First Experiment', hint: 'Submit one report.', unlocked: mySubs.length >= 1 },
      { key: 'streak', icon: 'sparkle', name: '3-Day Streak',    hint: 'Open the lab three days in a row.', unlocked: streak >= 3 },
      { key: 'perfect', icon: 'award', name: 'Perfect Quiz',     hint: 'Answer every question right.', unlocked: perfect },
      { key: 'five',   icon: 'star',   name: 'Five Reports',     hint: 'Submit five reports.', unlocked: mySubs.length >= 5 }
    ];

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="section-head no-print">
        <h2>My progress</h2>
        <button class="btn btn--sm" type="button" id="print-report">
          ${icons.svg('download', { size: 14 })}<span>Print report</span>
        </button>
      </div>

      <div class="print-title">
        Virtual Lab — Report for ${escapeHtml(s.name)}
        <small>Generated ${new Date().toLocaleString()}</small>
      </div>

      <div class="stat-row" data-stagger>
        <div class="stat fade-up">
          <div class="label">Reports submitted</div>
          <span class="value tnum" data-count="${mySubs.length}">0</span>
          <div class="sub">${mySubs.filter(x => x.status === 'pending').length} waiting on review</div>
        </div>
        <div class="stat fade-up">
          <div class="label">Average score</div>
          <span class="value tnum" data-count="${avg}" data-decimals="1">0</span>
          <div class="sub">${graded.length ? `across ${graded.length} graded report${graded.length === 1 ? '' : 's'}` : 'No graded reports yet'}</div>
        </div>
        <div class="stat fade-up">
          <div class="label">Current streak</div>
          <span class="value tnum" data-count="${streak}">0</span>
          <div class="sub">${streak ? 'day' + (streak === 1 ? '' : 's') + ' in a row' : 'start one today'}</div>
        </div>
      </div>

      <div class="section-head"><h2>Badges</h2></div>
      <div class="badge-grid" data-stagger>
        ${badges.map(b => `
          <div class="badge fade-up ${b.unlocked ? '' : 'locked'}">
            <span class="medal">${icons.svg(b.icon, { size: 22 })}</span>
            <b>${escapeHtml(b.name)}</b>
            <span>${escapeHtml(b.hint)}</span>
          </div>`).join('')}
      </div>

      <div class="section-head"><h2>Submissions</h2></div>
      <div class="panel" data-stagger>
        ${mySubs.length ? mySubs.map(x => {
          const sTone = x.status === 'graded' ? 'chip chip--green'
                     : x.status === 'changes' ? 'chip chip--red'
                     : 'chip chip--orange';
          const sLabel = x.status === 'graded' ? 'Graded'
                       : x.status === 'changes' ? 'Changes asked'
                       : 'Pending review';
          return `
            <div class="sub-row fade-up">
              <span class="status-dot status-dot--${x.status === 'graded' ? 'graded' : 'submitted'}" aria-hidden="true"></span>
              <div style="min-width:0">
                <div class="sub-title">${escapeHtml(x.experimentTitle)}</div>
                <div class="sub-meta">
                  ${relativeDay(x.submittedAt)}
                  · quiz ${x.quizScore}/${x.quizTotal}
                  · <span class="${sTone}">${sLabel}</span>
                </div>
                ${x.feedback ? `<div class="sub-meta" style="margin-top:6px;color:var(--ink-2)">
                  <b style="font-weight:600">Teacher:</b> ${escapeHtml(x.feedback)}</div>` : ''}
              </div>
              <div class="sub-score tnum">
                ${x.score == null ? '—' : x.score}<small>/10</small>
              </div>
            </div>`;
        }).join('') : `<div class="empty-note">No reports yet. Finish an experiment and press <b>Submit report</b>.</div>`}
      </div>
    `;

    root.querySelector('#print-report').addEventListener('click', () => window.print());

    return root;
  }

  /* ============================================================
     12.  404
     ============================================================ */
  function notFoundView() {
    const root = document.createElement('div');
    root.className = 'nf';
    root.innerHTML = `
      <div class="nf__inner">
        <div class="nf__code">404</div>
        <h1 style="font-size:24px;letter-spacing:-.018em;font-weight:600">That page isn't here</h1>
        <p style="color:var(--ink-3);font-size:15px;line-height:22px">
          The link may be old, or the experiment was removed. Head back home.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:4px">
          <a class="btn btn--primary" href="#/home">${icons.svg('home', { size: 16 })}<span>Home</span></a>
          <a class="btn" href="#/experiments">${icons.svg('flask', { size: 16 })}<span>Experiments</span></a>
        </div>
      </div>`;
    return root;
  }
  VL.notFound = () => { const v = $('#view'); if (v) setView(wrap(notFoundView())); else { renderShell(); } };

  /* ============================================================
     13.  Command palette — build the item list
     ============================================================ */
  function rebuildPalette() {
    const s = session();
    const items = [];
    if (!s) {
      items.push({ label: 'Sign in', icon: 'user', group: 'Page', run: () => router.go('/signin') });
      palette.setItems(items);
      return;
    }
    const nav = s.role === 'admin' ? NAV_ADMIN : NAV_STUDENT;
    nav.forEach(it => items.push({
      label: it.label, hint: it.href.replace('#', ''), icon: it.icon,
      group: 'Page', run: () => router.go(it.href.replace('#', ''))
    }));
    // All published experiments (student only)
    if (s.role === 'student') {
      experiments().forEach(e => items.push({
        label: e.title, hint: `${e.subject} · ${e.duration} min`,
        icon: 'flask', group: 'Experiment',
        run: () => router.go('/experiments/' + e.id)
      }));
    }
    items.push({
      label: theme.mode === 'dark' ? 'Switch to light' : 'Switch to dark',
      icon: theme.mode === 'dark' ? 'sun' : 'moon', group: 'Theme',
      run: () => theme.cycle()
    });
    items.push({ label: 'Sign out', icon: 'logout', group: 'Account', run: () => {
      signOut(); toast.info('Signed out.'); router.replace('/signin');
    }});
    // Extension point for admin.js
    (VL.paletteExtra || []).forEach(i => items.push(i));
    palette.setItems(items);
  }

  /* ============================================================
     14.  Routing + boot
     ============================================================ */
  function registerRoutes() {
    router
      .register('/',         () => router.replace(session() ? (session().role === 'admin' ? '/admin' : '/home') : '/signin'))
      .register('/signin',   () => {
        if (session()) { router.replace(session().role === 'admin' ? '/admin' : '/home'); return; }
        renderShell();
        setView(signinView());
      })
      .register('/home',        VL.guardStudent(() => { renderShell(); setView(wrap(homeView())); }))
      .register('/experiments', VL.guardStudent(() => { renderShell(); setView(wrap(experimentsView())); }))
      .register('/experiments/:id', VL.guardStudent(({ id }) => {
        renderShell();
        const page = experimentPage(id);
        if (page) setView(wrap(page));
      }))
      .register('/progress',    VL.guardStudent(() => { renderShell(); setView(wrap(progressView())); }));

    // Router notifications
    bus.on('route', () => {
      updateNavActive();
      rebuildPalette();
    });
    bus.on('auth', () => { renderShell(); updateNavActive(); rebuildPalette(); });
    bus.on('external-change', () => {
      // Another tab changed the data. Refresh the current view.
      router.handle();
    });
    bus.on('reset', () => {
      seedStudentExtras();
      toast.info('Demo data reset.');
      if (session()) router.replace(session().role === 'admin' ? '/admin' : '/home');
      else router.replace('/signin');
    });
  }

  /* ------------------------------------------------------------ */
  ready(() => {
    VL.mountBackground();
    VL.injectRefractFilter();
    theme.init();
    ensureSeed();
    seedStudentExtras();
    registerRoutes();
    renderShell();
    rebuildPalette();
    router.start();

    // Keep the nav lens aligned if the window resizes.
    window.addEventListener('resize', debounce(updateNavActive, 120));
  });

  /* Expose a couple of helpers admin.js will want. */
  VL.app = {
    session, signIn, signOut,
    experiments, experimentById, submissions,
    statusFor, statusChip, streakDays,
    setView, wrap, renderShell, updateNavActive,
    seedStudentExtras, rebuildPalette,
    NAV_STUDENT, NAV_ADMIN
  };
})();