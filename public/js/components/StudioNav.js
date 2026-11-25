/**
 * ImagineAI — StudioNav Component
 * Manages left navigation sidebar views:
 * home | create | explore | creations | favourites | settings
 */
export class StudioNav {
  constructor({ navSelector, viewSelector, defaultView = 'create', onViewChange }) {
    this.navButtons = Array.from(document.querySelectorAll(navSelector));
    this.views = Array.from(document.querySelectorAll(viewSelector));
    this.onViewChange = onViewChange;
    this.activeView = defaultView;

    this._bindEvents();
    this.setView(defaultView, false);
  }

  _bindEvents() {
    this.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        if (view) {
          this.setView(view, true);
        }
      });
    });
  }

  setView(viewName, notify = true) {
    this.activeView = viewName;

    this.navButtons.forEach((btn) => {
      const isMatch = btn.getAttribute('data-view') === viewName;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-current', isMatch ? 'page' : 'false');
    });

    this.views.forEach((section) => {
      const isMatch = section.getAttribute('data-view-panel') === viewName;
      section.style.display = isMatch ? 'flex' : 'none';
      section.classList.toggle('active', isMatch);
    });

    if (notify && typeof this.onViewChange === 'function') {
      this.onViewChange(viewName);
    }
  }

  getActiveView() {
    return this.activeView;
  }
}
