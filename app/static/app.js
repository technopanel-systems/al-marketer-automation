// Control Center page behaviour: live updates, safe form submits, slide viewer, small helpers. No libraries.
(() => {
  const body = document.body;
  const live = body.dataset.live;
  const bar = document.getElementById('live-bar');
  let dirty = false;

  // ---------- forms ----------
  document.addEventListener('input', (e) => {
    if (e.target.closest('form[data-track-dirty]')) dirty = true;
  });
  document.addEventListener('click', (e) => {
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

  // ---------- fact check filter ----------
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-filter-flagged]')) {
      document.querySelectorAll('tr[data-flagged="no"]').forEach((tr) => (tr.hidden = e.target.checked));
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
      if (!res.ok) return;
      const s = await res.json();
      document.querySelectorAll('[data-stage-state]').forEach((li) => {
        const v = s.stages[li.dataset.stageState];
        if (!v) return;
        li.className = li.className.replace(/stage-(done|working|you|neutral)/, `stage-${v[1]}`);
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
    list.append(li);
    while (list.children.length > 60) list.firstElementChild.remove();
    list.scrollTop = list.scrollHeight;
  });
})();
