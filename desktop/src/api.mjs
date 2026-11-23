// Frontend API client — calls the Python backend (via Node proxy).
// Replaces the old client-side agent loop + IndexedDB (tools.mjs/planner-store/etc).

async function post(url, body) {
  const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const data = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(data.detail || data.error || 'request failed');
  return data;
}
async function get(url) {
  const r = await fetch(url);
  const data = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(data.detail || data.error || 'request failed');
  return data;
}

// Agent chat — server runs the tool-calling loop, returns {reply, actions}.
export async function chat(sessionKey, message) {
  return post('/api/chat', {session_key: sessionKey, message});
}

// Tasks
export async function listTasks(date) {
  const data = await get('/api/tasks' + (date ? '?date=' + encodeURIComponent(date) : ''));
  return data.tasks || [];
}
export async function toggleTask(id, date) {
  return post('/api/tasks/toggle', {id, date});
}
export async function deleteTask(id) {
  return post('/api/tasks/delete', {id});
}
export async function applyOrder(date, orderedIds) {
  return post('/api/tasks/apply_order', {date, orderedIds});
}
export async function autoSort(date, tasks) {
  return post('/api/tasks/auto_sort', {date, tasks});
}

// Knowledge
export async function listSnippets() {
  const data = await get('/api/knowledge/list');
  return data.snippets || [];
}
export async function getSnippet(id) {
  return get('/api/knowledge/' + id);
}
export async function deleteSnippet(id) {
  return post('/api/knowledge/delete', {id});
}
export async function renameSnippet(id, title) {
  return post('/api/knowledge/rename', {id, title});
}
export async function updateCategory(id, category) {
  return post('/api/knowledge/category', {id, category});
}
export async function refreshSnippet(id) {
  return post('/api/knowledge/refresh', {id});
}
export async function searchKnowledge(query) {
  const data = await get('/api/knowledge/search?q=' + encodeURIComponent(query));
  return data.results || [];
}
export async function listSnippetsByDay(date) {
  const data = await get('/api/knowledge/by-day?date=' + encodeURIComponent(date));
  return data.snippets || [];
}

// Daily log (per-day conversation journal)
export async function listDailyLog(date) {
  const data = await get('/api/daily-log?date=' + encodeURIComponent(date));
  return data.entries || [];
}

// Occurrence check (for the month grid — mirrors the server's occurs_on).
export function occursOn(dateIso, t) {
  if (dateIso < t.startDate) return false;
  if (t.endDate && dateIso > t.endDate) return false;
  if (!t.recurrence) return dateIso === t.startDate;
  const dow = new Date(dateIso + 'T00:00:00').getDay(); // Sun=0..Sat=6
  const f = t.recurrence.freq;
  if (f === 'daily') return true;
  if (f === 'weekdays') return dow >= 1 && dow <= 5;
  if (f === 'weekly') return Array.isArray(t.recurrence.days) ? t.recurrence.days.includes(dow) : false;
  return false;
}
