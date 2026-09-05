// Phase 3 动效：Lenis 平滑滚动 + 滚动渐显 + 数字增长 + Hero 视差 + GSAP 板块钉住叙事
(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  if (hasGsap) window.gsap.registerPlugin(window.ScrollTrigger);

  // ---------- Lenis 平滑滚动 ----------
  var lenis = null;
  if (!reduced && typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
    if (hasGsap) {
      // 与 ScrollTrigger 同步：由 gsap.ticker 统一驱动，避免双 raf 打架
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      var rafLoop = function (time) {
        lenis.raf(time);
        requestAnimationFrame(rafLoop);
      };
      requestAnimationFrame(rafLoop);
    }
  }

  // 页内锚点跳转（固定导航高度 64px 偏移）
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length > 1 && document.querySelector(id)) {
        e.preventDefault();
        if (lenis) {
          lenis.scrollTo(id, { offset: -64 });
        } else {
          document.querySelector(id).scrollIntoView();
        }
      }
    });
  });

  if (reduced) return; // 以下动效在"减少动态效果"偏好下全部跳过

  // ---------- 板块钉住叙事（业务板块，仅桌面端）----------
  var pinSection = document.querySelector('#business');
  var pinActive = !!(pinSection && hasGsap && window.innerWidth > 900);
  if (pinActive) pinSection.classList.add('pin-active');

  // ---------- 滚动渐显 ----------
  var revealEls = [];

  document.querySelectorAll('[data-reveal]').forEach(function (el) {
    el.classList.add('reveal');
    revealEls.push(el);
  });

  // 阶梯容器：子元素依次延迟浮现（钉住模式的卡片由 GSAP 接管，跳过）
  document.querySelectorAll('[data-reveal-stagger]').forEach(function (box) {
    if (box.closest('.pin-active')) return;
    Array.prototype.slice.call(box.children).forEach(function (child, i) {
      child.classList.add('reveal');
      child.style.transitionDelay = (i * 90) + 'ms';
      revealEls.push(child);
    });
  });

  function cleanup(el) {
    // 渐显结束后移除类与内联延迟，还原元素自身的 hover 过渡
    el.classList.remove('reveal', 'revealed');
    el.style.transitionDelay = '';
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        el.classList.add('revealed');
        el.addEventListener('transitionend', function () { cleanup(el); }, { once: true });
        setTimeout(function () { cleanup(el); }, 1600); // 兜底，防止 transitionend 不触发
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(cleanup);
  }

  // ---------- 数据带数字增长 ----------
  var counters = document.querySelectorAll('[data-count]');

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    var duration = 1600;
    var start = null;

    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        cio.unobserve(entry.target);
        animateCount(entry.target);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  // ---------- Hero 视差（仅桌面端）----------
  var heroBg = document.querySelector('.hero-bg');
  if (heroBg && window.innerWidth > 900) {
    var ticking = false;
    var parallax = function () {
      var y = window.scrollY;
      if (y < window.innerHeight * 1.2) {
        heroBg.style.transform = 'translate3d(0,' + (y * 0.28) + 'px,0) scale(' + (1 + y * 0.0004) + ')';
      }
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(parallax);
        ticking = true;
      }
    }, { passive: true });
  }

  // ---------- GSAP 钉住时间线 ----------
  if (pinActive) {
    var gsap = window.gsap;
    var cards = gsap.utils.toArray(pinSection.querySelectorAll('.card'));
    var current = pinSection.querySelector('.pin-current');
    var bar = pinSection.querySelector('.pin-bar span');

    gsap.set(cards, { opacity: 0, y: 36 });
    gsap.set(cards[0], { opacity: 1, y: 0 });

    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: pinSection,
        start: 'top top+=64',
        end: '+=' + ((cards.length - 1) * 100) + '%',
        pin: true,
        scrub: 0.6,
        snap: 1 / (cards.length - 1),
        anticipatePin: 1,
        onUpdate: function (self) {
          var idx = Math.round(self.progress * (cards.length - 1));
          if (current) current.textContent = ('0' + (idx + 1)).slice(-2);
          if (bar) bar.style.width = (self.progress * 100) + '%';
        }
      }
    });

    // 每张卡占 1 个时间单位：先出后进，snap 点落在切换完成之后
    for (var i = 1; i < cards.length; i++) {
      tl.to(cards[i - 1], { opacity: 0, y: -36, duration: 0.4, ease: 'power2.in' }, i - 1)
        .fromTo(cards[i], { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, i - 1 + 0.35);
    }
  }
})();
