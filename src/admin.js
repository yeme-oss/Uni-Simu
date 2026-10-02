// Admin panel: Gemini usage per client IP (server/usage.js). The admin token is kept for the
// browser session only; every value from the server is shown as text, never as HTML.
const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'uni-admin-token';
const REFRESH_MS = 30000;

const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } };
const writeToken = (v) => { try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

let token = readToken();
let timer = null;
let page = 1; // page of recent requests (1 = the 20 newest)

const int = (n) => Number(n || 0).toLocaleString();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' }) : '–');

function row(cells) {
  const tr = document.createElement('tr');
  for (const cell of cells) {
    const td = document.createElement('td');
    if (cell instanceof Node) td.append(cell);
    else {
      td.textContent = cell.text;
      if (cell.num) td.className = 'num';
    }
    tr.append(td);
  }
  return tr;
}

async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => null);
  if (res.status === 404) throw Object.assign(new Error('The admin panel is off: set ADMIN_TOKEN (16+ characters) and restart the server.'), { status: 404 });
  if (res.status === 401) throw Object.assign(new Error('Wrong admin token.'), { status: 401 });
  // An HTML page instead of JSON: the running server doesn't know this route yet (it needs a restart).
  if (res.ok && !body) throw new Error('The server is running an older version: restart it (npm run dev), then reload this page.');
  if (!res.ok || !body) throw new Error(body?.error || `request failed (${res.status})`);
  return body;
}

function forgetButton(ip) {
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'danger', textContent: 'Erase', title: `Erase everything logged for ${ip} (erasure request)` });
  let confirmTimer;
  button.addEventListener('click', async () => {
    if (!button.dataset.confirm) {
      button.dataset.confirm = '1';
      button.textContent = 'Sure?';
      confirmTimer = setTimeout(() => { delete button.dataset.confirm; button.textContent = 'Erase'; }, 3000);
      return;
    }
    clearTimeout(confirmTimer);
    try {
      await api(`/api/admin/usage/${encodeURIComponent(ip)}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      $('message').textContent = err.message;
    }
  });
  return button;
}

/** Ban / Unban button for `ip` (`banned`: its current state); `after` runs once it changed. */
function banButton(ip, banned, after = refresh) {
  const button = Object.assign(document.createElement('button'), {
    type: 'button', className: banned ? '' : 'ban', textContent: banned ? 'Unban' : 'Ban',
    title: banned ? `Let ${ip} use the app again` : `Block ${ip} from the app's API (can be undone)`,
  });
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api(`/api/admin/bans/${encodeURIComponent(ip)}`, { method: banned ? 'DELETE' : 'PUT' });
      await after();
    } catch (err) {
      $('message').textContent = err.message;
      button.disabled = false;
    }
  });
  return button;
}

/** The IP as a link that opens its detail (sum of its cost, per day, latest requests). */
function ipLink(ip, banned) {
  const wrap = document.createElement('span');
  const link = Object.assign(document.createElement('button'), { type: 'button', className: 'link', textContent: ip, title: `Details of ${ip}` });
  link.addEventListener('click', () => openIp(ip));
  wrap.append(link);
  if (banned) wrap.append(Object.assign(document.createElement('span'), { className: 'badge', textContent: 'Banned' }));
  return wrap;
}

const actions = (...buttons) => {
  const bar = Object.assign(document.createElement('div'), { className: 'bar' });
  bar.append(...buttons);
  return bar;
};

let openedIp = null;

async function openIp(ip) {
  openedIp = ip;
  const dialog = $('ip-dialog');
  $('ip-title').textContent = ip;
  if (!dialog.open) dialog.showModal();
  try {
    const r = await api(`/api/admin/usage/${encodeURIComponent(ip)}`);
    if (openedIp !== ip) return;
    $('ip-banned').hidden = !r.ban;
    $('ip-banned').title = r.ban ? `since ${when(r.ban.at)}` : '';
    $('ip-ban').replaceWith(Object.assign(banButton(ip, Boolean(r.ban), async () => { await openIp(ip); await refresh(); }), { id: 'ip-ban' }));
    $('ip-usd').textContent = usd(r.totals.usd);
    $('ip-requests').textContent = int(r.totals.requests);
    $('ip-in').textContent = int(r.totals.inputTokens);
    $('ip-out').textContent = int(r.totals.outputTokens);
    $('ip-seen').textContent = r.firstSeen
      ? `First request ${when(r.firstSeen)} · last ${when(r.lastSeen)} · totals over the last ${r.retentionDays} days (the whole log)`
      : `No request logged in the last ${r.retentionDays} days.`;
    $('ip-days').replaceChildren(...r.days.map((d) => row([
      { text: d.day }, { text: int(d.requests), num: true }, { text: int(d.inputTokens), num: true }, { text: int(d.outputTokens), num: true }, { text: usd(d.usd), num: true },
    ])));
    $('ip-recent').replaceChildren(...r.recent.map((e) => row([
      { text: when(e.at) }, { text: e.path }, { text: int(e.inputTokens), num: true }, { text: int(e.outputTokens), num: true }, { text: usd(e.usd), num: true },
    ])));
  } catch (err) {
    $('ip-seen').textContent = err.message;
  }
}

