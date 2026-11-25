/**
 * ImagineAI — Reusable AlertBanner Component
 * 
 * Manages top-level contextual notification banners (error messages, rate-limit warnings).
 */
export class AlertBanner {
  constructor({ bannerId, titleId, messageId, dismissButtonId }) {
    this.banner = document.getElementById(bannerId);
    this.title = document.getElementById(titleId);
    this.message = document.getElementById(messageId);
    this.dismissBtn = document.getElementById(dismissButtonId);
    this.autoHideTimer = null;

    if (this.dismissBtn) {
      this.dismissBtn.addEventListener('click', () => this.hide());
    }
  }

  show(title, message, type = 'error') {
    clearTimeout(this.autoHideTimer);
    if (this.title) this.title.textContent = title;
    if (this.message) this.message.textContent = message;
    if (this.banner) {
      this.banner.classList.remove('alert-error', 'alert-success', 'alert-info', 'alert-warning');
      this.banner.classList.add(`alert-${type}`);
      this.banner.style.display = 'flex';
    }
    if (type === 'success' || type === 'info') {
      this.autoHideTimer = setTimeout(() => this.hide(), 4500);
    }
  }

  hide() {
    clearTimeout(this.autoHideTimer);
    if (this.banner) this.banner.style.display = 'none';
  }
}
