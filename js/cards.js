/**
 * Vista de la cartera: construye y mantiene las tarjetas.
 *
 * - El preview de cada app es un iframe real, escalado con transform: scale()
 *   para que se vea completo dentro de la tarjeta.
 * - Solo se cargan los previews de las tarjetas visibles (primero de forma
 *   inmediata y después con IntersectionObserver al hacer scroll), así la
 *   cartera abre rápido aunque tengas muchas apps.
 */
import { PREVIEW_H, PREVIEW_W } from './config.js';
import { hostOf } from './storage.js';

export function createCardView({ container, template, onOpen, onEdit, onDelete }) {
  /** @type {Map<string, HTMLElement>} */
  const cards = new Map();
  /** @type {Map<string, object>} */
  const byId = new Map();
  let openMenu = null;

  const previewObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const app = byId.get(entry.target.dataset.id);
        if (app) loadPreview(entry.target, app);
        previewObserver.unobserve(entry.target);
      }
    },
    { rootMargin: '300px 0px' }
  );

  const scaleObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const iframe = entry.target.querySelector('.card__iframe');
      if (!iframe) continue;
      const scale = entry.target.clientWidth / PREVIEW_W;
      iframe.style.transform = `scale(${scale})`;
    }
  });

  function closeMenus() {
    if (!openMenu) return;
    openMenu.hidden = true;
    openMenu.closest('.card')?.classList.remove('menu-open');
    openMenu = null;
  }

  /** Asigna el src del iframe de preview y lo muestra al terminar de cargar. */
  function loadPreview(cardEl, app) {
    const iframe = cardEl.querySelector('.card__iframe');
    if (!iframe || iframe.dataset.src === app.url) return;
    iframe.dataset.src = app.url;
    iframe.classList.remove('is-ready');
    iframe.src = app.url;
    const reveal = () => iframe.classList.add('is-ready');
    iframe.addEventListener('load', reveal, { once: true });
    setTimeout(reveal, 4500); // por si el evento load nunca llega
  }

  /** Vuelca los datos de la app en el DOM de la tarjeta. */
  function paint(el, app, index) {
    el.dataset.id = app.id;
    el.dataset.previewUrl = app.url;
    el.style.setProperty('--accent', app.accent);
    el.style.animationDelay = `${Math.min(index * 45, 420)}ms`;
    el.setAttribute('aria-label', `${app.name}. Abrir app.`);

    el.querySelector('.card__name').textContent = app.name;
    el.querySelector('.card__emoji').textContent = app.emoji;
    el.querySelector('.card__fallback-emoji').textContent = app.emoji;
    el.querySelector('.card__domain').textContent = hostOf(app.url);

    const iframe = el.querySelector('.card__iframe');
    iframe.title = `Vista previa de ${app.name}`;
    if (iframe.dataset.src && iframe.dataset.src !== app.url) loadPreview(el, app);
  }

  function buildCard(app) {
    const el = template.content.firstElementChild.cloneNode(true);
    const menu = el.querySelector('.card__menu');

    // El iframe se renderiza a tamaño de escritorio y luego se escala
    // por CSS para que se vea completo dentro de la tarjeta.
    const iframe = el.querySelector('.card__iframe');
    iframe.style.width = `${PREVIEW_W}px`;
    iframe.style.height = `${PREVIEW_H}px`;

    el.addEventListener('click', (event) => {
      if (event.target.closest('.card__more') || event.target.closest('.card__menu')) return;
      onOpen(byId.get(el.dataset.id));
    });

    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== el) return;
      event.preventDefault();
      onOpen(byId.get(el.dataset.id));
    });

    el.querySelector('.card__more').addEventListener('click', (event) => {
      event.stopPropagation();
      const wasOpen = !menu.hidden;
      closeMenus();
      if (wasOpen) return;
      menu.hidden = false;
      el.classList.add('menu-open');
      openMenu = menu;
    });

    menu.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      event.stopPropagation();
      const app = byId.get(el.dataset.id);
      closeMenus();
      if (action === 'open') onOpen(app);
      if (action === 'edit') onEdit(app);
      if (action === 'delete') onDelete(app);
    });

    return el;
  }

  /**
   * Carga ya los previews que están dentro (o cerca) del viewport.
   * Evita esperar al primer callback del IntersectionObserver, que llega con
   * el siguiente ciclo de pintado: así las tarjetas visibles cargan antes.
   */
  function loadEagerlyVisible(apps) {
    const margin = 320;
    const limit = window.innerHeight + margin;
    for (const app of apps) {
      const el = cards.get(app.id);
      if (!el || el.hidden) continue;
      const iframe = el.querySelector('.card__iframe');
      if (iframe.dataset.src === app.url) continue; // ya cargado
      const rect = el.getBoundingClientRect();
      if (!rect.width) continue; // la tarjeta no está visible (rejilla oculta)
      if (rect.top < limit && rect.bottom > -margin) loadPreview(el, app);
    }
  }

  /** Reconcilia el DOM con la lista de apps (crea, actualiza, reordena, borra). */
  function render(apps) {
    const ids = new Set(apps.map((a) => a.id));

    for (const [id, el] of cards) {
      if (ids.has(id)) continue;
      byId.delete(id);
      previewObserver.unobserve(el);
      scaleObserver.unobserve(el.querySelector('.card__preview'));
      el.remove();
      cards.delete(id);
    }

    apps.forEach((app, index) => {
      byId.set(app.id, app);
      let el = cards.get(app.id);
      if (!el) {
        el = buildCard(app);
        cards.set(app.id, el);
        previewObserver.observe(el);
        scaleObserver.observe(el.querySelector('.card__preview'));
      }
      paint(el, app, index);
      container.appendChild(el);
    });

    loadEagerlyVisible(apps);
  }

  /** Oculta/muestra tarjetas según un filtro de búsqueda. Devuelve cuántas se ven. */
  function applyFilter(query) {
    const q = String(query || '').trim().toLowerCase();
    let visible = 0;
    for (const [id, el] of cards) {
      const app = byId.get(id);
      const match = !q || `${app.name} ${app.url}`.toLowerCase().includes(q);
      el.hidden = !match;
      if (match) visible += 1;
    }
    // Al quitar el filtro, carga sin esperar al observer las tarjetas que aparecen.
    loadEagerlyVisible([...byId.values()]);
    return visible;
  }

  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenus();
  });

  return { render, applyFilter, closeMenus };
}
