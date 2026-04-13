/**
 * BLUORNG Theme JavaScript
 * Handles: Header, Search, Mobile Menu, Mega Menu, Product Gallery,
 *          Product Form, Cart, Collection Filters, Sliders, Tabs
 */

(function () {
  'use strict';

  /* =============================================
     HEADER: Sticky behavior
     ============================================= */
  const header = document.querySelector('.header');
  if (header && header.dataset.sticky === 'true') {
    let lastScroll = 0;
    const headerSection = document.querySelector('.header-section');
    window.addEventListener('scroll', function () {
      const currentScroll = window.scrollY;
      if (currentScroll > 100) {
        headerSection.classList.add('is-scrolled');
      } else {
        headerSection.classList.remove('is-scrolled');
      }
      lastScroll = currentScroll;
    }, { passive: true });
  }

  /* =============================================
     SEARCH OVERLAY
     ============================================= */
  const searchToggle = document.querySelector('[data-search-toggle]');
  const searchOverlay = document.querySelector('.search-overlay');
  const searchClose = document.querySelector('[data-search-close]');
  const searchInput = document.querySelector('.search-overlay__input');

  if (searchToggle && searchOverlay) {
    searchToggle.addEventListener('click', function () {
      searchOverlay.classList.toggle('is-open');
      if (searchOverlay.classList.contains('is-open') && searchInput) {
        setTimeout(function () { searchInput.focus(); }, 100);
      }
    });

    if (searchClose) {
      searchClose.addEventListener('click', function () {
        searchOverlay.classList.remove('is-open');
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && searchOverlay.classList.contains('is-open')) {
        searchOverlay.classList.remove('is-open');
      }
    });
  }

  /* =============================================
     MOBILE MENU
     ============================================= */
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const menuClose = document.querySelector('[data-menu-close]');
  const menuOverlay = document.querySelector('[data-menu-overlay]');

  function openMobileMenu() {
    if (!mobileMenu || !menuToggle) return;
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    menuToggle.setAttribute('aria-expanded', 'true');
    if (menuOverlay) menuOverlay.classList.add('is-visible');
    document.body.classList.add('scroll-locked');
  }

  function closeMobileMenu() {
    if (!mobileMenu || !menuToggle) return;
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    menuToggle.setAttribute('aria-expanded', 'false');
    if (menuOverlay) menuOverlay.classList.remove('is-visible');
    document.body.classList.remove('scroll-locked');
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', function () {
      var isOpen = mobileMenu && mobileMenu.classList.contains('is-open');
      if (isOpen) closeMobileMenu();
      else openMobileMenu();
    });
  }

  if (menuClose) menuClose.addEventListener('click', closeMobileMenu);
  if (menuOverlay) menuOverlay.addEventListener('click', closeMobileMenu);

  // Mobile submenu toggles
  document.querySelectorAll('[data-mobile-submenu-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!expanded));
      var submenu = this.nextElementSibling;
      if (submenu) {
        submenu.classList.toggle('is-open');
      }
    });
  });

  /* =============================================
     MEGA MENU (Desktop)
     ============================================= */
  document.querySelectorAll('.header__nav-item--has-dropdown').forEach(function (item) {
    var trigger = item.querySelector('.header__nav-link--has-dropdown');
    var menu = item.querySelector('.mega-menu');
    if (!trigger || !menu) return;

    var closeTimeout;

    item.addEventListener('mouseenter', function () {
      clearTimeout(closeTimeout);
      // Close other mega menus
      document.querySelectorAll('.mega-menu').forEach(function (m) {
        m.setAttribute('aria-hidden', 'true');
      });
      document.querySelectorAll('.header__nav-link--has-dropdown').forEach(function (t) {
        t.setAttribute('aria-expanded', 'false');
      });
      menu.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
    });

    item.addEventListener('mouseleave', function () {
      closeTimeout = setTimeout(function () {
        menu.setAttribute('aria-hidden', 'true');
        trigger.setAttribute('aria-expanded', 'false');
      }, 150);
    });

    // Keyboard support
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = menu.getAttribute('aria-hidden') === 'false';
      menu.setAttribute('aria-hidden', String(isOpen));
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  // Close mega menus on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.mega-menu').forEach(function (m) {
        m.setAttribute('aria-hidden', 'true');
      });
      document.querySelectorAll('.header__nav-link--has-dropdown').forEach(function (t) {
        t.setAttribute('aria-expanded', 'false');
      });
    }
  });

  /* =============================================
     PRODUCT GALLERY
     ============================================= */
  var galleryMain = document.querySelector('[data-gallery-main]');
  if (galleryMain) {
    var slides = galleryMain.querySelectorAll('[data-gallery-slide]');
    var thumbnails = document.querySelectorAll('[data-thumbnail]');
    var counter = document.querySelector('[data-gallery-current]');
    var currentSlide = 0;

    function showSlide(index) {
      slides.forEach(function (s, i) {
        s.classList.toggle('is-active', i === index);
      });
      thumbnails.forEach(function (t, i) {
        t.classList.toggle('is-active', i === index);
      });
      if (counter) counter.textContent = index + 1;
      currentSlide = index;
    }

    thumbnails.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        showSlide(parseInt(this.dataset.thumbnail));
      });
    });

    // Swipe support for gallery
    var touchStartX = 0;
    var touchEndX = 0;
    galleryMain.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    galleryMain.addEventListener('touchend', function (e) {
      touchEndX = e.changedTouches[0].screenX;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && currentSlide < slides.length - 1) {
          showSlide(currentSlide + 1);
        } else if (diff < 0 && currentSlide > 0) {
          showSlide(currentSlide - 1);
        }
      }
    }, { passive: true });
  }

  // Image zoom modal
  document.querySelectorAll('[data-gallery-zoom]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = document.querySelector('[data-zoom-modal]');
      var img = document.querySelector('[data-zoom-image]');
      if (!modal || !img) return;
      var src = this.querySelector('img');
      if (src) {
        img.src = src.src.replace(/width=\d+/, 'width=1600');
        img.alt = src.alt;
      }
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('scroll-locked');
    });
  });

  document.querySelectorAll('[data-zoom-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = document.querySelector('[data-zoom-modal]');
      if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('scroll-locked');
      }
    });
  });

  /* =============================================
     PRODUCT FORM: Variant selection + ATC
     ============================================= */
  var productForm = document.querySelector('[data-product-form]');
  var productJson = document.querySelector('[data-product-json]');

  if (productForm && productJson) {
    try {
      var product = JSON.parse(productJson.textContent);
      var variantIdInput = productForm.querySelector('[data-variant-id]');
      var addToCartBtn = productForm.querySelector('[data-add-to-cart]');

      function getCurrentOptions() {
        var options = [];
        productForm.querySelectorAll('[data-option-input]').forEach(function (input) {
          if (input.type === 'radio') {
            if (input.checked) options.push(input.value);
          } else {
            options.push(input.value);
          }
        });
        return options;
      }

      function findVariant(options) {
        return product.variants.find(function (v) {
          return v.options.every(function (opt, i) {
            return opt === options[i];
          });
        });
      }

      function updateVariant() {
        var options = getCurrentOptions();
        var variant = findVariant(options);
        if (!variant) return;

        // Update hidden input
        if (variantIdInput) variantIdInput.value = variant.id;

        // Update URL
        var url = new URL(window.location);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url);

        // Update add to cart button
        if (addToCartBtn) {
          if (variant.available) {
            addToCartBtn.disabled = false;
            addToCartBtn.textContent = addToCartBtn.dataset.addText || 'Add to bag';
          } else {
            addToCartBtn.disabled = true;
            addToCartBtn.textContent = addToCartBtn.dataset.soldText || 'Sold out';
          }
        }

        // Update price
        var priceContainer = document.querySelector('[data-product-price]');
        if (priceContainer) {
          var priceEl = priceContainer.querySelector('.price__amount');
          if (priceEl) {
            var prefix = window.currencyPrefix || 'RS.';
            priceEl.textContent = prefix + ' ' + (variant.price / 100).toLocaleString('en-IN');
          }
        }
      }

      // Listen to option changes
      productForm.querySelectorAll('[data-option-input]').forEach(function (input) {
        input.addEventListener('change', updateVariant);
      });

      // AJAX add to cart
      productForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (addToCartBtn) addToCartBtn.disabled = true;

        var formData = new FormData(productForm);
        var data = {
          items: [{
            id: parseInt(formData.get('id')),
            quantity: parseInt(formData.get('quantity') || 1)
          }]
        };

        fetch(window.routes.cart_add_url + '.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.status === 422) {
              alert(data.description || 'Could not add to cart');
            } else {
              updateCartCount();
              if (addToCartBtn) {
                addToCartBtn.textContent = 'Added!';
                setTimeout(function () {
                  addToCartBtn.textContent = addToCartBtn.dataset.addText || 'Add to bag';
                  addToCartBtn.disabled = false;
                }, 1500);
              }
            }
          })
          .catch(function () {
            if (addToCartBtn) addToCartBtn.disabled = false;
          });
      });
    } catch (err) {
      // Product JSON parsing failed
    }
  }

  // Quantity buttons (product + cart)
  document.querySelectorAll('[data-quantity-minus]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = this.parentElement.querySelector('[data-quantity-input]') ||
                  this.parentElement.querySelector('input[type="number"]');
      if (input) {
        var val = parseInt(input.value) - 1;
        if (val >= parseInt(input.min || 1)) input.value = val;
      }
    });
  });

  document.querySelectorAll('[data-quantity-plus]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = this.parentElement.querySelector('[data-quantity-input]') ||
                  this.parentElement.querySelector('input[type="number"]');
      if (input) {
        input.value = parseInt(input.value) + 1;
      }
    });
  });

  /* =============================================
     CART: Quantity changes + Remove items
     ============================================= */
  function updateCartCount() {
    fetch(window.routes.cart_url + '.js')
      .then(function (res) { return res.json(); })
      .then(function (cart) {
        document.querySelectorAll('[data-cart-count]').forEach(function (el) {
          el.textContent = cart.item_count;
        });
        var totalEl = document.querySelector('[data-cart-total]');
        if (totalEl) {
          var prefix = window.currencyPrefix || 'RS.';
          totalEl.textContent = prefix + ' ' + (cart.total_price / 100).toLocaleString('en-IN');
        }
      });
  }

  // Cart quantity change buttons
  document.querySelectorAll('[data-quantity-change]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var line = parseInt(this.dataset.quantityChange);
      var direction = this.dataset.direction;
      var input = document.querySelector('[data-line-quantity="' + line + '"]');
      if (!input) return;

      var qty = parseInt(input.value);
      if (direction === 'minus') qty = Math.max(0, qty - 1);
      else qty = qty + 1;

      input.value = qty;

      var updates = {};
      updates[line] = qty;

      fetch(window.routes.cart_change_url + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line: line, quantity: qty })
      })
        .then(function () {
          if (qty === 0) location.reload();
          else updateCartCount();
        });
    });
  });

  // Remove cart items
  document.querySelectorAll('[data-remove-item]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var line = parseInt(this.dataset.removeItem);

      fetch(window.routes.cart_change_url + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line: line, quantity: 0 })
      })
        .then(function () { location.reload(); });
    });
  });

  /* =============================================
     PRODUCT TABS / ACCORDION
     ============================================= */
  document.querySelectorAll('[data-tab-trigger]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var index = this.dataset.tabTrigger;
      var content = document.querySelector('[data-tab-content="' + index + '"]');
      var isActive = this.classList.contains('is-active');

      // Accordion mode: toggle current
      this.classList.toggle('is-active', !isActive);
      this.setAttribute('aria-expanded', String(!isActive));
      if (content) content.classList.toggle('is-active', !isActive);
    });
  });

  /* =============================================
     SIZE GUIDE MODAL
     ============================================= */
  document.querySelectorAll('[data-size-guide-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var modal = document.querySelector('[data-size-guide-modal]');
      if (modal) {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('scroll-locked');
      }
    });
  });

  document.querySelectorAll('[data-size-guide-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = document.querySelector('[data-size-guide-modal]');
      if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('scroll-locked');
      }
    });
  });

  /* =============================================
     COLLECTION FILTERS
     ============================================= */
  var filterToggle = document.querySelector('[data-filter-toggle]');
  var filterSidebar = document.querySelector('[data-filter-sidebar]');
  var filterClose = document.querySelector('[data-filter-close]');
  var filterOverlay = document.querySelector('[data-filter-overlay]');

  function openFilters() {
    if (!filterSidebar) return;
    filterSidebar.classList.add('is-open');
    filterSidebar.setAttribute('aria-hidden', 'false');
    if (filterToggle) filterToggle.setAttribute('aria-expanded', 'true');
    if (filterOverlay) filterOverlay.classList.add('is-visible');
    document.body.classList.add('scroll-locked');
  }

  function closeFilters() {
    if (!filterSidebar) return;
    filterSidebar.classList.remove('is-open');
    filterSidebar.setAttribute('aria-hidden', 'true');
    if (filterToggle) filterToggle.setAttribute('aria-expanded', 'false');
    if (filterOverlay) filterOverlay.classList.remove('is-visible');
    document.body.classList.remove('scroll-locked');
  }

  if (filterToggle) filterToggle.addEventListener('click', openFilters);
  if (filterClose) filterClose.addEventListener('click', closeFilters);
  if (filterOverlay) filterOverlay.addEventListener('click', closeFilters);

  // Filter group toggles
  document.querySelectorAll('[data-filter-group-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!expanded));
    });
  });

  // Filter form submit
  var filterForm = document.querySelector('[data-filter-form]');
  if (filterForm) {
    filterForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var formData = new FormData(filterForm);
      var params = new URLSearchParams();

      for (var pair of formData.entries()) {
        if (pair[1]) params.append(pair[0], pair[1]);
      }

      var url = window.location.pathname;
      var paramStr = params.toString();
      if (paramStr) url += '?' + paramStr;

      window.location.href = url;
    });
  }

  /* =============================================
     COLLECTION SORT
     ============================================= */
  var sortSelect = document.querySelector('[data-sort-select]');
  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      var url = new URL(window.location);
      url.searchParams.set('sort_by', this.value);
      window.location.href = url.toString();
    });
  }

  /* =============================================
     COLLECTION SLIDER
     ============================================= */
  document.querySelectorAll('.collection-slider').forEach(function (section) {
    var track = section.querySelector('[data-slider-track]');
    var prevBtn = section.querySelector('[data-slider-prev]');
    var nextBtn = section.querySelector('[data-slider-next]');
    if (!track) return;

    var slides = track.children;
    var slideWidth = 0;
    var position = 0;
    var autoScroll = section.dataset.autoScroll === 'true';
    var interval = parseInt(section.dataset.scrollInterval) * 1000 || 8000;
    var autoTimer;

    function getSlideWidth() {
      if (slides.length === 0) return 0;
      var style = getComputedStyle(track);
      var gap = parseFloat(style.gap) || 8;
      return slides[0].offsetWidth + gap;
    }

    function getMaxPosition() {
      slideWidth = getSlideWidth();
      var visibleWidth = track.parentElement.offsetWidth;
      var totalWidth = slideWidth * slides.length - parseFloat(getComputedStyle(track).gap || 8);
      return Math.max(0, totalWidth - visibleWidth);
    }

    function slideTo(pos) {
      var max = getMaxPosition();
      position = Math.max(0, Math.min(pos, max));
      track.style.transform = 'translateX(-' + position + 'px)';
    }

    function slideNext() {
      slideWidth = getSlideWidth();
      slideTo(position + slideWidth);
      // Loop back to start
      if (position >= getMaxPosition()) {
        setTimeout(function () { slideTo(0); }, interval);
      }
    }

    function slidePrev() {
      slideWidth = getSlideWidth();
      slideTo(position - slideWidth);
    }

    if (nextBtn) nextBtn.addEventListener('click', function () {
      slideNext();
      resetAutoScroll();
    });

    if (prevBtn) prevBtn.addEventListener('click', function () {
      slidePrev();
      resetAutoScroll();
    });

    function startAutoScroll() {
      if (autoScroll && slides.length > 1) {
        autoTimer = setInterval(slideNext, interval);
      }
    }

    function resetAutoScroll() {
      clearInterval(autoTimer);
      startAutoScroll();
    }

    // Touch swipe
    var touchStartX = 0;
    track.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    track.addEventListener('touchend', function (e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) slideNext();
        else slidePrev();
        resetAutoScroll();
      }
    }, { passive: true });

    startAutoScroll();
  });

  /* =============================================
     CLOSE MODALS ON ESCAPE
     ============================================= */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeMobileMenu();
      closeFilters();

      // Close any open modals
      document.querySelectorAll('.is-open[role="dialog"], .is-active[role="dialog"]').forEach(function (modal) {
        modal.classList.remove('is-open', 'is-active');
        modal.setAttribute('aria-hidden', 'true');
      });
      document.body.classList.remove('scroll-locked');
    }
  });

})();
