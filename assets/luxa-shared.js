// LUXA shared behaviour: reveal-on-scroll, menu drawer, popup, banner rotation,
// FAQ accordion, contact/legal drawers, scroll-to-top, video carousel.
document.addEventListener('DOMContentLoaded', () => {
  initRevealAnimations();
  initBanner();
  initMenu();
  initPopup();
  initFaq();
  initDrawers();
  initScrollTop();
  initVideoCarousel();
  initTestimonialCarousel();
  initProductGallery();
  initBundleSelector();
});

function initRevealAnimations() {
  const targets = document.querySelectorAll(
    '.luxa-fade-up,.luxa-fade-in,.luxa-scale-up,.luxa-line-grow,.luxa-stagger-parent'
  );
  if (!targets.length) return;

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -80px 0px' }
  );
  targets.forEach((el) => obs.observe(el));
}

function initBanner() {
  const msgs = document.querySelectorAll('.luxa-banner-msg');
  if (!msgs.length) return;
  let current = 0;
  setInterval(() => {
    msgs[current].classList.remove('active');
    msgs[current].classList.add('exit');
    setTimeout(() => msgs[current].classList.remove('exit'), 500);
    current = (current + 1) % msgs.length;
    msgs[current].classList.add('active');
  }, 3000);
}

function initMenu() {
  const openBtn = document.querySelector('[data-luxa-menu-open]');
  const closeBtn = document.querySelector('[data-luxa-menu-close]');
  const overlay = document.querySelector('[data-luxa-menu-overlay]');
  const drawer = document.querySelector('[data-luxa-menu-drawer]');
  if (!drawer) return;

  const open = () => {
    overlay?.classList.add('open');
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    overlay?.classList.remove('open');
    drawer.classList.remove('open');
    document.body.style.overflow = '';
  };

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);

  drawer.querySelectorAll('a[href]').forEach((link) => link.addEventListener('click', close));

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) close();
  });
}

function initPopup() {
  const popup = document.querySelector('[data-luxa-popup]');
  if (!popup) return;
  const closeEls = popup.querySelectorAll('[data-luxa-popup-close]');
  // Shopify reloads the page with ?customer_posted=true after the signup form
  // submits; the popup must reopen then, or the success message (and the
  // discount code in it) is never seen.
  const posted = new URLSearchParams(window.location.search).get('customer_posted') === 'true';

  if (posted) {
    popup.classList.add('open');
    sessionStorage.setItem('luxa-popup-shown', '1');
  } else if (!sessionStorage.getItem('luxa-popup-shown')) {
    setTimeout(() => {
      popup.classList.add('open');
      sessionStorage.setItem('luxa-popup-shown', '1');
    }, 3000);
  }

  closeEls.forEach((el) => el.addEventListener('click', () => popup.classList.remove('open')));
}

function initFaq() {
  document.querySelectorAll('[data-luxa-faq-item]').forEach((item) => {
    item.addEventListener('click', () => {
      const answer = item.querySelector('.luxa-faq-a');
      const plus = item.querySelector('.luxa-faq-plus');
      const isOpen = answer.classList.contains('open');
      const parent = item.parentElement;
      parent.querySelectorAll('.luxa-faq-a').forEach((a) => a.classList.remove('open'));
      parent.querySelectorAll('.luxa-faq-plus').forEach((p) => p.classList.remove('open'));
      if (!isOpen) {
        answer.classList.add('open');
        plus.classList.add('open');
      }
    });
  });
}

