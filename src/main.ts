// Nunito draws the labels painted into the 3D scene; the DOM UI is Vollkorn (names, numbers) and Jost (text).
import '@fontsource-variable/nunito';
import '@fontsource-variable/vollkorn';
import '@fontsource-variable/jost';
import './ui/base.css';
import './ui/surfaces.css';
import './ui/ui.css';
import './ui/game.css';
import { App } from './app/App';

// Illustrations live in public/art; the base path differs between dev and the published build.
document.documentElement.style.setProperty('--title-art', `url("${import.meta.env.BASE_URL}art/title.webp")`);

new App().init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 0 0 0;padding:12px;background:#fff;color:#c00;white-space:pre-wrap">${String(err?.stack ?? err)}</pre>`);
});
