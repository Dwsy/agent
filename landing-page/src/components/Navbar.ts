import { html, LitElement, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { i18n, type Locale } from '../i18n/i18n-manager';

const NAV_SECTIONS = [
  { key: 'features', id: 'features' },
  { key: 'gateway', id: 'gateway' },
  { key: 'workflow', id: 'workflow' },
  { key: 'extensions', id: 'extensions' },
  { key: 'comparison', id: 'comparison' },
] as const;

const GITHUB = 'https://github.com/Dwsy/agent';

@customElement('pi-navbar')
export class Navbar extends LitElement {
  static styles = css`
    :host { display: block; position: fixed; top: 0.75rem; left: 0.75rem; right: 0.75rem; z-index: 1000; }

    .nav {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.65rem 1.25rem;
      background: rgba(10,15,30,0.85);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(51,65,85,0.4);
      border-radius: 0.75rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      transition: background 0.3s, box-shadow 0.3s;
    }
    :host([scrolled]) .nav {
      background: rgba(10,15,30,0.96);
      box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    }

    .logo { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; }
    .logo-pi {
      width: 2rem; height: 2rem; border-radius: 0.5rem;
      background: linear-gradient(135deg, #2563EB, #8B5CF6);
      display: grid; place-items: center;
      font: 700 1.1rem/1 'Space Grotesk', sans-serif; color: #fff;
    }
    .logo-text { font: 700 1.15rem/1 'Space Grotesk', sans-serif; color: #F1F5F9; }

    .links { display: flex; align-items: center; gap: 1.25rem; }
    .link {
      color: #94A3B8; text-decoration: none; font: 500 0.84rem/1 'DM Sans', sans-serif;
      transition: color 0.2s; position: relative; padding: 0.25rem 0;
    }
    .link:hover { color: #60A5FA; }
    .link[active] { color: #60A5FA; }
    .link[active]::after {
      content: ''; position: absolute; bottom: -2px; left: 20%; right: 20%;
      height: 2px; background: #2563EB; border-radius: 1px;
    }

    .actions { display: flex; align-items: center; gap: 0.6rem; }

    .lang-btn, .gh-btn {
      padding: 0.35rem 0.65rem; background: rgba(30,41,59,0.6);
      color: #94A3B8; border: 1px solid rgba(51,65,85,0.5);
      border-radius: 0.375rem; cursor: pointer; transition: all 0.2s;
      font: 500 0.78rem/1 'DM Sans', sans-serif; display: grid; place-items: center;
    }
    .lang-btn:hover, .gh-btn:hover { color: #60A5FA; border-color: rgba(96,165,250,0.4); }
    .gh-btn { padding: 0.35rem; }
    .gh-btn svg { display: block; }

    .cta {
      padding: 0.45rem 1rem; background: linear-gradient(135deg, #2563EB, #3B82F6);
      color: #fff; border: none; border-radius: 0.375rem;
      font: 600 0.8rem/1 'DM Sans', sans-serif; text-decoration: none;
      cursor: pointer; transition: box-shadow 0.2s;
    }
    .cta:hover { box-shadow: 0 4px 16px rgba(37,99,235,0.45); }

    .burger { display: none; background: none; border: none; color: #94A3B8; cursor: pointer; padding: 0.2rem; }

    .mobile { display: none; position: absolute; top: calc(100% + 0.5rem); left: 0; right: 0;
      background: rgba(10,15,30,0.96); backdrop-filter: blur(18px);
      border: 1px solid rgba(51,65,85,0.4); border-radius: 0.75rem;
      padding: 0.75rem; flex-direction: column; gap: 0.25rem;
    }
    .mobile[open] { display: flex; }
    .m-link {
      color: #94A3B8; text-decoration: none; font: 500 0.88rem/1 'DM Sans', sans-serif;
      padding: 0.6rem 0.75rem; border-radius: 0.375rem; transition: background 0.15s, color 0.15s;
    }
    .m-link:hover, .m-link[active] { background: rgba(30,41,59,0.6); color: #60A5FA; }

    @media (max-width: 768px) {
      .links, .cta { display: none; }
      .burger { display: block; }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  @state() private menuOpen = false;
  @state() private activeId = '';
  private _unsub?: () => void;
  private _io?: IntersectionObserver;
  private _scrollHandler?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); });
    this._setupScrollSpy();
    this._scrollHandler = () => {
      this.toggleAttribute('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', this._scrollHandler, { passive: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._io?.disconnect();
    if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
  }

  private _setupScrollSpy() {
    const visible = new Map<string, number>();
    this._io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        let best = ''; let max = 0;
        visible.forEach((ratio, id) => { if (ratio > max) { max = ratio; best = id; } });
        if (best !== this.activeId) this.activeId = best;
      },
      { threshold: [0, 0.25, 0.5], rootMargin: '-80px 0px -40% 0px' }
    );
    requestAnimationFrame(() => {
      for (const s of NAV_SECTIONS) {
        const el = document.getElementById(s.id);
        if (el) this._io!.observe(el);
      }
    });
  }

  private t(key: string) { return i18n.t(key); }

  private _toggleLocale() {
    i18n.setLocale(this.locale === 'zh-CN' ? 'en-US' : 'zh-CN');
  }

  private _toggleMenu() { this.menuOpen = !this.menuOpen; }
  private _closeMenu() { this.menuOpen = false; }

  private _ghIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 00-3.8 23.38c.6.11.82-.26.82-.58v-2.16c-3.34.73-4.04-1.61-4.04-1.61a3.18 3.18 0 00-1.33-1.76c-1.09-.74.08-.73.08-.73a2.52 2.52 0 011.84 1.24 2.56 2.56 0 003.5 1 2.56 2.56 0 01.76-1.6c-2.67-.3-5.47-1.33-5.47-5.93a4.64 4.64 0 011.24-3.22 4.3 4.3 0 01.12-3.18s1-.32 3.3 1.23a11.38 11.38 0 016 0c2.28-1.55 3.28-1.23 3.28-1.23a4.3 4.3 0 01.12 3.18 4.64 4.64 0 011.23 3.22c0 4.61-2.81 5.63-5.48 5.92a2.86 2.86 0 01.82 2.22v3.29c0 .32.21.7.82.58A12 12 0 0012 .3"/></svg>`;

  private _burgerIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${this.menuOpen
      ? html`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`
      : html`<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`}
  </svg>`;

  render() {
    const links = NAV_SECTIONS.map(s => ({
      id: s.id, label: this.t(`navbar.links.${s.key}`),
    }));
    return html`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-pi">π</div>
          <span class="logo-text">Pi Agent</span>
        </a>
        <div class="links">
          ${links.map(l => html`<a href="#${l.id}" class="link" ?active=${this.activeId === l.id}>${l.label}</a>`)}
        </div>
        <div class="actions">
          <button class="lang-btn" @click=${this._toggleLocale} aria-label="Switch language">
            ${this.locale === 'zh-CN' ? 'EN' : '中文'}
          </button>
          <a href=${GITHUB} target="_blank" rel="noopener" class="gh-btn" aria-label="GitHub">${this._ghIcon}</a>
          <a href=${GITHUB} class="cta">${this.t('navbar.cta')}</a>
          <button class="burger" @click=${this._toggleMenu} aria-label="Menu">${this._burgerIcon}</button>
        </div>
      </nav>
      <div class="mobile" ?open=${this.menuOpen}>
        ${links.map(l => html`<a href="#${l.id}" class="m-link" ?active=${this.activeId === l.id} @click=${this._closeMenu}>${l.label}</a>`)}
        <a href=${GITHUB} class="m-link" @click=${this._closeMenu}>${this.t('navbar.cta')}</a>
      </div>
    `;
  }
}
