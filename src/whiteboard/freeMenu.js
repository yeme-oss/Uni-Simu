// The green "Feeling lost?" card (top left): a dropdown with the free lectures, plus a
// window listing all of them with their slides. `onStart(lectureId, slideIndex)` plays one;
// it returns false when it can't start now (something is being generated).
import { t, tn, getLang, onLangChange } from '../i18n.js';
import { freeLectures } from './freeLectures.js';

export function createFreeMenu({ onStart }) {
  const $ = (id) => document.getElementById(id);
  const card = $('free-card');
  const menu = $('free-menu');
  const modal = $('free-modal');
  const list = $('free-list');
  let note = null; // "wait" message inside the menu

  const el = (tag, className, text) => Object.assign(document.createElement(tag), { ...(className && { className }), ...(text !== undefined && { textContent: text }) });

  function start(id, index) {
    if (onStart(id, index) === false) {
      if (note) note.hidden = false;
      return;
    }
    closeMenu();
    if (modal.open) modal.close();
  }

  function renderMenu() {
    const items = freeLectures(getLang()).map((lecture) => {
      const item = el('button', 'free-item');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      const text = el('span', 'free-item-text');
      text.append(el('strong', '', lecture.field), el('span', '', lecture.title), el('span', 'free-item-meta', [tn('free.slides', lecture.slides.length), ratings[lecture.id]?.count ? `★ ${ratings[lecture.id].average.toLocaleString(getLang())}` : ''].filter(Boolean).join(' · ')));
      item.append(el('span', 'free-item-icon', lecture.icon), text);
      item.addEventListener('click', () => start(lecture.id, 0));
      return item;
    });
    const all = el('button', 'free-item free-item-all', t('free.all'));
    all.type = 'button';
    all.setAttribute('role', 'menuitem');
    all.addEventListener('click', () => { closeMenu(); openAll(); });
    note = el('p', 'free-note', t('free.busy'));
    note.hidden = true;
    menu.replaceChildren(...items, el('hr', 'free-sep'), all, note);
  }

  // --- Ratings: 1 to 5 stars per lecture, shared by everyone; this browser rates under a
  // random anonymous id (rating again replaces its previous stars).
  let ratings = {}; // lectureId -> { average, count, mine }
  function voterId() {
    try {
      let id = localStorage.getItem('free-voter');
      if (!id) localStorage.setItem('free-voter', (id = crypto.randomUUID()));
      return id;
    } catch {
      return (voterId.session ??= crypto.randomUUID()); // storage blocked: one id for this visit
    }
  }
  async function loadRatings() {
    try {
      const res = await fetch(`/api/free/ratings?voter=${encodeURIComponent(voterId())}`);
      if (res.ok) ratings = (await res.json()).ratings ?? {};
    } catch { /* ratings are optional */ }
  }
  const ratingText = (r) => (r?.count ? tn('free.reviews', r.count, { avg: r.average.toLocaleString(getLang()) }) : t('free.noReviews'));

  /** The row of 5 stars for `lecture`: shows this browser's rating; clicking a star rates. */
  function starRow(lecture) {
    const row = el('div', 'free-rating');
    const stars = el('div', 'free-stars');
    stars.setAttribute('role', 'radiogroup');
    stars.setAttribute('aria-label', t('free.rate'));
    const text = el('span', 'free-rating-text', ratingText(ratings[lecture.id]));
    const paint = (n) => [...stars.children].forEach((b, i) => b.classList.toggle('on', i < n));
    for (let n = 1; n <= 5; n++) {
      const b = el('button', 'free-star', '★');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(ratings[lecture.id]?.mine === n));
      b.setAttribute('aria-label', tn('free.stars', n));
      b.addEventListener('mouseenter', () => paint(n));
      b.addEventListener('focus', () => paint(n));
      b.addEventListener('click', async () => {
        try {
          const res = await fetch(`/api/free/ratings/${encodeURIComponent(lecture.id)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stars: n, voter: voterId() }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok || !body) throw new Error(body?.error || `rating failed (${res.status})`);
          ratings[lecture.id] = body;
          [...stars.children].forEach((s, i) => s.setAttribute('aria-checked', String(i + 1 === n)));
          text.textContent = `${ratingText(body)} · ${t('free.thanks')}`;
          paint(n);
        } catch (err) {
          text.textContent = t('free.rateFailed', { error: err.message });
        }
      });
      stars.append(b);
    }
    stars.addEventListener('mouseleave', () => paint(ratings[lecture.id]?.mine ?? 0));
    paint(ratings[lecture.id]?.mine ?? 0);
    row.append(stars, text);
    return row;
  }

  // Completed cursus (every topic studied and saved on the server) join the hand-made lectures.
  let completed = [];
  async function loadCompleted() {
    try {
      const res = await fetch('/api/free/lectures');
      if (res.ok) completed = (await res.json()).cursus ?? [];
    } catch { /* optional */ }
  }
  const asLecture = (c) => ({
    id: c.id, icon: '🎓', field: [c.domain || c.module, c.lang?.toUpperCase()].filter(Boolean).join(' · '),
    title: c.title, meta: tn('free.topics', c.topics, { minutes: c.totalMinutes }),
  });

  function renderAll() {
    // Only the field and the subject: the list is meant to grow long.
    list.replaceChildren(...[...freeLectures(getLang()), ...completed.map(asLecture)].map((lecture) => {
      const box = el('section', 'free-lecture');
      const head = el('div', 'free-lecture-head');
      const titles = el('div', 'free-lecture-titles');
      titles.append(el('span', 'free-lecture-field', `${lecture.icon} ${lecture.field}`), el('strong', '', lecture.title), ...(lecture.meta ? [el('span', 'wb-hint', lecture.meta)] : []));
      const play = el('button', 'primary', t('free.start'));
      play.type = 'button';
      play.addEventListener('click', () => start(lecture.id, 0));
      head.append(titles, starRow(lecture), play); // stars just left of Start
      box.append(head);
      return box;
    }));
  }

  function openMenu() {
    renderMenu();
    menu.hidden = false;
    card.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus({ preventScroll: true });
  }

  function closeMenu() {
    menu.hidden = true;
    card.setAttribute('aria-expanded', 'false');
  }

  function openAll() {
    renderAll();
    modal.showModal();
    Promise.all([loadRatings(), loadCompleted()]).then(() => { if (modal.open) renderAll(); }); // fresh averages and completed cursus
  }

  loadRatings(); // in the background, for the averages shown in the menu
  card.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  addEventListener('pointerdown', (e) => { if (!menu.hidden && !$('free').contains(e.target)) closeMenu(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); card.focus(); } });
  $('free-modal-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); }); // backdrop
  onLangChange(() => {
    if (!menu.hidden) renderMenu();
    if (modal.open) renderAll();
  });
}
