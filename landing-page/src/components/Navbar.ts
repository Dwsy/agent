import { html, LitElement, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { i18n, type Locale } from '../i18n/i18n-manager';

const NAV_SECTIONS = [
  { key: 'features', id: 'features' },
  { key: 'runtime', id: 'runtime' },
  { key: 'ecosystem', id: 'ecosystem' },
  { key: 'extensions', id: 'extensions' },
  { key: 'comparison', id: 'comparison' },
] as const;

const GITHUB = 'https://github.com/Dwsy/agent';

/**
 * Navbar - Liquid Glass Navigation
 * Floating pill design with diffusion shadow
 */
@customElement('pi-navbar')
export class Navbar extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 1rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      width: calc(100% - 2rem);
      max-width: 1200px;
    }

    .nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.625rem 1rem;
      background: rgba(24, 24, 27, 0.7);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 1rem;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.05),
        0 20px 40px -15px rgba(0, 0, 0, 0.3);
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    :host([scrolled]) .nav {
      background: rgba(24, 24, 27, 0.9);
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 25px 50px -12px rgba(0, 0, 0, 0.4);
    }

    /* Logo - Minimal */
    .logo {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      text-decoration: none;
    }

    .logo-mark {
      width: 1.875rem;
      height: 1.875rem;
      border-radius: 0.5rem;
      background: #10b981;
      display: grid;
      place-items: center;
      font-size: 1rem;
      font-weight: 700;
      color: #09090b;
    }

    .logo-text {
      font-size: 1.0625rem;
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.01em;
    }

    /* Navigation Links */
    .links {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .link {
      padding: 0.5rem 0.875rem;
      color: #a1a1aa;
      text-decoration: none;
      font-size: 0.8125rem;
      font-weight: 500;
      border-radius: 0.5rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .link:hover {
      color: #fafafa;
      background: rgba(255, 255, 255, 0.05);
    }

    .link[active] {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
    }

    /* Actions */
    .actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .lang-btn {
      padding: 0.375rem 0.625rem;
      background: transparent;
      color: #71717a;
      border: 1px solid #3f3f46;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .lang-btn:hover {
      color: #fafafa;
      border-color: #52525b;
    }

    .gh-btn {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      color: #a1a1aa;
      border-radius: 0.375rem;
      transition: all 0.2s;
    }

    .gh-btn:hover {
      color: #fafafa;
      background: rgba(255, 255, 255, 0.05);
    }

    .cta {
      padding: 0.5rem 1rem;
      background: #10b981;
      color: #09090b;
      font-size: 0.8125rem;
      font-weight: 600;
      border-radius: 0.5rem;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cta:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    .cta:active {
      transform: translateY(0) scale(0.98);
    }

    /* Mobile Menu */
    .burger {
      display: none;
      background: none;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      padding: 0.25rem;
    }

    .mobile {
      display: none;
      position: absolute;
      top: calc(100% + 0.75rem);
      left: 0;
      right: 0;
      background: rgba(24, 24, 27, 0.95);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 1rem;
      padding: 0.75rem;
      flex-direction: column;
      gap: 0.25rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }

    .mobile[open] {
      display: flex;
      animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .m-link {
      padding: 0.75rem 1rem;
      color: #a1a1aa;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.5rem;
      transition: all 0.15s;
    }

    .m-link:hover,
    .m-link[active] {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
    }

    /* Responsive */
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
    this._unsub = i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
    });
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
        visible.forEach((ratio, id) => {
          if (ratio > max) { max = ratio; best = id; }
        });
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

  private _ghIcon = html`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>`;

  private _burgerIcon = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    ${this.menuOpen
      ? html`<path d="M18 6L6 18M6 6l12 12"/>`
      : html`<path d="M4 8h16M4 12h16M4 16h16"/>`}
  </svg>`;

  render() {
    const links = NAV_SECTIONS.map(s => ({
      id: s.id,
      label: this.t(`navbar.links.${s.key}`),
    }));

    return html`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-mark">π</div>
          <span class="logo-text">Pi Agent</span>
        </a>

        <div class="links">
          ${links.map(l => html`
            <a href="#${l.id}" class="link" ?active=${this.activeId === l.id}>${l.label}</a>
          `)}
        </div>

        <div class="actions">
          <button class="lang-btn" @click=${this._toggleLocale}>
            ${this.locale === 'zh-CN' ? 'EN' : '中文'}
          </button>
          <a href=${GITHUB} target="_blank" class="gh-btn" aria-label="GitHub">
            ${this._ghIcon}
          </a>
          <a href=${GITHUB} class="cta" target="_blank">${this.t('navbar.cta')}</a>
          <button class="burger" @click=${this._toggleMenu}>${this._burgerIcon}</button>
        </div>
      </nav>

      <div class="mobile" ?open=${this.menuOpen}>
        ${links.map(l => html`
          <a href="#${l.id}" class="m-link" ?active=${this.activeId === l.id} @click=${this._closeMenu}>
            ${l.label}
          </a>
        `)}
        <a href=${GITHUB} class="m-link" @click=${this._closeMenu}>${this.t('navbar.cta')}</a>
      </div>
    `;
  }
}
