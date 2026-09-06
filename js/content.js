// Phase 6：从 content/*.json 填充新闻列表与联系方式
// JSON 加载失败时保留页面里的静态兜底内容
(function () {
  var lang = document.documentElement.lang.toLowerCase().indexOf('en') === 0 ? 'en' : 'zh';
  var other = lang === 'en' ? 'zh' : 'en';
  var base = /(?:^|\/)en(?:\/|$)/.test(location.pathname.replace(/\\/g, '/'))
    ? '../content/'
    : 'content/';

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
      var href = newsBox.getAttribute('data-news-href') || 'news.html';

      newsBox.innerHTML = '';
      items.forEach(function (item) {
        var a = document.createElement('a');
        a.className = 'news-item';
        a.href = href;
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
