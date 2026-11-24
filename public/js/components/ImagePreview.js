/**
 * ImagineAI — Reusable ImagePreview Component (HD Edition with Lightbox)
 * 
 * Manages the preview stage across 4 states, aspect ratio dynamic scaling,
 * metadata presentation, and fullscreen HD lightbox modal.
 */
export class ImagePreview {
  constructor({
    stateEmptyId,
    stateLoadingId,
    stateSuccessId,
    stateErrorId,
    imageElementId,
    imageRenderFrameId,
    loadingStatusId,
    coldStartIndicatorId,
    canvasErrorTitleId,
    canvasErrorDescId,
    lightboxModalId,
    lightboxImgId,
    lightboxCaptionId,
    onRetryClick
  }) {
    this.stateEmpty = document.getElementById(stateEmptyId);
    this.stateLoading = document.getElementById(stateLoadingId);
    this.stateSuccess = document.getElementById(stateSuccessId);
    this.stateError = document.getElementById(stateErrorId);
    this.imgElement = document.getElementById(imageElementId);
    this.imageRenderFrame = document.getElementById(imageRenderFrameId);
    this.loadingStatus = document.getElementById(loadingStatusId);
    this.coldStartIndicator = document.getElementById(coldStartIndicatorId);
    this.canvasErrorTitle = document.getElementById(canvasErrorTitleId);
    this.canvasErrorDesc = document.getElementById(canvasErrorDescId);

    // Lightbox Elements
    this.lightboxModal = document.getElementById(lightboxModalId);
    this.lightboxImg = document.getElementById(lightboxImgId);
    this.lightboxCaption = document.getElementById(lightboxCaptionId);

    this.onRetryClick = onRetryClick;
    this.currentObjectUrl = null;
    this.currentPrompt = '';
    this.activeState = 'empty';

    this._bindEvents();
    this.showEmptyState();
  }

  _bindEvents() {
    const retryBtn = document.getElementById('btn-canvas-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (this.onRetryClick) this.onRetryClick();
      });
    }

    // Lightbox trigger on image click
    if (this.imageRenderFrame) {
      this.imageRenderFrame.addEventListener('click', () => {
        if (this.currentObjectUrl && this.activeState === 'success') {
          this.openLightbox();
        }
      });
    }

    // Lightbox close handlers
    const closeBtn = document.getElementById('btn-lightbox-close');
    const backdrop = document.getElementById('lightbox-backdrop');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeLightbox());
    if (backdrop) backdrop.addEventListener('click', () => this.closeLightbox());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.lightboxModal && this.lightboxModal.style.display !== 'none') {
        this.closeLightbox();
      }
    });
  }

  _updateToolbarActions(visible) {
    const copyBtn = document.getElementById('btn-copy-prompt');
    const rerollBtn = document.getElementById('btn-reroll');
    const downloadBtn = document.getElementById('btn-download');

    const displayVal = visible ? 'inline-flex' : 'none';
    if (copyBtn) copyBtn.style.display = displayVal;
    if (rerollBtn) rerollBtn.style.display = displayVal;
    if (downloadBtn) downloadBtn.style.display = displayVal;
  }

  _hideAllStates() {
    if (this.stateEmpty) this.stateEmpty.style.display = 'none';
    if (this.stateLoading) this.stateLoading.style.display = 'none';
    if (this.stateSuccess) this.stateSuccess.style.display = 'none';
    if (this.stateError) this.stateError.style.display = 'none';
  }

  showEmptyState() {
    this._hideAllStates();
    this._updateToolbarActions(false);
    if (this.stateEmpty) this.stateEmpty.style.display = 'flex';
    this.activeState = 'empty';
  }

  showLoadingState(statusMessage = 'FLUX.1-schnell is rendering diffusion steps on GPU...', isColdStart = false) {
    this._hideAllStates();
    this._updateToolbarActions(false);
    if (this.loadingStatus) this.loadingStatus.textContent = statusMessage;
    if (this.coldStartIndicator) {
      this.coldStartIndicator.style.display = isColdStart ? 'inline-flex' : 'none';
    }
    if (this.stateLoading) this.stateLoading.style.display = 'flex';
    this.activeState = 'loading';
  }

  showSuccessState(objectUrl, promptText = '', meta = {}) {
    this._hideAllStates();
    this._updateToolbarActions(true);

    if (this.currentObjectUrl && this.currentObjectUrl.startsWith('blob:') && this.currentObjectUrl !== objectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
    }
    this.currentObjectUrl = objectUrl;
    this.currentPrompt = promptText;

    if (this.imgElement) {
      this.imgElement.src = objectUrl;
      this.imgElement.alt = `AI generated visual of: ${promptText}`;
    }

    // Apply aspect ratio classes to frame
    if (this.imageRenderFrame) {
      this.imageRenderFrame.classList.remove('ratio-16-9', 'ratio-9-16');
      if (meta.aspectRatio === '16:9') {
        this.imageRenderFrame.classList.add('ratio-16-9');
      } else if (meta.aspectRatio === '9:16') {
        this.imageRenderFrame.classList.add('ratio-9-16');
      }
    }

    // Update metadata tags
    const metaResTag = document.getElementById('meta-res-tag');
    const metaEngineTag = document.getElementById('meta-engine-tag');

    if (metaResTag) {
      const w = meta.width || (meta.aspectRatio === '9:16' ? 576 : 1024);
      const h = meta.height || (meta.aspectRatio === '16:9' ? 576 : 1024);
      metaResTag.textContent = `${w} × ${h} px`;
    }

    if (metaEngineTag && meta.model) {
      metaEngineTag.textContent = meta.model.includes('FLUX') ? 'FLUX.1 HD' : 'SD 3.5 Turbo';
    }

    if (this.stateSuccess) this.stateSuccess.style.display = 'flex';
    this.activeState = 'success';
  }

  showErrorState(title = 'Generation Unsuccessful', message = 'The AI inference provider reported an error. Please try again.') {
    this._hideAllStates();
    this._updateToolbarActions(false);
    if (this.canvasErrorTitle) this.canvasErrorTitle.textContent = title;
    if (this.canvasErrorDesc) this.canvasErrorDesc.textContent = message;
    if (this.stateError) this.stateError.style.display = 'flex';
    this.activeState = 'error';
  }

  openLightbox() {
    if (this.lightboxModal && this.currentObjectUrl) {
      this.lightboxImg.src = this.currentObjectUrl;
      if (this.lightboxCaption) {
        this.lightboxCaption.textContent = this.currentPrompt;
      }
      this.lightboxModal.style.display = 'flex';
      this.lightboxModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  closeLightbox() {
    if (this.lightboxModal) {
      this.lightboxModal.style.display = 'none';
      this.lightboxModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  getCurrentImageUrl() {
    return this.currentObjectUrl;
  }

  getCurrentPrompt() {
    return this.currentPrompt;
  }
}
