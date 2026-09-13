// Polls the running job for a client and refreshes the page when it finishes.
function watchJob(slug) {
  const logEl = document.getElementById('joblog');
  let wasRunning = false;
  async function tick() {
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(slug)}/job`);
      const job = await res.json();
      if (logEl) logEl.textContent = (job.log || []).join('\n') || 'No job has run in this session.';
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
      const badge = document.getElementById('jobstate');
      if (badge) badge.textContent = job.running ? `Running: ${job.label}` : job.label ? `Last job: ${job.label} — ${job.result || ''}` : '';
      document.querySelectorAll('[data-disable-while-running]').forEach((b) => (b.disabled = job.running));
      if (wasRunning && !job.running) location.reload();
      wasRunning = job.running;
    } catch (e) {
      // server restarting
    }
    setTimeout(tick, wasRunning ? 1500 : 4000);
  }
  tick();
}

// Confirm buttons that approve gates.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-confirm]');
  if (b && !confirm(b.dataset.confirm)) e.preventDefault();
});
