/**
 * ImagineAI — Reusable GenerateButton Component
 * 
 * Manages primary action button states (Enabled, Disabled, Loading Spinner).
 */
export class GenerateButton {
  constructor({ buttonId, spinnerId, iconId, textId, onClick }) {
    this.button = document.getElementById(buttonId);
    this.spinner = document.getElementById(spinnerId);
    this.icon = document.getElementById(iconId);
    this.text = document.getElementById(textId);
    this.onClick = onClick;

    if (!this.button) {
      throw new Error('GenerateButton: Button element missing.');
    }

    this._bindEvents();
  }

  _bindEvents() {
    this.button.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.button.disabled && this.onClick) {
        this.onClick();
      }
    });
  }

  setDisabled(disabled) {
    this.button.disabled = disabled;
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.button.disabled = true;
      if (this.spinner) this.spinner.style.display = 'inline-block';
      if (this.icon) this.icon.style.display = 'none';
      if (this.text) this.text.textContent = 'Generating Visual...';
      this.button.style.cursor = 'wait';
    } else {
      if (this.spinner) this.spinner.style.display = 'none';
      if (this.icon) this.icon.style.display = 'inline-block';
      if (this.text) this.text.textContent = 'Generate Image';
      this.button.style.cursor = 'pointer';
    }
  }
}