/** License keys (Gumroad memberships): usage today; many IPs on one key means it is being shared. */
function renderKeys(k) {
  const limits = [k.freePerDay ? `free visitors: ${k.freePerDay}/day per IP` : 'free visitors: unlimited', k.enabled ? `members: ${k.memberPerDay ?? 'unlimited'}/day per key` : ''].filter(Boolean).join(' · ');
  $('keys-note').textContent = k.enabled
    ? `${limits}. Keys are shown by a short id (never stored in full). Many IP addresses on one key usually means it is being shared.`
    : `Memberships are off (set GUMROAD_PRODUCT_ID). ${limits}.`;
  $('keys').replaceChildren(...(k.keys.length ? k.keys.map((x) => {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: x.blocked ? '' : 'ban', textContent: x.blocked ? 'Unblock' : 'Block' });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/api/admin/keys/${x.id}/block`, { method: x.blocked ? 'DELETE' : 'PUT' });
        await refresh();
      } catch (err) {
        $('message').textContent = err.message;
        button.disabled = false;
      }
    });
    const label = document.createElement('span');
    label.append(Object.assign(document.createElement('code'), { textContent: x.id }), ...(x.blocked ? [Object.assign(document.createElement('span'), { className: 'badge', textContent: 'Blocked' })] : []));
    return row([label, { text: int(x.used), num: true }, { text: int(x.ips), num: true }, button]);
  }) : [row([{ text: 'No key used today.' }])]));
}

async function refresh() {
  try {
    const [r, { bans }, keys] = await Promise.all([
      api(`/api/admin/usage?days=${$('days').value}&page=${page}&perPage=20`),
      api('/api/admin/bans'),
      api('/api/admin/keys'),
    ]);
    renderKeys(keys);
    const banned = new Set(bans.map((b) => b.ip));
    page = r.recentPage.page; // the server keeps it in range
    $('message').textContent = '';
    $('login').hidden = true;
    $('panel').hidden = false;
    $('report').hidden = false;
    $('t-ips').textContent = int(r.totals.ips);
    $('t-requests').textContent = int(r.totals.requests);
    $('t-in').textContent = int(r.totals.inputTokens);
    $('t-out').textContent = int(r.totals.outputTokens);
    $('t-usd').textContent = usd(r.totals.usd);
    $('ips').replaceChildren(...(r.ips.length ? r.ips.map((x) => row([
      ipLink(x.ip, x.banned), { text: int(x.requests), num: true }, { text: int(x.inputTokens), num: true }, { text: int(x.outputTokens), num: true },
      { text: usd(x.usd), num: true }, { text: when(x.lastSeen) }, { text: x.lastPath ?? '–' }, actions(banButton(x.ip, x.banned), forgetButton(x.ip)),
    ])) : [row([{ text: 'No usage in this period.' }])]));
    $('recent').replaceChildren(...r.recent.map((e) => row([
      { text: when(e.at) }, ipLink(e.ip, banned.has(e.ip)), { text: e.path }, { text: int(e.inputTokens), num: true }, { text: int(e.outputTokens), num: true }, { text: usd(e.usd), num: true },
    ])));
    $('bans').replaceChildren(...(bans.length
      ? bans.map((b) => row([ipLink(b.ip, false), { text: when(b.at) }, banButton(b.ip, true)]))
      : [row([{ text: 'No banned IP.' }])]));
    const { pages, total, perPage } = r.recentPage;
    $('page').textContent = total ? `${(page - 1) * perPage + 1}–${Math.min(total, page * perPage)} of ${int(total)} · page ${page} / ${pages}` : 'No requests';
    $('prev').disabled = page <= 1;
    $('next').disabled = page >= pages;
    $('retention').textContent = `Only IP, endpoint, tokens, cost and time are logged (no question text). Everything older than ${r.retentionDays} days is deleted automatically.`;
  } catch (err) {
    $('message').textContent = err.message;
    if (err.status === 401 || err.status === 404) logout(false);
  }
}

function schedule() {
  clearInterval(timer);
  timer = $('auto').checked ? setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS) : null;
}

function logout(clearMessage = true) {
  token = '';
  writeToken('');
  clearInterval(timer);
  $('login').hidden = false;
  $('panel').hidden = true;
  $('report').hidden = true;
  if (clearMessage) $('message').textContent = '';
}

$('login').addEventListener('submit', (e) => {
  e.preventDefault();
  token = $('token').value.trim();
  $('token').value = '';
  writeToken(token);
  refresh().then(schedule);
});
$('days').addEventListener('change', () => { page = 1; refresh(); });
$('prev').addEventListener('click', () => { page -= 1; refresh(); });
$('next').addEventListener('click', () => { page += 1; refresh(); });
$('refresh').addEventListener('click', refresh);
$('auto').addEventListener('change', schedule);
$('logout').addEventListener('click', () => logout());
$('ip-close').addEventListener('click', () => $('ip-dialog').close());
$('ip-dialog').addEventListener('click', (e) => { if (e.target === $('ip-dialog')) $('ip-dialog').close(); }); // backdrop
$('ip-dialog').addEventListener('close', () => { openedIp = null; });

if (token) refresh().then(schedule);