function initDrawers() {
  const overlay = document.querySelector('[data-luxa-drawer-overlay]');
  const contactDrawer = document.querySelector('[data-luxa-contact-drawer]');
  const legalDrawer = document.querySelector('[data-luxa-legal-drawer]');

  const closeAll = () => {
    overlay?.classList.remove('open');
    contactDrawer?.classList.remove('open');
    legalDrawer?.classList.remove('open');
    document.body.style.overflow = '';
  };

  document.querySelectorAll('[data-luxa-open-contact]').forEach((el) =>
    el.addEventListener('click', () => {
      overlay?.classList.add('open');
      contactDrawer?.classList.add('open');
      document.body.style.overflow = 'hidden';
    })
  );

  document.querySelectorAll('[data-luxa-open-legal]').forEach((el) =>
    el.addEventListener('click', () => {
      overlay?.classList.add('open');
      legalDrawer?.classList.add('open');
      document.body.style.overflow = 'hidden';
      switchLegalTab(el.dataset.luxaOpenLegal);
    })
  );

  document.querySelectorAll('[data-luxa-legal-tab]').forEach((el) =>
    el.addEventListener('click', () => switchLegalTab(el.dataset.luxaLegalTab))
  );

  document.querySelectorAll('[data-luxa-drawer-close]').forEach((el) => el.addEventListener('click', closeAll));
  overlay?.addEventListener('click', closeAll);

  function switchLegalTab(tab) {
    document.querySelectorAll('[data-luxa-legal-tab]').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('[data-luxa-legal-panel]').forEach((p) => p.classList.remove('active'));
    document.querySelector(`[data-luxa-legal-tab="${tab}"]`)?.classList.add('active');
    document.querySelector(`[data-luxa-legal-panel="${tab}"]`)?.classList.add('active');
  }
}

function initScrollTop() {
  const btn = document.querySelector('[data-luxa-scroll-top]');
  if (!btn) return;
  window.addEventListener(
    'scroll',
    () => btn.classList.toggle('visible', window.scrollY > 500),
    { passive: true }
  );
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function initVideoCarousel() {
  const track = document.querySelector('[data-luxa-video-track]');
  if (!track) return;

  const cards = Array.from(track.querySelectorAll('[data-luxa-video-index]'));
  const dots = Array.from(document.querySelectorAll('[data-luxa-video-dot]'));
  const fill = document.querySelector('[data-luxa-video-fill]');
  const total = cards.length;
  const interval = 3500;
  let current = 0;
  let timer;

  function positionFor(index) {
    const diff = (index - current + total) % total;
    if (diff === 0) return 'luxa-center';
    if (diff === 1) return 'luxa-right';
    if (diff === total - 1) return 'luxa-left';
    if (diff === 2) return 'luxa-far-right';
    return 'luxa-far-left';
  }

  function render() {
    cards.forEach((card) => {
      const idx = parseInt(card.dataset.luxaVideoIndex, 10);
      card.className = 'luxa-video-card ' + positionFor(idx);
      const video = card.querySelector('.luxa-video-el');
      if (video && !video.paused) video.pause();
      card.querySelector('[data-luxa-video-play]')?.classList.remove('luxa-hidden');
    });
    dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
  }

  function startFill() {
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    setTimeout(() => {
      fill.style.transition = `width ${interval}ms linear`;
      fill.style.width = '100%';
    }, 50);
  }

  function resetAuto() {
    clearInterval(timer);
    startFill();
    timer = setInterval(next, interval);
  }

  function goTo(n) {
    current = ((n % total) + total) % total;
    render();
    resetAuto();
  }

  function next() {
    goTo(current + 1);
  }

  function prev() {
    goTo(current - 1);
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => goTo(parseInt(card.dataset.luxaVideoIndex, 10)));

    const playBtn = card.querySelector('[data-luxa-video-play]');
    const video = card.querySelector('.luxa-video-el');
    if (playBtn && video) {
      // Clicks on the video (incl. its native controls) must not bubble to the
      // card, whose click handler re-renders the carousel and pauses playback.
      video.addEventListener('click', (e) => e.stopPropagation());
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearInterval(timer);
        video.setAttribute('controls', '');
        video.play();
      });
      // The overlay play button tracks the video's real state, no matter how
      // playback was started or paused (overlay or native controls).
      video.addEventListener('play', () => {
        clearInterval(timer);
        card.classList.add('luxa-playing');
        playBtn.classList.add('luxa-hidden');
      });
      video.addEventListener('pause', () => {
        card.classList.remove('luxa-playing');
        playBtn.classList.remove('luxa-hidden');
      });
      video.addEventListener('ended', () => {
        video.removeAttribute('controls');
        resetAuto();
      });
    }
  });
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  document.querySelector('[data-luxa-video-next]')?.addEventListener('click', next);
  document.querySelector('[data-luxa-video-prev]')?.addEventListener('click', prev);

  let touchX = 0;
  track.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  track.addEventListener(
    'touchend',
    (e) => {
      const diff = touchX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) (diff > 0 ? next() : prev());
    },
    { passive: true }
  );

  render();
  resetAuto();
}

