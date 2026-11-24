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

    if (this.dismissBtn) {
      this.dismissBtn.addEventListener('click', () => this.hide());
    }
  }

  show(title, message) {
    if (this.title) this.title.textContent = title;
    if (this.message) this.message.textContent = message;
    if (this.banner) this.banner.style.display = 'flex';
  }

  hide() {
    if (this.banner) this.banner.style.display = 'none';
  }
}
