import { h } from './dom';

/**
 * The loading moment: index.html paints it inline (two tomatoes drop onto a plate and puff into
 * sauce) before any script runs; this takes it over, settles the title in letter by letter once the
 * display font is ready, and returns it so the app can fade it out (class "out").
 */
export function bootScreen(title: string, subtitle: string): HTMLElement {
  let el = document.getElementById('boot');
  if (!el) {
    el = h('div', { class: 'boot', attrs: { id: 'boot', role: 'status' } }, h('h1', { class: 'boot-title' }), h('p', { class: 'boot-sub' }));
    document.getElementById('app')!.append(el);
  }
  const titleEl = el.querySelector('.boot-title') as HTMLElement;
  const sub = el.querySelector('.boot-sub') as HTMLElement;
  sub.textContent = subtitle;
  el.setAttribute('aria-label', `${title}. ${subtitle}`);
  const fill = () => {
    if (titleEl.childElementCount) return;
    titleEl.append(...[...title].map((c, i) => h('span', { text: c === ' ' ? ' ' : c, style: `--i:${i}` })));
  };
  // letters settle in the serif, not in a fallback that swaps mid-animation
  const ready = document.fonts?.load('900 36px "Vollkorn Variable"') ?? Promise.resolve();
  void Promise.race([ready, new Promise((r) => setTimeout(r, 450))]).then(fill, fill);
  return el;
}