function initTestimonialCarousel() {
  const track = document.querySelector('[data-luxa-testimonial-track]');
  if (!track) return;

  const cards = Array.from(track.querySelectorAll('[data-luxa-testimonial-index]'));
  const dots = Array.from(document.querySelectorAll('[data-luxa-testimonial-dot]'));
  const fill = document.querySelector('[data-luxa-testimonial-fill]');
  const total = cards.length;
  if (!total) return;
  const interval = 4000;
  let current = 0;
  let timer;

  function positionFor(index) {
    const diff = (index - current + total) % total;
    if (diff === 0) return 'luxa-center';
    if (diff === 1) return 'luxa-right';
    if (diff === total - 1) return 'luxa-left';
    if (diff === 2) return 'luxa-far-right';
    return 'luxa-far-left';
  }

  function render() {
    cards.forEach((card) => {
      const idx = parseInt(card.dataset.luxaTestimonialIndex, 10);
      card.className = 'luxa-t-card ' + positionFor(idx);
    });
    dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
  }

  function startFill() {
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    setTimeout(() => {
      fill.style.transition = `width ${interval}ms linear`;
      fill.style.width = '100%';
    }, 50);
  }

  function resetAuto() {
    clearInterval(timer);
    startFill();
    timer = setInterval(next, interval);
  }

  function goTo(n) {
    current = ((n % total) + total) % total;
    render();
    resetAuto();
  }

  function next() {
    goTo(current + 1);
  }

  function prev() {
    goTo(current - 1);
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => goTo(parseInt(card.dataset.luxaTestimonialIndex, 10)));
  });
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  document.querySelector('[data-luxa-testimonial-next]')?.addEventListener('click', next);
  document.querySelector('[data-luxa-testimonial-prev]')?.addEventListener('click', prev);

  let touchX = 0;
  track.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  track.addEventListener(
    'touchend',
    (e) => {
      const diff = touchX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) (diff > 0 ? next() : prev());
    },
    { passive: true }
  );

  render();
  resetAuto();
}

function initProductGallery() {
  document.querySelectorAll('[data-luxa-thumb]').forEach((thumb) => {
    if (thumb.dataset.luxaMainSrc) {
      const preload = new Image();
      preload.src = thumb.dataset.luxaMainSrc;
    }

    thumb.addEventListener('click', () => {
      const target = document.getElementById(thumb.dataset.luxaTarget);
      if (target) target.src = thumb.dataset.luxaMainSrc;
      const siblings = thumb.parentElement ? thumb.parentElement.querySelectorAll('[data-luxa-thumb]') : [];
      siblings.forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
}

function initBundleSelector() {
  const options = document.querySelectorAll('[data-luxa-bundle-opt]');
  if (!options.length) return;
  const variantInput = document.querySelector('[data-luxa-bundle-variant-input]');
  const priceEl = document.querySelector('[data-luxa-bundle-price]');
  options.forEach((opt) => {
    opt.addEventListener('click', () => {
      options.forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      if (variantInput) variantInput.value = opt.dataset.luxaBundleOpt;
      if (priceEl) priceEl.textContent = opt.dataset.luxaBundlePrice;
    });
  });
}
