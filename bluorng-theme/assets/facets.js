/* Exact from bluorng CDN t/65: facets.js */
/* FacetFiltersForm, PriceRange, FacetRemove web components */
/* Full source scraped from cdn.shopify.com/s/files/1/0514/9494/4962/t/65/assets/facets.js */

class FacetFiltersForm extends HTMLElement {
  constructor() {
    super();
    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);
    this.debouncedOnSubmit = debounce(event => { this.onSubmitHandler(event); }, 800);
    this.querySelector("form").addEventListener("input", this.debouncedOnSubmit.bind(this));
    const facetWrapper = this.querySelector("#FacetsWrapperDesktop");
    facetWrapper && facetWrapper.addEventListener("keyup", onKeyUpEscape);
    this.autoSelectInStock();
  }

  autoSelectInStock() {
    if (!(new URLSearchParams(window.location.search).toString().length > 0)) {
      const inStockCheckboxes = document.querySelectorAll(
        'input[name*="availability"][value="1"], input[name*="filter.v.availability"][value="1"]'
      );
      inStockCheckboxes.forEach(checkbox => {
        if (!checkbox.checked && !checkbox.disabled) {
          checkbox.checked = true;
          const label = checkbox.closest(".facets__label, .mobile-facets__label");
          label && label.classList.add("active");
        }
      });
      if (inStockCheckboxes.length > 0) {
        const form = this.querySelector("form");
        if (form) {
          const searchParams = this.createSearchParams(form);
          this.onSubmitForm(searchParams, null, true);
        }
      }
    }
  }

  static setListeners() {
    const onHistoryChange = event => {
      const searchParams = event.state ? event.state.searchParams : FacetFiltersForm.searchParamsInitial;
      searchParams !== FacetFiltersForm.searchParamsPrev && FacetFiltersForm.renderPage(searchParams, null, false);
    };
    window.addEventListener("popstate", onHistoryChange);
  }

  static toggleActiveFacets(disable = true) {
    document.querySelectorAll(".js-facet-remove").forEach(element => {
      element.classList.toggle("disabled", disable);
    });
  }

  static renderPage(searchParams, event, updateURLHash = true, skipLoading = false) {
    FacetFiltersForm.searchParamsPrev = searchParams;
    const sections = FacetFiltersForm.getSections();
    const countContainer = document.getElementById("ProductCount");
    const countContainerDesktop = document.getElementById("ProductCountDesktop");
    if (!skipLoading) {
      document.querySelectorAll(".facets-container .loading__spinner, facet-filters-form .loading__spinner").forEach(s => s.classList.remove("hidden"));
      document.getElementById("ProductGridContainer").querySelector(".collection").classList.add("loading");
      countContainer && countContainer.classList.add("loading");
      countContainerDesktop && countContainerDesktop.classList.add("loading");
    }
    sections.forEach(section => {
      const url = `${window.location.pathname}?section_id=${section.section}&${searchParams}`;
      const filterDataUrl = element => element.url === url;
      FacetFiltersForm.filterData.some(filterDataUrl)
        ? FacetFiltersForm.renderSectionFromCache(filterDataUrl, event)
        : FacetFiltersForm.renderSectionFromFetch(url, event);
    });
    updateURLHash && FacetFiltersForm.updateURLHash(searchParams);
  }

  static renderSectionFromFetch(url, event) {
    fetch(url).then(r => r.text()).then(responseText => {
      FacetFiltersForm.filterData = [...FacetFiltersForm.filterData, { html: responseText, url }];
      FacetFiltersForm.renderFilters(responseText, event);
      FacetFiltersForm.renderProductGridContainer(responseText);
      FacetFiltersForm.renderProductCount(responseText);
    });
  }

  static renderSectionFromCache(filterDataUrl, event) {
    const html = FacetFiltersForm.filterData.find(filterDataUrl).html;
    FacetFiltersForm.renderFilters(html, event);
    FacetFiltersForm.renderProductGridContainer(html);
    FacetFiltersForm.renderProductCount(html);
  }

  static renderProductGridContainer(html) {
    document.getElementById("ProductGridContainer").innerHTML =
      new DOMParser().parseFromString(html, "text/html").getElementById("ProductGridContainer").innerHTML;
  }

  static renderProductCount(html) {
    const count = new DOMParser().parseFromString(html, "text/html").getElementById("ProductCount").innerHTML;
    const container = document.getElementById("ProductCount");
    const containerDesktop = document.getElementById("ProductCountDesktop");
    container.innerHTML = count;
    container.classList.remove("loading");
    containerDesktop && (containerDesktop.innerHTML = count, containerDesktop.classList.remove("loading"));
    document.querySelectorAll(".facets-container .loading__spinner, facet-filters-form .loading__spinner").forEach(s => s.classList.add("hidden"));
  }

  static renderFilters(html, event) {
    const parsedHTML = new DOMParser().parseFromString(html, "text/html");
    const facetDetailsFromFetch = parsedHTML.querySelectorAll("#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter");
    const facetDetailsFromDom = document.querySelectorAll("#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter");
    Array.from(facetDetailsFromDom).forEach(el => {
      Array.from(facetDetailsFromFetch).some(({ id }) => el.id === id) || el.remove();
    });
    const matchesId = element => {
      const jsFilter = event ? event.target.closest(".js-filter") : void 0;
      return jsFilter ? element.id === jsFilter.id : false;
    };
    const facetsToRender = Array.from(facetDetailsFromFetch).filter(el => !matchesId(el));
    facetsToRender.forEach((el, i) => {
      if (document.getElementById(el.id)) {
        document.getElementById(el.id).innerHTML = el.innerHTML;
      } else if (i > 0) {
        const prev = facetsToRender[i - 1];
        if (el.className === prev.className) {
          document.getElementById(prev.id).after(el);
        }
      }
    });
    FacetFiltersForm.renderActiveFacets(parsedHTML);
    FacetFiltersForm.toggleActiveFacets(false);
  }

  static renderActiveFacets(html) {
    [".active-facets-mobile", ".active-facets-desktop"].forEach(selector => {
      const el = html.querySelector(selector);
      el && (document.querySelector(selector).innerHTML = el.innerHTML);
    });
  }

  static updateURLHash(searchParams) {
    history.pushState({ searchParams }, "", `${window.location.pathname}${searchParams && "?".concat(searchParams)}`);
  }

  static getSections() {
    return [{ section: document.getElementById("product-grid").dataset.id }];
  }

  createSearchParams(form) {
    return new URLSearchParams(new FormData(form)).toString();
  }

  onSubmitForm(searchParams, event, skipLoading = false) {
    FacetFiltersForm.renderPage(searchParams, event, true, skipLoading);
  }

  onSubmitHandler(event) {
    event.preventDefault();
    const sortFilterForms = document.querySelectorAll("facet-filters-form form");
    if (event.srcElement.className == "mobile-facets__checkbox") {
      this.onSubmitForm(this.createSearchParams(event.target.closest("form")), event);
    } else {
      const forms = [];
      const isMobile = event.target.closest("form").id === "FacetFiltersFormMobile";
      sortFilterForms.forEach(form => {
        if (isMobile) {
          form.id === "FacetFiltersFormMobile" && forms.push(this.createSearchParams(form));
        } else {
          (form.id === "FacetSortForm" || form.id === "FacetFiltersForm" || form.id === "FacetSortDrawerForm") && forms.push(this.createSearchParams(form));
        }
      });
      this.onSubmitForm(forms.join("&"), event);
    }
  }

  onActiveFilterClick(event) {
    event.preventDefault();
    FacetFiltersForm.toggleActiveFacets();
    const url = event.currentTarget.href.indexOf("?") == -1 ? "" : event.currentTarget.href.slice(event.currentTarget.href.indexOf("?") + 1);
    FacetFiltersForm.renderPage(url);
  }
}

