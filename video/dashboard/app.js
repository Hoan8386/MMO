const state = { news: [], jobs: [] };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error((await response.json()).error || `Request failed: ${response.status}`);
  return response.json();
}

function renderNews() {
  $('#news-count').textContent = state.news.length;
  $('#news-list').innerHTML = state.news.length ? state.news.map((item) => `<article class="list-item"><div><div class="item-title">${escapeHtml(item.title)}</div><div class="item-meta">${escapeHtml(item.status)} / ${new Date(item.created_at).toLocaleDateString()}</div></div><button class="generate" data-news-id="${item.id}">GENERATE</button></article>`).join('') : '<p class="item-meta">No news articles found.</p>';
  document.querySelectorAll('[data-news-id]').forEach((button) => button.addEventListener('click', () => generate(Number(button.dataset.newsId), button)));
}

function renderJobs() {
  const active = state.jobs.filter((job) => !['completed', 'failed'].includes(job.status));
  $('#active-count').textContent = active.length;
  $('#ready-count').textContent = state.jobs.filter((job) => job.status === 'ready_to_render').length;
  $('#jobs-list').innerHTML = state.jobs.length ? state.jobs.map((job) => `<article class="list-item"><div><div class="item-title">JOB #${job.id} / NEWS #${job.news_id}</div><div class="item-meta">${new Date(job.created_at).toLocaleTimeString()}${job.error_message ? ` / ${escapeHtml(job.error_message)}` : ''}</div></div><span class="status ${job.status}">${job.status.replaceAll('_', ' ')}</span></article>`).join('') : '<p class="item-meta">No jobs yet.</p>';
  const completed = state.jobs.find((job) => job.status === 'completed' && job.output_path);
  if (completed) { $('#video-player').src = `/renders/${completed.news_id}.mp4`; $('#preview-empty').hidden = true; }
}

async function refresh() {
  try { [state.news, state.jobs] = await Promise.all([request('/api/news'), request('/api/jobs')]); renderNews(); renderJobs(); $('#health-label').textContent = 'CONNECTED'; $('#last-sync').textContent = `SYNC ${new Date().toLocaleTimeString()}`; } catch (error) { $('#health-label').textContent = 'OFFLINE'; $('#last-sync').textContent = error.message; }
}

async function generate(newsId, button) {
  button.disabled = true;
  try { await request(`/api/news/${newsId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await refresh(); } catch (error) { alert(error.message); button.disabled = false; }
}

$('#refresh-button').addEventListener('click', refresh);
refresh();
setInterval(refresh, 5000);