// Control Center page behaviour: theme, live updates, safe form submits, the brief helpers (find profiles and logo,
// competitor rows, file drop), slide viewer, menus. No libraries.
(() => {
  const body = document.body;
  const live = body.dataset.live;
  const bar = document.getElementById('live-bar');
  let dirty = false;

  // ---------- theme ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-set]');
    if (!btn) return;
    const theme = btn.dataset.themeSet;
    document.cookie = `alm_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });

  // ---------- forms ----------
  document.addEventListener('input', (e) => {
    if (e.target.closest('form[data-track-dirty]')) dirty = true;
  });
  document.addEventListener('change', (e) => {
    if (e.target.closest('form[data-track-dirty]')) dirty = true;
  });
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.menu[open]').forEach((m) => {
      if (!m.contains(e.target)) m.removeAttribute('open');
    });
    const confirmBtn = e.target.closest('[data-confirm]');
    if (confirmBtn && !window.confirm(confirmBtn.dataset.confirm)) {
      e.preventDefault();
      return;
    }
    if (e.target.closest('[data-reload]')) reloadKeepingPlace();
    const fill = e.target.closest('[data-fill]');
    if (fill) {
      const target = document.getElementById(fill.dataset.fill);
      if (target) {
        target.value = fill.dataset.value;
        target.focus();
        dirty = true;
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('details.menu[open]');
    if (open) {
      open.removeAttribute('open');
      open.querySelector('summary').focus();
    }
  });
  // One submit per click: the pressed button shows it is working, and a second press does nothing.
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.dataset.submitting) {
      e.preventDefault();
      return;
    }
    form.dataset.submitting = '1';
    dirty = false;
    const btn = e.submitter;
    if (btn && btn.tagName === 'BUTTON') {
      if (btn.name) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = btn.name;
        hidden.value = btn.value;
        form.appendChild(hidden);
      }
      setTimeout(() => {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      }, 0);
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  // ---------- brief: competitor rows ----------
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-row-add]');
    if (add) {
      const rows = add.closest('.field').querySelector('[data-rows]');
      const row = rows.querySelector('[data-row]').cloneNode(true);
      row.querySelectorAll('input').forEach((i) => (i.value = ''));
      rows.appendChild(row);
      row.querySelector('input').focus();
    }
    const remove = e.target.closest('[data-row-remove]');
    if (remove) {
      const rows = remove.closest('[data-rows]');
      const row = remove.closest('[data-row]');
      if (rows.querySelectorAll('[data-row]').length > 1) row.remove();
      else row.querySelectorAll('input').forEach((i) => (i.value = ''));
      dirty = true;
    }
  });

  // ---------- brief: file drop ----------
  document.querySelectorAll('[data-drop]').forEach((zone) => {
    const input = zone.querySelector('input[type="file"]');
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => {
      e.preventDefault();
      zone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('is-over')));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (input && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        dirty = true;
      }
    });
  });

  // ---------- brief: find profiles and logo from the website ----------
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v === true ? '' : v);
    }
    children.forEach((c) => c && n.append(c));
    return n;
  };
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-presence]');
    if (!btn) return;
    const form = btn.closest('form');
    const website = form.querySelector('[data-website]').value.trim();
    const error = form.querySelector('[data-presence-error]');
    error.hidden = true;
    if (!website) {
      error.textContent = 'Type the website first, for example example.com';
      error.hidden = false;
      form.querySelector('[data-website]').focus();
      return;
    }
    const label = btn.querySelector('span');
    const before = label.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    label.textContent = 'Reading the website…';
    try {
      const res = await fetch(`/api/presence?website=${encodeURIComponent(website)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The website could not be read.');
      const list = form.querySelector('[data-found]');
      const have = new Set([...list.querySelectorAll('input[name="socials_pick"]')].map((i) => i.value.replace(/^https?:\/\/(www\.)?/, '').toLowerCase()));
      let added = 0;
      for (const s of data.socials) {
        if (have.has(s.url.replace(/^https?:\/\/(www\.)?/, '').toLowerCase())) continue;
        const li = el('li', {}, [
          el('input', { type: 'checkbox', name: 'socials_pick', value: s.url, checked: s.primary, 'aria-label': `Use ${s.url}` }),
          Object.assign(el('span', { class: 'mark', title: s.name }), { innerHTML: s.mark || '' }),
          el('a', { class: 'url', href: s.url, target: '_blank', rel: 'noopener', text: s.url.replace(/^https?:\/\/(www\.)?/, '') }),
          el('span', { class: 'tag tag-quiet', text: s.source }),
        ]);
        list.append(li);
        added++;
      }
      const logos = form.querySelector('[data-logo-choices]');
      logos.querySelectorAll('[data-found-logo]').forEach((n) => n.remove());
      data.logos.forEach((l, i) => {
        const pick = el('label', { class: 'logo-pick', 'data-found-logo': true }, [
          el('input', { type: 'radio', name: 'logo_choice', value: `url:${l.url}`, checked: i === 0 && !logos.querySelector('input[value="keep"]') }),
          el('span', { class: 'client-logo' }, [el('img', { src: l.url, alt: '', loading: 'lazy' })]),
          el('span', { class: 'small', text: `From the website: ${l.source}` }),
        ]);
        pick.querySelector('img').addEventListener('error', () => pick.remove());
        logos.append(pick);
      });
      if (data.svgLogo && data.svgLogo.png) {
        const pick = el('label', { class: 'logo-pick', 'data-found-logo': true }, [
          el('input', { type: 'radio', name: 'logo_choice', value: 'svg', checked: !data.logos.length && !logos.querySelector('input[value="keep"]') }),
          el('span', { class: 'client-logo' }, [el('img', { src: `data:image/png;base64,${data.svgLogo.png}`, alt: '' })]),
          el('span', { class: 'small', text: 'From the website header (drawn logo)' }),
          el('input', { type: 'hidden', name: 'logo_svg_png', value: data.svgLogo.png }),
        ]);
        logos.append(pick);
      }
      const market = form.querySelector('[data-market]');
      if (market && !market.value && data.market) market.value = data.market;
      const cover = form.querySelector('input[name="displayName"]');
      label.textContent = `Found ${data.socials.length} profile${data.socials.length === 1 ? '' : 's'}${data.logos.length ? ` and ${data.logos.length} logo option${data.logos.length === 1 ? '' : 's'}` : ''}`;
      if (cover && !cover.value && data.name && form.querySelector('input[name="name"]').value !== data.name) cover.placeholder = `Same as the client name (the site calls itself “${data.name}”)`;
      dirty = true;
      if (!added && !data.logos.length) label.textContent = 'Nothing new found on the website';
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      label.textContent = before;
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      setTimeout(() => (label.textContent = before), 6000);
    }
  });

  // ---------- filters (fact check, checks) ----------
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-filter-flagged]')) {
      document.querySelectorAll('tr[data-flagged="no"]').forEach((tr) => (tr.hidden = e.target.checked));
    }
    if (e.target.matches('[data-filter-rows]')) {
      const want = e.target.value;
      const scope = e.target.closest('[data-filter-scope]') || document;
      scope.querySelectorAll('tr[data-tone]').forEach((tr) => (tr.hidden = want !== 'all' && tr.dataset.tone !== want));
    }
  });

  // ---------- slide viewer ----------
  document.querySelectorAll('[data-viewer]').forEach((viewer) => {
    const main = viewer.querySelector('[data-viewer-main]');
    const thumbs = [...viewer.querySelectorAll('[data-viewer-thumb]')];
    const show = (i) => {
      const t = thumbs[(i + thumbs.length) % thumbs.length];
      main.src = t.dataset.viewerThumb;
      main.alt = `Slide ${t.dataset.index} of ${thumbs.length}`;
      thumbs.forEach((x) => x.removeAttribute('aria-current'));
      t.setAttribute('aria-current', 'true');
      t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return t;
    };
    thumbs.forEach((t, i) => t.addEventListener('click', () => show(i)));
    viewer.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const current = thumbs.findIndex((x) => x.getAttribute('aria-current') === 'true');
      show(current + (e.key === 'ArrowRight' ? 1 : -1)).focus();
      e.preventDefault();
    });
  });

  // ---------- chat: keep the latest message in view ----------
  document.querySelectorAll('[data-chat]').forEach((c) => (c.scrollTop = c.scrollHeight));

  // ---------- keep the scroll position across a refresh ----------
  const placeKey = `scroll:${location.pathname}`;
  function reloadKeepingPlace() {
    try {
      sessionStorage.setItem(placeKey, String(window.scrollY));
    } catch {}
    location.reload();
  }
  try {
    const y = sessionStorage.getItem(placeKey);
    if (y !== null && !location.hash) {
      sessionStorage.removeItem(placeKey);
      window.scrollTo(0, Number(y));
    }
  } catch {}

  // ---------- live updates ----------
  if (!live || !window.EventSource) return;
  const busyEditing = () => dirty || (document.activeElement && document.activeElement.matches('input, textarea, select'));
  const offerRefresh = () => {
    if (busyEditing()) bar.hidden = false;
    else reloadKeepingPlace();
  };

  if (live === '*') {
    let timer = null;
    const source = new EventSource('/events');
    source.addEventListener('state', () => {
      clearTimeout(timer);
      timer = setTimeout(offerRefresh, 1500);
    });
    return;
  }

  const slug = live;
  let signature = null;
  const activity = () => document.querySelector('[data-activity]');

  async function refreshState() {
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(slug)}/state`, { cache: 'no-store' });
      if (res.status === 404) {
        location.href = `/?kind=info&msg=${encodeURIComponent('That proposal was archived or deleted.')}`;
        return;
      }
      if (!res.ok) return;
      const s = await res.json();
      document.querySelectorAll('[data-stage-state]').forEach((li) => {
        const v = s.stages[li.dataset.stageState];
        if (!v) return;
        li.className = li.className.replace(/stage-(done|working|you|neutral|warn|bad)/, `stage-${v[1]}`);
        const label = li.querySelector('.stage-state');
        if (label) label.textContent = v[0];
      });
      document.querySelectorAll('[data-step-state]').forEach((el) => {
        const v = s.steps[el.dataset.stepState];
        if (!v) return;
        el.className = `status status-${v[1]}`;
        el.querySelector('.dot').className = `dot dot-${v[1]}`;
        el.querySelector('span:last-child').textContent = v[0];
      });
      const move = document.querySelector('[data-primary-move]');
      if (move) {
        const detail = move.querySelector('.move-detail');
        move.innerHTML = `${detail ? detail.outerHTML : ''}${s.move}`;
      }
      const indicator = document.querySelector('[data-live-indicator]');
      if (indicator) indicator.innerHTML = s.running ? '<span class="live-dot"><span class="status status-working"><span class="dot dot-working" aria-hidden="true"></span><span>Working</span></span></span>' : '';
      if (signature === null) signature = s.signature;
      else if (s.signature !== signature) {
        signature = s.signature;
        offerRefresh();
      }
    } catch {}
  }
  refreshState();

  let stateTimer = null;
  const source = new EventSource(`/events?slug=${encodeURIComponent(slug)}`);
  source.addEventListener('state', () => {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(refreshState, 600);
  });
  // New activity lines go on top (newest first), with a short highlight.
  source.addEventListener('log', (e) => {
    const line = JSON.parse(e.data);
    let list = activity();
    if (!list) {
      const empty = document.querySelector('[data-activity-empty]');
      if (!empty) return;
      list = document.createElement('ol');
      list.className = 'activity';
      list.dataset.activity = '';
      empty.replaceWith(list);
    }
    const li = document.createElement('li');
    li.className = 'is-new';
    const time = document.createElement('time');
    time.dateTime = line.at;
    time.textContent = line.time;
    const step = document.createElement('span');
    step.className = 'act-step';
    step.textContent = line.step;
    const text = document.createElement('span');
    text.className = 'act-text';
    text.dir = 'auto';
    text.textContent = line.text;
    li.append(time, step, text);
    list.prepend(li);
    while (list.children.length > 80) list.lastElementChild.remove();
    list.scrollTop = 0;
  });
})();