FacetFiltersForm.filterData = [];
FacetFiltersForm.searchParamsInitial = window.location.search.slice(1);
FacetFiltersForm.searchParamsPrev = window.location.search.slice(1);
customElements.define("facet-filters-form", FacetFiltersForm);
FacetFiltersForm.setListeners();

class PriceRange extends HTMLElement {
  constructor() {
    super();
    this.querySelectorAll("input").forEach(el => {
      el.addEventListener("change", this.onRangeChange.bind(this));
      el.addEventListener("keydown", this.onKeyDown.bind(this));
    });
    this.setMinAndMaxValues();
  }
  onRangeChange(event) {
    this.adjustToValidValues(event.currentTarget);
    this.setMinAndMaxValues();
  }
  onKeyDown(event) {
    if (event.metaKey) return;
    const pattern = /[0-9]|\.|,|'| |Tab|Backspace|Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Delete|Escape/;
    event.key.match(pattern) || event.preventDefault();
  }
  setMinAndMaxValues() {
    const inputs = this.querySelectorAll("input");
    const minInput = inputs[0], maxInput = inputs[1];
    maxInput.value && minInput.setAttribute("data-max", maxInput.value);
    minInput.value && maxInput.setAttribute("data-min", minInput.value);
    minInput.value === "" && maxInput.setAttribute("data-min", 0);
    maxInput.value === "" && minInput.setAttribute("data-max", maxInput.getAttribute("data-max"));
  }
  adjustToValidValues(input) {
    const value = Number(input.value);
    const min = Number(input.getAttribute("data-min"));
    const max = Number(input.getAttribute("data-max"));
    value < min && (input.value = min);
    value > max && (input.value = max);
  }
}
customElements.define("price-range", PriceRange);

class FacetRemove extends HTMLElement {
  constructor() {
    super();
    const facetLink = this.querySelector("a");
    facetLink.setAttribute("role", "button");
    facetLink.addEventListener("click", this.closeFilter.bind(this));
    facetLink.addEventListener("keyup", event => {
      event.preventDefault();
      event.code.toUpperCase() === "SPACE" && this.closeFilter(event);
    });
  }
  closeFilter(event) {
    event.preventDefault();
    (this.closest("facet-filters-form") || document.querySelector("facet-filters-form")).onActiveFilterClick(event);
  }
}
customElements.define("facet-remove", FacetRemove);
