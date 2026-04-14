/* Exact from bluorng CDN t/65: media-gallery.js */

customElements.get("media-gallery") || customElements.define("media-gallery", class extends HTMLElement {
  constructor() {
    super();
    this.elements = {
      liveRegion: this.querySelector('[id^="GalleryStatus"]'),
      viewer: this.querySelector('[id^="GalleryViewer"]'),
      thumbnails: this.querySelector('[id^="GalleryThumbnails"]')
    };
    this.mql = window.matchMedia("(min-width: 750px)");
    if (this.elements.thumbnails) {
      this.elements.viewer.addEventListener("slideChanged", debounce(this.onSlideChanged.bind(this), 500));
      this.elements.thumbnails.querySelectorAll("[data-target]").forEach(mediaToSwitch => {
        mediaToSwitch.querySelector("button").addEventListener("click", this.setActiveMedia.bind(this, mediaToSwitch.dataset.target, false));
      });
      this.dataset.desktopLayout.includes("thumbnail") && this.mql.matches && this.removeListSemantic();
    }
  }

  onSlideChanged(event) {
    const thumbnail = this.elements.thumbnails.querySelector(`[data-target="${event.detail.currentElement.dataset.mediaId}"]`);
    this.setActiveThumbnail(thumbnail);
  }

  setActiveMedia(mediaId, prepend) {
    const activeMedia = this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`) || this.elements.viewer.querySelector("[data-media-id]");
    if (!activeMedia) return;
    this.elements.viewer.querySelectorAll("[data-media-id]").forEach(el => el.classList.remove("is-active"));
    activeMedia.classList.add("is-active");
    if (prepend) {
      if (activeMedia.parentElement.firstChild !== activeMedia) activeMedia.parentElement.prepend(activeMedia);
      if (this.elements.thumbnails) {
        const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
        if (activeThumbnail.parentElement.firstChild !== activeThumbnail) activeThumbnail.parentElement.prepend(activeThumbnail);
      }
      this.elements.viewer.slider && this.elements.viewer.resetPages();
    }
    this.preventStickyHeader();
    window.setTimeout(() => {
      (!this.mql.matches || this.elements.thumbnails) && activeMedia.parentElement.scrollTo({ left: activeMedia.offsetLeft });
      const rect = activeMedia.getBoundingClientRect();
      if (rect.top > -0.5) return;
      window.scrollTo({ top: rect.top + window.scrollY, behavior: "smooth" });
    });
    this.playActiveMedia(activeMedia);
    if (!this.elements.thumbnails) return;
    const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
    this.setActiveThumbnail(activeThumbnail);
    this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
  }

  setActiveThumbnail(thumbnail) {
    if (!this.elements.thumbnails || !thumbnail) return;
    this.elements.thumbnails.querySelectorAll("button").forEach(el => el.removeAttribute("aria-current"));
    thumbnail.querySelector("button").setAttribute("aria-current", true);
    !this.elements.thumbnails.isSlideVisible(thumbnail, 10) && this.elements.thumbnails.slider.scrollTo({ left: thumbnail.offsetLeft });
  }

  announceLiveRegion(activeItem, position) {
    const image = activeItem.querySelector(".product__modal-opener--image img");
    if (image) {
      image.onload = () => {
        this.elements.liveRegion.setAttribute("aria-hidden", false);
        this.elements.liveRegion.innerHTML = window.accessibilityStrings.imageAvailable.replace("[index]", position);
        setTimeout(() => { this.elements.liveRegion.setAttribute("aria-hidden", true); }, 2000);
      };
      image.src = image.src;
    }
  }

  playActiveMedia(activeItem) {
    window.pauseAllMedia();
    const deferredMedia = activeItem.querySelector(".deferred-media");
    deferredMedia && deferredMedia.loadContent(false);
  }

  preventStickyHeader() {
    this.stickyHeader = this.stickyHeader || document.querySelector("sticky-header");
    this.stickyHeader && this.stickyHeader.dispatchEvent(new Event("preventHeaderReveal"));
  }

  removeListSemantic() {
    if (this.elements.viewer.slider) {
      this.elements.viewer.slider.setAttribute("role", "presentation");
      this.elements.viewer.sliderItems.forEach(slide => slide.setAttribute("role", "presentation"));
    }
  }
});
