(function () {
  var REPO = 'KrisGong97/EEBHK-Site';
  var BRANCH = 'main';
  var API = 'https://api.github.com';

  var token = '';
  var newsFile = { sha: '', data: { note: { zh: '', en: '' }, items: [] } };
  var siteFile = { sha: '', data: { contact: {} } };
  var editingId = null;

  var $ = function (id) { return document.getElementById(id); };

  function setStatus(el, text, kind) {
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function headers() {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function encodeContent(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function decodeContent(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
  }

  function api(path, options) {
    return fetch(API + path, options).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          var msg = body && body.message ? body.message : ('HTTP ' + res.status);
          throw new Error(msg);
        }
        return body;
      });
    });
  }

  function loadFile(path, store) {
    return api('/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH, {
      headers: headers()
    }).then(function (file) {
      store.sha = file.sha;
      store.data = JSON.parse(decodeContent(file.content));
    });
  }

  function saveFile(path, store, message) {
    var pretty = JSON.stringify(store.data, null, 2) + '\n';
    return api('/repos/' + REPO + '/contents/' + path, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
      body: JSON.stringify({
        message: message,
        content: encodeContent(pretty),
        sha: store.sha,
        branch: BRANCH
      })
    }).then(function (result) {
      store.sha = result.content.sha;
    });
  }

  function slugify(text) {
    var s = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return s || 'news';
  }

  function uploadImage(file) {
    var safe = String(file.name || 'image.jpg').replace(/[^A-Za-z0-9._-]/g, '_');
    var dest = 'uploads/news/' + Date.now() + '-' + safe;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var b64 = String(reader.result).split(',')[1];
        api('/repos/' + REPO + '/contents/' + dest, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
          body: JSON.stringify({
            message: '上传新闻配图 ' + safe,
            content: b64,
            branch: BRANCH
          })
        }).then(function () { resolve(dest); }).catch(reject);
      };
      reader.readAsDataURL(file);
    });
  }

  function show(id) {
    ['news-list-view', 'news-form-view', 'site-view'].forEach(function (name) {
      $(name).classList.toggle('hidden', name !== id);
    });
  }

  function renderNewsList() {
    var box = $('news-list');
    box.innerHTML = '';
    var items = (newsFile.data.items || []).slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    if (!items.length) {
      box.textContent = '还没有新闻。';
      return;
    }
    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'news-row';
      var left = document.createElement('div');
      var title = document.createElement('div');
      title.textContent = (item.title && item.title.zh) || item.id;
      var meta = document.createElement('small');
      meta.textContent = (item.date || '') + '  ·  ' + item.id;
      left.appendChild(title);
      left.appendChild(meta);
      var actions = document.createElement('div');
      actions.className = 'row';
      var edit = document.createElement('button');
      edit.className = 'btn btn-ghost';
      edit.type = 'button';
      edit.textContent = '编辑';
      edit.addEventListener('click', function () { openNewsForm(item.id); });
      var del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.type = 'button';
      del.textContent = '删除';
      del.addEventListener('click', function () { deleteNews(item.id); });
      actions.appendChild(edit);
      actions.appendChild(del);
      row.appendChild(left);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function emptyNews() {
    return {
      id: '',
      date: new Date().toISOString().slice(0, 10),
      title: { zh: '', en: '' },
      summary: { zh: '', en: '' },
      body: { zh: '', en: '' },
      image: '',
      images: [],
      video: '',
      editor: '',
      reviewer: '',
      source: ''
    };
  }

  function openNewsForm(id) {
    var item = id
      ? (newsFile.data.items || []).filter(function (x) { return x.id === id; })[0]
      : emptyNews();
    if (!item) item = emptyNews();
    editingId = id || null;
    $('news-form-title').textContent = id ? '编辑新闻' : '新建新闻';
    $('f-id').value = item.id || '';
    $('f-id').disabled = !!id;
    $('f-date').value = item.date || '';
    $('f-title-zh').value = (item.title && item.title.zh) || '';
    $('f-title-en').value = (item.title && item.title.en) || '';
    $('f-summary-zh').value = (item.summary && item.summary.zh) || '';
    $('f-summary-en').value = (item.summary && item.summary.en) || '';
    $('f-body-zh').value = (item.body && item.body.zh) || '';
    $('f-body-en').value = (item.body && item.body.en) || '';
    $('f-image').value = item.image || '';
    $('f-image-file').value = '';
    $('f-video').value = item.video || '';
    $('f-editor').value = item.editor || '';
    $('f-reviewer').value = item.reviewer || '';
    $('f-source').value = item.source || '';
    $('f-images').value = (item.images || []).join('\n');
    setStatus($('news-status'), '');
    show('news-form-view');
  }

  function collectNews() {
    var date = $('f-date').value.trim();
    var id = $('f-id').value.trim() || (date + '-' + slugify($('f-title-en').value || $('f-title-zh').value));
    return {
      id: id,
      date: date,
      title: { zh: $('f-title-zh').value.trim(), en: $('f-title-en').value.trim() },
      summary: { zh: $('f-summary-zh').value.trim(), en: $('f-summary-en').value.trim() },
      body: { zh: $('f-body-zh').value.replace(/\r\n/g, '\n').trim(), en: $('f-body-en').value.replace(/\r\n/g, '\n').trim() },
      image: $('f-image').value.trim(),
      images: $('f-images').value.split(/\n+/).map(function (s) { return s.trim(); }).filter(function (s) {
        return s && !/\.gif(\?|$)/i.test(s);
      }),
      video: $('f-video').value.trim(),
      editor: $('f-editor').value.trim(),
      reviewer: $('f-reviewer').value.trim(),
      source: $('f-source').value.trim()
    };
  }

  function saveNews() {
    var btn = $('save-news');
    var status = $('news-status');
    var item = collectNews();
    if (!item.date || !item.title.zh) {
      setStatus(status, '请至少填写日期和繁中标题。', 'err');
      return;
    }
    btn.disabled = true;
    setStatus(status, '正在保存…');

    var file = $('f-image-file').files[0];
    var upload = file ? uploadImage(file) : Promise.resolve(item.image);

    upload.then(function (imagePath) {
      item.image = imagePath || '';
      if (item.image && item.images.indexOf(item.image) === -1) item.images.unshift(item.image);
      if (!newsFile.data.items) newsFile.data.items = [];
      if (editingId) {
        newsFile.data.items = newsFile.data.items.map(function (x) {
          return x.id === editingId ? item : x;
        });
      } else {
        if (newsFile.data.items.some(function (x) { return x.id === item.id; })) {
          throw new Error('编号 id 已存在，请换一个。');
        }
        newsFile.data.items.unshift(item);
      }
      return saveFile('content/news.json', newsFile, editingId ? '更新新闻：' + item.id : '新增新闻：' + item.id);
    }).then(function () {
      setStatus(status, '已保存。约 30 秒后刷新网站即可看到更新。', 'ok');
      renderNewsList();
    }).catch(function (err) {
      setStatus(status, '保存失败：' + err.message, 'err');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function deleteNews(id) {
    if (!confirm('确定删除这条新闻？删除后会立即写入仓库。')) return;
    newsFile.data.items = (newsFile.data.items || []).filter(function (x) { return x.id !== id; });
    saveFile('content/news.json', newsFile, '删除新闻：' + id).then(function () {
      renderNewsList();
    }).catch(function (err) {
      alert('删除失败：' + err.message);
    });
  }

  function fillSite() {
    var c = siteFile.data.contact || {};
    $('s-address-zh').value = (c.address && c.address.zh) || '';
    $('s-address-en').value = (c.address && c.address.en) || '';
    $('s-region-zh').value = (c.region && c.region.zh) || '';
    $('s-region-en').value = (c.region && c.region.en) || '';
    $('s-biz-email').value = c.businessEmail || '';
    $('s-hr-email').value = c.careersEmail || '';
    $('s-biz-note-zh').value = (c.businessNote && c.businessNote.zh) || '';
    $('s-biz-note-en').value = (c.businessNote && c.businessNote.en) || '';
    $('s-hr-note-zh').value = (c.careersNote && c.careersNote.zh) || '';
    $('s-hr-note-en').value = (c.careersNote && c.careersNote.en) || '';
    $('s-intro-zh').value = (c.intro && c.intro.zh) || '';
    $('s-intro-en').value = (c.intro && c.intro.en) || '';
  }

  function saveSite() {
    var btn = $('save-site');
    var status = $('site-status');
    var c = siteFile.data.contact || {};
    c.address = { zh: $('s-address-zh').value.trim(), en: $('s-address-en').value.trim() };
    c.region = { zh: $('s-region-zh').value.trim(), en: $('s-region-en').value.trim() };
    c.businessEmail = $('s-biz-email').value.trim();
    c.careersEmail = $('s-hr-email').value.trim();
    c.businessNote = { zh: $('s-biz-note-zh').value.trim(), en: $('s-biz-note-en').value.trim() };
    c.careersNote = { zh: $('s-hr-note-zh').value.trim(), en: $('s-hr-note-en').value.trim() };
    c.intro = { zh: $('s-intro-zh').value.trim(), en: $('s-intro-en').value.trim() };
    siteFile.data.contact = c;
    btn.disabled = true;
    setStatus(status, '正在保存…');
    saveFile('content/site.json', siteFile, '更新联系方式').then(function () {
      setStatus(status, '已保存。约 30 秒后刷新网站即可看到更新。', 'ok');
    }).catch(function (err) {
      setStatus(status, '保存失败：' + err.message, 'err');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function afterLogin() {
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    renderNewsList();
    fillSite();
    show('news-list-view');
  }

  $('login-btn').addEventListener('click', function () {
    token = $('token').value.trim();
    if (!token) {
      setStatus($('login-status'), '请粘贴 Token。', 'err');
      return;
    }
    setStatus($('login-status'), '正在验证…');
    Promise.all([
      loadFile('content/news.json', newsFile),
      loadFile('content/site.json', siteFile)
    ]).then(afterLogin).catch(function (err) {
      token = '';
      setStatus($('login-status'), '登录失败：' + err.message, 'err');
    });
  });

  $('logout-btn').addEventListener('click', function () {
    token = '';
    $('token').value = '';
    $('app-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    setStatus($('login-status'), '已退出。');
  });

  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      if (btn.getAttribute('data-tab') === 'news') {
        renderNewsList();
        show('news-list-view');
      } else {
        fillSite();
        show('site-view');
      }
    });
  });

  $('new-news').addEventListener('click', function () { openNewsForm(null); });
  $('cancel-news').addEventListener('click', function () { show('news-list-view'); });
  $('save-news').addEventListener('click', saveNews);
  $('save-site').addEventListener('click', saveSite);
})();
