/* Exact from bluorng CDN t/65: predictive-search.js */
/* PredictiveSearch extends SearchForm - autocomplete search with caching */

class PredictiveSearch extends SearchForm {
  constructor() {
    super();
    this.cachedResults = {};
    this.predictiveSearchResults = this.querySelector("[data-predictive-search]");
    this.allPredictiveSearchInstances = document.querySelectorAll("predictive-search");
    this.isOpen = false;
    this.abortController = new AbortController();
    this.searchTerm = "";
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.input.form.addEventListener("submit", this.onFormSubmit.bind(this));
    this.input.addEventListener("focus", this.onFocus.bind(this));
    this.addEventListener("focusout", this.onFocusOut.bind(this));
    this.addEventListener("keyup", this.onKeyup.bind(this));
    this.addEventListener("keydown", this.onKeydown.bind(this));
  }

  getQuery() { return this.input.value.trim(); }

  onChange() {
    super.onChange();
    const newSearchTerm = this.getQuery();
    if (!this.searchTerm || !newSearchTerm.startsWith(this.searchTerm)) {
      this.querySelector("#predictive-search-results-groups-wrapper")?.remove();
    }
    this.searchTerm = newSearchTerm;
    if (!this.searchTerm.length) { this.close(true); return; }
    this.getSearchResults(this.searchTerm);
  }

  onFormSubmit(event) {
    (!this.getQuery().length || this.querySelector('[aria-selected="true"] a')) && event.preventDefault();
  }

  onFocus() {
    const currentSearchTerm = this.getQuery();
    if (currentSearchTerm.length) {
      this.searchTerm !== currentSearchTerm
        ? this.onChange()
        : this.getAttribute("results") === "true"
          ? this.open()
          : this.getSearchResults(this.searchTerm);
    }
  }

  onFocusOut() {
    setTimeout(() => { this.contains(document.activeElement) || this.close(); });
  }

  onKeyup(event) {
    this.getQuery().length || this.close(true);
    event.preventDefault();
    switch (event.code) {
      case "ArrowUp": this.switchOption("up"); break;
      case "ArrowDown": this.switchOption("down"); break;
      case "Enter": this.selectOption(); break;
    }
  }

  onKeydown(event) {
    (event.code === "ArrowUp" || event.code === "ArrowDown") && event.preventDefault();
  }

  switchOption(direction) {
    if (!this.getAttribute("open")) return;
    const moveUp = direction === "up";
    const selectedElement = this.querySelector('[aria-selected="true"]');
    const allVisibleElements = Array.from(this.querySelectorAll("li, button.predictive-search__item")).filter(el => el.offsetParent !== null);
    let activeElementIndex = 0;
    if (moveUp && !selectedElement) return;
    let selectedElementIndex = -1;
    for (let i = 0; selectedElementIndex === -1 && i <= allVisibleElements.length; i++) {
      if (allVisibleElements[i] === selectedElement) selectedElementIndex = i;
    }
    if (!moveUp && selectedElement) {
      activeElementIndex = selectedElementIndex === allVisibleElements.length - 1 ? 0 : selectedElementIndex + 1;
    } else if (moveUp) {
      activeElementIndex = selectedElementIndex === 0 ? allVisibleElements.length - 1 : selectedElementIndex - 1;
    }
    if (activeElementIndex === selectedElementIndex) return;
    const activeElement = allVisibleElements[activeElementIndex];
    activeElement.setAttribute("aria-selected", true);
    selectedElement && selectedElement.setAttribute("aria-selected", false);
    this.input.setAttribute("aria-activedescendant", activeElement.id);
  }

  selectOption() {
    const selectedOption = this.querySelector('[aria-selected="true"] a, button[aria-selected="true"]');
    selectedOption && selectedOption.click();
  }

  getSearchResults(searchTerm) {
    const queryKey = searchTerm.replace(" ", "-").toLowerCase();
    this.setLiveRegionLoadingState();
    if (this.cachedResults[queryKey]) {
      this.renderSearchResults(this.cachedResults[queryKey]);
      return;
    }
    fetch(`${routes.predictive_search_url}?q=${encodeURIComponent(searchTerm)}&section_id=predictive-search`, { signal: this.abortController.signal })
      .then(response => {
        if (!response.ok) throw new Error(response.status);
        return response.text();
      })
      .then(text => {
        const resultsMarkup = new DOMParser().parseFromString(text, "text/html").querySelector("#shopify-section-predictive-search").innerHTML;
        this.allPredictiveSearchInstances.forEach(instance => { instance.cachedResults[queryKey] = resultsMarkup; });
        this.renderSearchResults(resultsMarkup);
      })
      .catch(error => { if (error?.code !== 20) { this.close(); throw error; } });
  }

  setLiveRegionLoadingState() {
    this.statusElement = this.statusElement || this.querySelector(".predictive-search-status");
    this.loadingText = this.loadingText || this.getAttribute("data-loading-text");
    this.setLiveRegionText(this.loadingText);
    this.setAttribute("loading", true);
  }

  setLiveRegionText(statusText) {
    this.statusElement.setAttribute("aria-hidden", "false");
    this.statusElement.textContent = statusText;
    setTimeout(() => { this.statusElement.setAttribute("aria-hidden", "true"); }, 1000);
  }

  renderSearchResults(resultsMarkup) {
    this.predictiveSearchResults.innerHTML = resultsMarkup;
    this.setAttribute("results", true);
    this.setLiveRegionResults();
    this.open();
  }

  setLiveRegionResults() {
    this.removeAttribute("loading");
    this.setLiveRegionText(this.querySelector("[data-predictive-search-live-region-count-value]").textContent);
  }

  getResultsMaxHeight() {
    return (this.resultsMaxHeight = window.innerHeight - document.querySelector(".section-header")?.getBoundingClientRect().bottom);
  }

  open() {
    this.predictiveSearchResults.style.maxHeight = this.resultsMaxHeight || `${this.getResultsMaxHeight()}px`;
    this.setAttribute("open", true);
    this.input.setAttribute("aria-expanded", true);
    this.isOpen = true;
  }

  close(clearSearchTerm = false) {
    this.closeResults(clearSearchTerm);
    this.isOpen = false;
  }

  closeResults(clearSearchTerm = false) {
    if (clearSearchTerm) { this.input.value = ""; this.removeAttribute("results"); }
    const selected = this.querySelector('[aria-selected="true"]');
    selected && selected.setAttribute("aria-selected", false);
    this.input.setAttribute("aria-activedescendant", "");
    this.removeAttribute("loading");
    this.removeAttribute("open");
    this.input.setAttribute("aria-expanded", false);
    this.resultsMaxHeight = false;
    this.predictiveSearchResults.removeAttribute("style");
  }
}

customElements.define("predictive-search", PredictiveSearch);
