// Phase 6：从 content/*.json 填充新闻列表、详情与联系方式
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
})();
