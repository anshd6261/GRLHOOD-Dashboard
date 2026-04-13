/**
 * BLUORNG Story Viewer
 * Instagram-style stories with auto-advance, progress bars, swipe navigation
 */

(function () {
  'use strict';

  var viewer = document.querySelector('[data-story-viewer]');
  if (!viewer) return;

  var slides = viewer.querySelectorAll('[data-story-slide]');
  var progressSegments = viewer.querySelectorAll('[data-story-progress]');
  var triggers = document.querySelectorAll('[data-story-trigger]');
  var prevBtn = viewer.querySelector('[data-story-prev]');
  var nextBtn = viewer.querySelector('[data-story-next]');
  var closeBtns = viewer.querySelectorAll('[data-story-close]');

  var section = viewer.closest('[data-section-id]') || document.querySelector('.story-viewer-section');
  var duration = 5000; // default 5s
  if (section) {
    var sectionSettings = section.querySelector('script[type="application/json"]');
    // Duration comes from section settings, fallback to 5s
  }

  var currentIndex = 0;
  var timer = null;
  var isPaused = false;
  var startTime = 0;
  var elapsed = 0;

  function openViewer(index) {
    currentIndex = index || 0;
    viewer.classList.add('is-active');
    viewer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('scroll-locked');
    showSlide(currentIndex);
    // Save to session
    try { sessionStorage.setItem('story_current', String(currentIndex)); } catch (e) {}
  }

  function closeViewer() {
    viewer.classList.remove('is-active');
    viewer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('scroll-locked');
    stopTimer();
    // Reset progress
    progressSegments.forEach(function (seg) {
      seg.classList.remove('is-active', 'is-complete');
      var fill = seg.querySelector('.story-viewer__progress-fill');
      if (fill) {
        fill.style.transition = 'none';
        fill.style.width = '0';
      }
    });
    // Pause any playing videos
    slides.forEach(function (slide) {
      var video = slide.querySelector('video');
      if (video) video.pause();
    });
  }

  function showSlide(index) {
    if (index < 0 || index >= slides.length) {
      closeViewer();
      return;
    }

    currentIndex = index;
    stopTimer();

    // Update slides
    slides.forEach(function (s, i) {
      s.classList.toggle('is-active', i === index);
      // Pause all videos
      var video = s.querySelector('video');
      if (video) video.pause();
    });

    // Update progress bars
    progressSegments.forEach(function (seg, i) {
      var fill = seg.querySelector('.story-viewer__progress-fill');
      if (!fill) return;

      if (i < index) {
        // Completed
        seg.classList.add('is-complete');
        seg.classList.remove('is-active');
        fill.style.transition = 'none';
        fill.style.width = '100%';
      } else if (i === index) {
        // Current
        seg.classList.remove('is-complete');
        seg.classList.add('is-active');
        fill.style.transition = 'none';
        fill.style.width = '0';
        // Trigger reflow then animate
        void fill.offsetWidth;
      } else {
        // Future
        seg.classList.remove('is-complete', 'is-active');
        fill.style.transition = 'none';
        fill.style.width = '0';
      }
    });

    // Handle video slides
    var activeSlide = slides[index];
    var video = activeSlide.querySelector('video');
    var slideDuration = duration;

    if (video) {
      video.currentTime = 0;
      video.play().catch(function () {});
      if (video.duration && !isNaN(video.duration)) {
        slideDuration = video.duration * 1000;
      }
    }

    // Animate current progress bar
    var currentFill = progressSegments[index].querySelector('.story-viewer__progress-fill');
    if (currentFill) {
      requestAnimationFrame(function () {
        currentFill.style.transition = 'width ' + slideDuration + 'ms linear';
        currentFill.style.width = '100%';
      });
    }

    // Auto-advance
    elapsed = 0;
    startTime = Date.now();
    timer = setTimeout(function () {
      showSlide(currentIndex + 1);
    }, slideDuration);

    try { sessionStorage.setItem('story_current', String(currentIndex)); } catch (e) {}
  }

  function stopTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function goNext() {
    if (currentIndex < slides.length - 1) {
      showSlide(currentIndex + 1);
    } else {
      closeViewer();
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      showSlide(currentIndex - 1);
    } else {
      showSlide(0);
    }
  }

  // Event listeners
  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var index = parseInt(this.dataset.storyTrigger) || 0;
      openViewer(index);
    });
  });

  closeBtns.forEach(function (btn) {
    btn.addEventListener('click', closeViewer);
  });

  if (prevBtn) prevBtn.addEventListener('click', goPrev);
  if (nextBtn) nextBtn.addEventListener('click', goNext);

  // Touch swipe on viewer
  var touchStartX = 0;
  var touchStartY = 0;

  viewer.addEventListener('touchstart', function (e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  viewer.addEventListener('touchend', function (e) {
    var diffX = touchStartX - e.changedTouches[0].screenX;
    var diffY = touchStartY - e.changedTouches[0].screenY;

    // Only handle horizontal swipes
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0) goNext();
      else goPrev();
    }
  }, { passive: true });

  // Tap to advance (left/right halves)
  var container = viewer.querySelector('.story-viewer__container');
  if (container) {
    container.addEventListener('click', function (e) {
      // Don't trigger on buttons/links
      if (e.target.closest('button, a, .story-viewer__content')) return;

      var rect = container.getBoundingClientRect();
      var clickX = e.clientX - rect.left;
      if (clickX < rect.width / 3) {
        goPrev();
      } else if (clickX > rect.width * 2 / 3) {
        goNext();
      }
    });
  }

  // Pause on hold
  if (container) {
    var holdTimer;
    container.addEventListener('mousedown', function (e) {
      if (e.target.closest('button, a')) return;
      holdTimer = setTimeout(function () {
        isPaused = true;
        stopTimer();
        var currentFill = progressSegments[currentIndex].querySelector('.story-viewer__progress-fill');
        if (currentFill) {
          currentFill.style.transition = 'none';
          // Keep current width
          var computed = getComputedStyle(currentFill).width;
          currentFill.style.width = computed;
        }
        elapsed = Date.now() - startTime;
      }, 200);
    });

    container.addEventListener('mouseup', function () {
      clearTimeout(holdTimer);
      if (isPaused) {
        isPaused = false;
        var remaining = duration - elapsed;
        if (remaining <= 0) remaining = 500;

        var currentFill = progressSegments[currentIndex].querySelector('.story-viewer__progress-fill');
        if (currentFill) {
          currentFill.style.transition = 'width ' + remaining + 'ms linear';
          currentFill.style.width = '100%';
        }

        startTime = Date.now() - elapsed;
        timer = setTimeout(function () {
          showSlide(currentIndex + 1);
        }, remaining);
      }
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', function (e) {
    if (!viewer.classList.contains('is-active')) return;

    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowRight') goNext();
    else if (e.key === 'ArrowLeft') goPrev();
  });

})();
