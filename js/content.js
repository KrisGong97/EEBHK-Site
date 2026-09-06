// Phase 6：从 content/*.json 填充新闻、业务、项目、荣誉与联系方式
// JSON 加载失败时保留页面里的静态兜底内容
(function () {
  var lang = document.documentElement.lang.toLowerCase().indexOf('en') === 0 ? 'en' : 'zh';
  var other = lang === 'en' ? 'zh' : 'en';
  var path = location.pathname.replace(/\\/g, '/');
  var inEn = /(?:^|\/)en(?:\/|$)/.test(path);
  var base = inEn ? '../content/' : 'content/';
  var root = inEn ? '../' : '';

  function pick(obj) {
    if (obj == null) return '';
    if (typeof obj !== 'object') return String(obj);
    return obj[lang] || obj.zh || obj.en || '';
  }

  function fetchJson(name) {
    return fetch(base + name, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });
  }

  function assetUrl(src) {
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return src;
    return root + src.replace(/^\//, '');
  }

  function appendParagraphs(parent, text) {
    String(text || '').split(/\n{2,}/).forEach(function (para) {
      var line = para.replace(/\s+/g, ' ').trim();
      if (!line) return;
      var p = document.createElement('p');
      p.textContent = line;
      parent.appendChild(p);
    });
  }

  function appendFigure(parent, src, caption) {
    if (!src || /\.gif(\?|$)/i.test(src)) return;
    var fig = document.createElement('figure');
    fig.className = 'article-figure';
    var img = document.createElement('img');
    img.src = assetUrl(src);
    img.alt = caption || '';
    img.className = 'article-inline';
    fig.appendChild(img);
    if (caption) {
      var cap = document.createElement('figcaption');
      cap.textContent = caption;
      fig.appendChild(cap);
    }
    parent.appendChild(fig);
  }

  function renderBlocks(parent, blocks, fallbackText) {
    if (!parent) return;
    parent.textContent = '';
    var hasBlocks = !!(blocks && blocks.length);
    if (hasBlocks) {
      blocks.forEach(function (block) {
        if (block.type === 'image') appendFigure(parent, block.src, pick(block.caption));
        else appendParagraphs(parent, pick(block));
      });
      return;
    }
    appendParagraphs(parent, fallbackText || '');
  }

  function bizIcon(name) {
    var icons = {
      rail: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21h16M6 21V8l6-4 6 4v13M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/></svg>',
      power: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
      rd: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
      shield: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>'
    };
    return icons[name] || icons.rail;
  }

  function notifyBusinessReady() {
    try { window.dispatchEvent(new CustomEvent('eebhk:business-ready')); } catch (e) { /* ignore */ }
  }

  function initProjectCarousel(root) {
    root = root || document.querySelector('[data-project-carousel]');
    if (!root || root.getAttribute('data-ready') === '1') return;
    var track = root.querySelector('[data-project-list]');
    if (!track) return;
    var originals = Array.prototype.filter.call(track.children, function (el) {
      return el.classList.contains('project-item') && !el.hasAttribute('data-clone');
    });
    if (originals.length < 2) return;

    root.removeAttribute('data-ready');
    Array.prototype.forEach.call(track.querySelectorAll('[data-clone]'), function (el) {
      el.parentNode.removeChild(el);
    });

    originals.forEach(function (el, i) {
      if (!el.querySelector('.project-index')) {
        var idx = document.createElement('span');
        idx.className = 'project-index';
        idx.textContent = ('0' + (i + 1)).slice(-2);
        el.insertBefore(idx, el.firstChild);
      }
    });

    root.classList.add('is-carousel');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('is-static');
      root.setAttribute('data-ready', '1');
      return;
    }

    function cloneSet() {
      originals.forEach(function (el) {
        var copy = el.cloneNode(true);
        copy.setAttribute('data-clone', '1');
        copy.setAttribute('aria-hidden', 'true');
        copy.tabIndex = -1;
        track.appendChild(copy);
      });
    }
    cloneSet();
    if (track.scrollWidth < (root.offsetWidth || 800) * 2) cloneSet();

    var offset = 0;
    var speed = 0.38;
    var paused = false;
    var dragging = false;
    var dragged = false;
    var lastX = 0;
    var setWidth = 0;
    var resumeTimer = 0;

    function measure() {
      var firstClone = track.querySelector('[data-clone]');
      setWidth = firstClone ? firstClone.offsetLeft : Math.round(track.scrollWidth / 2);
    }

    function apply() {
      if (setWidth > 0) {
        while (offset >= setWidth) offset -= setWidth;
        while (offset < 0) offset += setWidth;
      }
      track.style.transform = 'translate3d(' + (-offset) + 'px,0,0)';
    }

    function hold() {
      paused = true;
      clearTimeout(resumeTimer);
    }

    function release(delay) {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () { paused = false; }, delay || 1400);
    }

    function tick() {
      if (!paused && !dragging && setWidth) {
        offset += speed;
        apply();
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(function () {
      measure();
      apply();
      requestAnimationFrame(tick);
    });

    root.addEventListener('mouseenter', hold);
    root.addEventListener('mouseleave', function () { if (!dragging) release(400); });
    root.addEventListener('focusin', hold);
    root.addEventListener('focusout', function () { release(400); });

    function pointerX(e) {
      if (e.touches && e.touches[0]) return e.touches[0].clientX;
      if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
      return e.clientX;
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      dragged = false;
      hold();
      lastX = pointerX(e);
      root.classList.add('is-dragging');
    }

    function onMove(e) {
      if (!dragging) return;
      var x = pointerX(e);
      var dx = x - lastX;
      if (Math.abs(dx) > 2) dragged = true;
      offset -= dx;
      lastX = x;
      apply();
      if (e.cancelable) e.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('is-dragging');
      release(1800);
    }

    var viewport = root.querySelector('.project-viewport') || root;
    viewport.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    viewport.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    track.addEventListener('click', function (e) {
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
        dragged = false;
      }
    }, true);

    function nudge(dir) {
      hold();
      var step = (originals[0] && originals[0].offsetWidth || 340) + 22;
      offset += dir * step;
      apply();
      release(2200);
    }

    var prev = root.querySelector('[data-project-prev]');
    var next = root.querySelector('[data-project-next]');
    if (prev) prev.addEventListener('click', function () { nudge(-1); });
    if (next) next.addEventListener('click', function () { nudge(1); });

    window.addEventListener('resize', function () {
      measure();
      apply();
    });

    root.setAttribute('data-ready', '1');
  }

  function youtubeId(url) {
    var m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function biliId(url) {
    var m = String(url || '').match(/bilibili\.com\/video\/(BV[\w]+)/i);
    return m ? m[1] : '';
  }

  function renderVideo(box, url) {
    if (!box || !url) return;
    var yt = youtubeId(url);
    var bv = biliId(url);
    var wrap = document.createElement('div');
    wrap.className = 'article-video';
    if (yt) {
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/' + yt;
      iframe.title = 'YouTube';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
      box.appendChild(wrap);
      return;
    }
    if (bv) {
      var iframeB = document.createElement('iframe');
      iframeB.src = 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(bv) + '&high_quality=1';
      iframeB.title = 'Bilibili';
      iframeB.allowFullscreen = true;
      wrap.appendChild(iframeB);
      box.appendChild(wrap);
      return;
    }
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
      var video = document.createElement('video');
      video.controls = true;
      video.src = assetUrl(url);
      wrap.appendChild(video);
      box.appendChild(wrap);
      return;
    }
    var link = document.createElement('a');
    link.className = 'more-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = lang === 'en' ? 'Watch video →' : '觀看影片 →';
    box.appendChild(link);
  }

  function card(title, line, muted) {
    var div = document.createElement('div');
    div.className = 'contact-item';
    var h3 = document.createElement('h3');
    h3.textContent = title;
    var p = document.createElement('p');
    p.textContent = line;
    div.appendChild(h3);
    div.appendChild(p);
    if (muted) {
      var note = document.createElement('p');
      note.className = 'muted';
      note.textContent = muted;
      div.appendChild(note);
    }
    return div;
  }

  var newsBox = document.querySelector('[data-news-list]');
  if (newsBox) {
    fetchJson('news.json').then(function (data) {
      var items = (data.items || []).slice().sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
      var limit = parseInt(newsBox.getAttribute('data-news-limit'), 10);
      if (limit > 0) items = items.slice(0, limit);

      newsBox.innerHTML = '';
      items.forEach(function (item) {
        var a = document.createElement('a');
        a.className = 'news-item';
        a.href = 'news-detail.html?id=' + encodeURIComponent(item.id || '');
        var date = document.createElement('span');
        date.className = 'news-date';
        date.textContent = item.date || '';
        var h3 = document.createElement('h3');
        h3.textContent = pick(item.title);
        a.appendChild(date);
        a.appendChild(h3);
        newsBox.appendChild(a);
      });

      var note = document.querySelector('[data-news-note]');
      if (note && data.note) note.textContent = pick(data.note);
    }).catch(function () { /* 保留 HTML 兜底 */ });
  }

  var article = document.querySelector('[data-news-article]');
  if (article) {
    var id = new URLSearchParams(location.search).get('id') || '';
    var langLink = document.querySelector('[data-article-lang]');
    if (langLink && id) {
      var langHref = inEn ? '../news-detail.html?id=' : 'en/news-detail.html?id=';
      langLink.setAttribute('href', langHref + encodeURIComponent(id));
    }

    fetchJson('news.json').then(function (data) {
      var item = (data.items || []).filter(function (x) { return x.id === id; })[0];
      var titleEl = document.querySelector('[data-article-title]');
      var dateEl = document.querySelector('[data-article-date]');
      var crumbEl = document.querySelector('[data-article-crumb]');
      var bodyEl = document.querySelector('[data-article-body]');
      var imageEl = document.querySelector('[data-article-image]');
      var videoEl = document.querySelector('[data-article-video]');
      var bylineEl = document.querySelector('[data-article-byline]');
      var galleryEl = document.querySelector('[data-article-gallery]');
      var notFound = lang === 'en' ? 'Article not found.' : '找不到這則新聞。';

      if (!item) {
        if (titleEl) titleEl.textContent = notFound;
        if (bodyEl) {
          bodyEl.textContent = '';
          var p = document.createElement('p');
          p.textContent = notFound;
          bodyEl.appendChild(p);
        }
        document.title = notFound;
        return;
      }

      var title = pick(item.title);
      document.title = title + (lang === 'en'
        ? ' — EEBHK'
        : ' — 中鐵電氣化局集團（香港）有限公司');
      if (titleEl) titleEl.textContent = title;
      if (crumbEl) crumbEl.textContent = title;
      if (dateEl) dateEl.textContent = item.date || '';
      if (bylineEl) {
        var bits = [];
        if (item.editor) bits.push((lang === 'en' ? 'Editor: ' : '編輯：') + item.editor);
        if (item.reviewer) bits.push((lang === 'en' ? 'Reviewed by: ' : '審核：') + item.reviewer);
        if (item.source) bits.push((lang === 'en' ? 'Source: ' : '來源：') + item.source);
        bylineEl.textContent = bits.join('  ·  ');
        bylineEl.hidden = bits.length === 0;
      }
      function appendParagraphs(parent, text) {
        String(text || '').split(/\n{2,}/).forEach(function (para) {
          var line = para.replace(/\s+/g, ' ').trim();
          if (!line) return;
          var p = document.createElement('p');
          p.textContent = line;
          parent.appendChild(p);
        });
      }

      function appendFigure(parent, src, caption) {
        if (!src || /\.gif(\?|$)/i.test(src)) return;
        var fig = document.createElement('figure');
        fig.className = 'article-figure';
        var img = document.createElement('img');
        img.src = assetUrl(src);
        img.alt = caption || title;
        img.className = 'article-inline';
        fig.appendChild(img);
        if (caption) {
          var cap = document.createElement('figcaption');
          cap.textContent = caption;
          fig.appendChild(cap);
        }
        parent.appendChild(fig);
      }

      var hasBlocks = !!(item.blocks && item.blocks.length);
      if (imageEl) {
        if (!hasBlocks && item.image) {
          imageEl.src = assetUrl(item.image);
          imageEl.alt = title;
          imageEl.hidden = false;
        } else {
          imageEl.hidden = true;
        }
      }
      if (bodyEl) {
        bodyEl.textContent = '';
        if (hasBlocks) {
          item.blocks.forEach(function (block) {
            if (block.type === 'image') appendFigure(bodyEl, block.src, pick(block.caption));
            else appendParagraphs(bodyEl, pick(block));
          });
        } else {
          appendParagraphs(bodyEl, pick(item.body) || pick(item.summary) || '');
        }
      }
      if (videoEl) renderVideo(videoEl, item.video || '');
      if (galleryEl) {
        galleryEl.textContent = '';
        if (!hasBlocks) {
          (item.images || []).filter(function (src) {
            return src && src !== item.image && !/\.gif(\?|$)/i.test(src);
          }).forEach(function (src) {
            appendFigure(galleryEl, src, '');
          });
        }
      }
    }).catch(function () {
      var titleEl = document.querySelector('[data-article-title]');
      if (titleEl) titleEl.textContent = lang === 'en' ? 'Failed to load article.' : '新聞載入失敗。';
    });
  }

  var contactBox = document.querySelector('[data-contact-cards]');
  if (contactBox) {
    fetchJson('site.json').then(function (data) {
      var c = data.contact || {};
      var layout = contactBox.getAttribute('data-contact-layout') || 'home';
      contactBox.innerHTML = '';

      if (layout === 'page') {
        var otherAddress = c.address && c.address[other] ? c.address[other] : '';
        contactBox.appendChild(card(pick(c.addressLabelFull || c.addressLabel), pick(c.address), otherAddress));
      } else {
        contactBox.appendChild(card(pick(c.addressLabel), pick(c.region), pick(c.address)));
      }

      contactBox.appendChild(card(pick(c.businessLabel), c.businessEmail || '', pick(c.businessNote)));
      contactBox.appendChild(card(pick(c.careersLabel), c.careersEmail || '', pick(c.careersNote)));

      var intro = document.querySelector('[data-contact-intro]');
      if (intro && c.intro) intro.textContent = pick(c.intro);
    }).catch(function () { /* 保留 HTML 兜底 */ });
  }

  var honorBox = document.querySelector('[data-honor-list]');
  if (honorBox) {
    fetchJson('honors.json').then(function (data) {
      var items = (data.items || []).slice().sort(function (a, b) {
        return String(b.year || '').localeCompare(String(a.year || ''));
      });
      var emptyEl = document.querySelector('[data-honor-empty]');
      if (!items.length) {
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      honorBox.innerHTML = '';
      items.forEach(function (item) {
        var cardEl = document.createElement('article');
        cardEl.className = 'honor-card';
        if (item.image && !/\.gif(\?|$)/i.test(item.image)) {
          var img = document.createElement('img');
          img.src = assetUrl(item.image);
          img.alt = pick(item.name);
          cardEl.appendChild(img);
        }
        var body = document.createElement('div');
        body.className = 'honor-body';
        if (item.year) {
          var year = document.createElement('div');
          year.className = 'honor-year';
          year.textContent = item.year;
          body.appendChild(year);
        }
        var h4 = document.createElement('h4');
        h4.textContent = pick(item.name);
        body.appendChild(h4);
        if (pick(item.issuer)) {
          var issuer = document.createElement('p');
          issuer.className = 'muted';
          issuer.textContent = pick(item.issuer);
          body.appendChild(issuer);
        }
        if (pick(item.note)) {
          var note = document.createElement('p');
          note.className = 'muted';
          note.textContent = pick(item.note);
          body.appendChild(note);
        }
        cardEl.appendChild(body);
        honorBox.appendChild(cardEl);
      });
    }).catch(function () { /* 保留待補充提示 */ });
  }

  var bizPage = document.querySelector('[data-business-page]');
  var bizCards = document.querySelector('[data-business-cards]');
  if (bizPage || bizCards) {
    fetchJson('business.json').then(function (data) {
      var items = data.items || [];
      if (bizPage && items.length) {
        bizPage.innerHTML = '';
        items.forEach(function (item) {
          var h3 = document.createElement('h3');
          h3.textContent = pick(item.title);
          bizPage.appendChild(h3);
          if (pick(item.body)) {
            var p = document.createElement('p');
            p.textContent = pick(item.body);
            bizPage.appendChild(p);
          }
          var points = (item.points || []).map(pick).filter(Boolean);
          if (points.length) {
            var ul = document.createElement('ul');
            points.forEach(function (line) {
              var li = document.createElement('li');
              li.textContent = line;
              ul.appendChild(li);
            });
            bizPage.appendChild(ul);
          }
        });
      }
      if (bizCards && items.length) {
        bizCards.innerHTML = '';
        items.forEach(function (item) {
          var cardEl = document.createElement('div');
          cardEl.className = 'card';
          var icon = document.createElement('div');
          icon.className = 'card-icon';
          icon.innerHTML = bizIcon(item.icon);
          var h3 = document.createElement('h3');
          h3.textContent = pick(item.title);
          var p = document.createElement('p');
          p.textContent = pick(item.summary) || pick(item.body);
          cardEl.appendChild(icon);
          cardEl.appendChild(h3);
          cardEl.appendChild(p);
          bizCards.appendChild(cardEl);
        });
        var total = document.querySelector('.pin-total');
        if (total) total.textContent = '/ ' + ('0' + items.length).slice(-2);
      }
      notifyBusinessReady();
    }).catch(function () { notifyBusinessReady(); });
  }

  var projectLists = document.querySelectorAll('[data-project-list]');
  if (projectLists.length) {
    fetchJson('projects.json').then(function (data) {
      var all = data.items || [];
      projectLists.forEach(function (box) {
        var items = all.slice();
        if (box.getAttribute('data-project-featured') === '1') {
          var featured = items.filter(function (x) { return x.featured; });
          if (featured.length) items = featured;
        }
        var limit = parseInt(box.getAttribute('data-project-limit'), 10);
        if (limit > 0) items = items.slice(0, limit);
        if (!items.length) return;
        var homeStyle = box.classList.contains('project-list');
        var stage = box.closest('[data-project-carousel]');
        if (stage) stage.removeAttribute('data-ready');
        box.innerHTML = '';
        items.forEach(function (item) {
          var href = 'project-detail.html?id=' + encodeURIComponent(item.id || '');
          if (homeStyle) {
            var a = document.createElement('a');
            a.className = 'project-item';
            a.href = href;
            if (pick(item.tag)) {
              var tag = document.createElement('span');
              tag.className = 'project-tag';
              tag.textContent = pick(item.tag);
              a.appendChild(tag);
            }
            var h3 = document.createElement('h3');
            h3.textContent = pick(item.title);
            var p = document.createElement('p');
            p.textContent = pick(item.summary);
            a.appendChild(h3);
            a.appendChild(p);
            box.appendChild(a);
          } else {
            var card = document.createElement('a');
            card.className = 'project-case' + (item.image ? '' : ' no-image');
            card.href = href;
            if (item.image && !/\.gif(\?|$)/i.test(item.image)) {
              var img = document.createElement('img');
              img.src = assetUrl(item.image);
              img.alt = pick(item.title);
              card.appendChild(img);
            }
            var body = document.createElement('div');
            if (pick(item.tag)) {
              var tag2 = document.createElement('span');
              tag2.className = 'project-tag';
              tag2.textContent = pick(item.tag);
              body.appendChild(tag2);
            }
            var h = document.createElement('h3');
            h.textContent = pick(item.title);
            var sum = document.createElement('p');
            sum.textContent = pick(item.summary);
            var more = document.createElement('span');
            more.className = 'more-link';
            more.textContent = lang === 'en' ? 'View details →' : '查看詳情 →';
            body.appendChild(h);
            body.appendChild(sum);
            body.appendChild(more);
            card.appendChild(body);
            box.appendChild(card);
          }
        });
        if (stage) initProjectCarousel(stage);
      });
      var lead = document.querySelector('[data-project-lead]');
      if (lead && data.lead) lead.textContent = pick(data.lead);
    }).catch(function () {
      initProjectCarousel();
    });
  }

  var projectArticle = document.querySelector('[data-project-article]');
  if (projectArticle) {
    var pid = new URLSearchParams(location.search).get('id') || '';
    var plang = document.querySelector('[data-article-lang]');
    if (plang && pid) {
      var phref = inEn ? '../project-detail.html?id=' : 'en/project-detail.html?id=';
      plang.setAttribute('href', phref + encodeURIComponent(pid));
    }
    fetchJson('projects.json').then(function (data) {
      var item = (data.items || []).filter(function (x) { return x.id === pid; })[0];
      var titleEl = document.querySelector('[data-article-title]');
      var tagEl = document.querySelector('[data-article-tag]');
      var crumbEl = document.querySelector('[data-article-crumb]');
      var bodyEl = document.querySelector('[data-article-body]');
      var imageEl = document.querySelector('[data-article-image]');
      var notFound = lang === 'en' ? 'Project not found.' : '找不到這個項目。';
      if (!item) {
        if (titleEl) titleEl.textContent = notFound;
        if (bodyEl) {
          bodyEl.textContent = '';
          var miss = document.createElement('p');
          miss.textContent = notFound;
          bodyEl.appendChild(miss);
        }
        document.title = notFound;
        return;
      }
      var title = pick(item.title);
      document.title = title + (lang === 'en'
        ? ' — EEBHK'
        : ' — 中鐵電氣化局集團（香港）有限公司');
      if (titleEl) titleEl.textContent = title;
      if (crumbEl) crumbEl.textContent = title;
      if (tagEl) {
        tagEl.textContent = pick(item.tag);
        tagEl.hidden = !pick(item.tag);
      }
      var hasBlocks = !!(item.blocks && item.blocks.length);
      if (imageEl) {
        if (item.image && !/\.gif(\?|$)/i.test(item.image)) {
          imageEl.src = assetUrl(item.image);
          imageEl.alt = title;
          imageEl.hidden = false;
        } else {
          imageEl.hidden = true;
        }
      }
      if (bodyEl) {
        if (hasBlocks) {
          renderBlocks(bodyEl, item.blocks, '');
        } else {
          renderBlocks(bodyEl, null, pick(item.summary));
        }
      }
    }).catch(function () {
      var titleEl = document.querySelector('[data-article-title]');
      if (titleEl) titleEl.textContent = lang === 'en' ? 'Failed to load project.' : '項目載入失敗。';
    });
  }
})();
