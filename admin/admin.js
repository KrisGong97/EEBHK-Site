(function () {
  var REPO = 'KrisGong97/EEBHK-Site';
  var BRANCH = 'main';
  var API = 'https://api.github.com';

  var token = '';
  var newsFile = { sha: '', data: { note: { zh: '', en: '' }, items: [] } };
  var siteFile = { sha: '', data: { contact: {} } };
  var honorsFile = { sha: '', data: { items: [] } };
  var editingId = null;
  var editingHonorId = null;

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

  function uploadImage(file, folder) {
    var safe = String(file.name || 'image.jpg').replace(/[^A-Za-z0-9._-]/g, '_');
    var dest = (folder || 'uploads/news/') + Date.now() + '-' + safe;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var b64 = String(reader.result).split(',')[1];
        api('/repos/' + REPO + '/contents/' + dest, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
          body: JSON.stringify({
            message: '上传图片 ' + safe,
            content: b64,
            branch: BRANCH
          })
        }).then(function () { resolve(dest); }).catch(reject);
      };
      reader.readAsDataURL(file);
    });
  }

  function show(id) {
    ['news-list-view', 'news-form-view', 'honor-list-view', 'honor-form-view', 'site-view'].forEach(function (name) {
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

  var draftBlocks = [];
  var uploadBlockIndex = -1;

  function emptyNews() {
    return {
      id: '',
      date: new Date().toISOString().slice(0, 10),
      title: { zh: '', en: '' },
      summary: { zh: '', en: '' },
      body: { zh: '', en: '' },
      blocks: [{ type: 'text', zh: '', en: '' }],
      image: '',
      images: [],
      video: '',
      editor: '',
      reviewer: '',
      source: ''
    };
  }

  function itemToBlocks(item) {
    if (item.blocks && item.blocks.length) {
      return item.blocks.map(function (b) {
        if (b.type === 'image') {
          return { type: 'image', src: b.src || '', caption: { zh: (b.caption && b.caption.zh) || '', en: (b.caption && b.caption.en) || '' } };
        }
        return { type: 'text', zh: b.zh || '', en: b.en || '' };
      });
    }
    var blocks = [];
    if (item.body && (item.body.zh || item.body.en)) {
      blocks.push({ type: 'text', zh: item.body.zh || '', en: item.body.en || '' });
    }
    var seen = {};
    function addImage(src) {
      if (!src || seen[src] || /\.gif(\?|$)/i.test(src)) return;
      seen[src] = true;
      blocks.push({ type: 'image', src: src, caption: { zh: '', en: '' } });
    }
    addImage(item.image);
    (item.images || []).forEach(addImage);
    if (!blocks.length) blocks.push({ type: 'text', zh: '', en: '' });
    return blocks;
  }

  function syncBlocksFromDom() {
    var next = [];
    Array.prototype.forEach.call($('blocks').children, function (el, i) {
      var block = draftBlocks[i] || { type: 'text', zh: '', en: '' };
      if (block.type === 'image') {
        var src = (el.querySelector('[data-f="src"]') || {}).value || '';
        next.push({
          type: 'image',
          src: src.trim(),
          caption: {
            zh: ((el.querySelector('[data-f="cap-zh"]') || {}).value || '').trim(),
            en: ((el.querySelector('[data-f="cap-en"]') || {}).value || '').trim()
          }
        });
      } else {
        next.push({
          type: 'text',
          zh: ((el.querySelector('[data-f="zh"]') || {}).value || '').replace(/\r\n/g, '\n'),
          en: ((el.querySelector('[data-f="en"]') || {}).value || '').replace(/\r\n/g, '\n')
        });
      }
    });
    draftBlocks = next;
    return draftBlocks;
  }

  function renderBlocks() {
    var box = $('blocks');
    box.innerHTML = '';
    draftBlocks.forEach(function (block, i) {
      var el = document.createElement('div');
      el.className = 'block';
      el.setAttribute('data-index', String(i));
      var head = document.createElement('div');
      head.className = 'block-head';
      var title = document.createElement('strong');
      title.textContent = block.type === 'image' ? ('图片 ' + (i + 1)) : ('文字 ' + (i + 1));
      var actions = document.createElement('div');
      actions.className = 'row';
      [
        ['up', '上移'],
        ['down', '下移'],
        ['remove', '删除']
      ].forEach(function (pair) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = pair[0] === 'remove' ? 'btn btn-danger' : 'btn btn-ghost';
        b.setAttribute('data-act', pair[0]);
        b.textContent = pair[1];
        actions.appendChild(b);
      });
      head.appendChild(title);
      head.appendChild(actions);
      el.appendChild(head);

      if (block.type === 'image') {
        var img = null;
        if (block.src) {
          img = document.createElement('img');
          img.className = 'block-preview';
          img.alt = '';
          img.src = /^https?:\/\//i.test(block.src) ? block.src : '../' + block.src.replace(/^\//, '');
        }
        var pathLabel = document.createElement('label');
        pathLabel.textContent = '图片路径或外链';
        var path = document.createElement('input');
        path.type = 'text';
        path.setAttribute('data-f', 'src');
        path.value = block.src || '';
        path.placeholder = 'uploads/news/xxx.jpg';
        var pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'btn btn-ghost';
        pick.setAttribute('data-act', 'upload');
        pick.textContent = '上传图片';
        var capZh = document.createElement('textarea');
        capZh.setAttribute('data-f', 'cap-zh');
        capZh.placeholder = '图片说明（繁中，可留空）';
        capZh.value = (block.caption && block.caption.zh) || '';
        var capEn = document.createElement('textarea');
        capEn.setAttribute('data-f', 'cap-en');
        capEn.placeholder = 'Caption (EN, optional)';
        capEn.value = (block.caption && block.caption.en) || '';
        if (img) el.appendChild(img);
        el.appendChild(pathLabel);
        el.appendChild(path);
        var row = document.createElement('div');
        row.className = 'row';
        row.appendChild(pick);
        el.appendChild(row);
        el.appendChild(capZh);
        el.appendChild(capEn);
      } else {
        var zh = document.createElement('textarea');
        zh.setAttribute('data-f', 'zh');
        zh.placeholder = '繁体中文（空一行分段）';
        zh.value = block.zh || '';
        var en = document.createElement('textarea');
        en.setAttribute('data-f', 'en');
        en.placeholder = 'English (blank line = new paragraph)';
        en.value = block.en || '';
        el.appendChild(zh);
        el.appendChild(en);
      }
      box.appendChild(el);
    });
  }

  function openNewsForm(id) {
    var item = id
      ? (newsFile.data.items || []).filter(function (x) { return x.id === id; })[0]
      : emptyNews();
    if (!item) item = emptyNews();
    editingId = id || null;
    draftBlocks = itemToBlocks(item);
    $('news-form-title').textContent = id ? '编辑新闻' : '新建新闻';
    $('f-id').value = item.id || '';
    $('f-id').disabled = !!id;
    $('f-date').value = item.date || '';
    $('f-title-zh').value = (item.title && item.title.zh) || '';
    $('f-title-en').value = (item.title && item.title.en) || '';
    $('f-summary-zh').value = (item.summary && item.summary.zh) || '';
    $('f-summary-en').value = (item.summary && item.summary.en) || '';
    $('f-video').value = item.video || '';
    $('f-editor').value = item.editor || '';
    $('f-reviewer').value = item.reviewer || '';
    $('f-source').value = item.source || '';
    renderBlocks();
    setStatus($('news-status'), '');
    show('news-form-view');
  }

  function collectNews() {
    var blocks = syncBlocksFromDom().filter(function (b) {
      if (b.type === 'image') return b.src && !/\.gif(\?|$)/i.test(b.src);
      return !!(b.zh.trim() || b.en.trim());
    });
    var texts = blocks.filter(function (b) { return b.type === 'text'; });
    var images = blocks.filter(function (b) { return b.type === 'image'; }).map(function (b) { return b.src; });
    var date = $('f-date').value.trim();
    var id = $('f-id').value.trim() || (date + '-' + slugify($('f-title-en').value || $('f-title-zh').value));
    return {
      id: id,
      date: date,
      title: { zh: $('f-title-zh').value.trim(), en: $('f-title-en').value.trim() },
      summary: { zh: $('f-summary-zh').value.trim(), en: $('f-summary-en').value.trim() },
      body: {
        zh: texts.map(function (b) { return b.zh.trim(); }).filter(Boolean).join('\n\n'),
        en: texts.map(function (b) { return b.en.trim(); }).filter(Boolean).join('\n\n')
      },
      blocks: blocks,
      image: images[0] || '',
      images: images,
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
    if (!item.blocks.length) {
      setStatus(status, '请至少加入一段文字或一张图片。', 'err');
      return;
    }
    btn.disabled = true;
    setStatus(status, '正在保存…');

    if (!newsFile.data.items) newsFile.data.items = [];
    var items = newsFile.data.items;
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === item.id || (editingId && items[i].id === editingId)) {
        idx = i;
        break;
      }
    }
    var isUpdate = idx >= 0;
    if (isUpdate) items[idx] = item;
    else items.unshift(item);
    editingId = item.id;
    $('f-id').value = item.id;
    $('f-id').disabled = true;

    saveFile('content/news.json', newsFile, isUpdate ? '更新新闻：' + item.id : '新增新闻：' + item.id).then(function () {
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

  function renderHonorList() {
    var box = $('honor-list');
    box.innerHTML = '';
    var items = (honorsFile.data.items || []).slice().sort(function (a, b) {
      return String(b.year || '').localeCompare(String(a.year || ''));
    });
    if (!items.length) {
      box.textContent = '还没有资质或荣誉。点击上方按钮新增。';
      return;
    }
    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'news-row';
      var left = document.createElement('div');
      var title = document.createElement('div');
      title.textContent = (item.name && item.name.zh) || item.id;
      var meta = document.createElement('small');
      var kindLabel = item.kind === 'qualification' ? '资质' : '荣誉';
      meta.textContent = (item.year || '') + '  ·  ' + kindLabel + '  ·  ' + item.id;
      left.appendChild(title);
      left.appendChild(meta);
      var actions = document.createElement('div');
      actions.className = 'row';
      var edit = document.createElement('button');
      edit.className = 'btn btn-ghost';
      edit.type = 'button';
      edit.textContent = '编辑';
      edit.addEventListener('click', function () { openHonorForm(item.id); });
      var del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.type = 'button';
      del.textContent = '删除';
      del.addEventListener('click', function () { deleteHonor(item.id); });
      actions.appendChild(edit);
      actions.appendChild(del);
      row.appendChild(left);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function openHonorForm(id) {
    var item = id
      ? (honorsFile.data.items || []).filter(function (x) { return x.id === id; })[0]
      : {
        id: '',
        year: String(new Date().getFullYear()),
        kind: 'honor',
        name: { zh: '', en: '' },
        issuer: { zh: '', en: '' },
        note: { zh: '', en: '' },
        image: ''
      };
    if (!item) item = { id: '', year: '', kind: 'honor', name: { zh: '', en: '' }, issuer: { zh: '', en: '' }, note: { zh: '', en: '' }, image: '' };
    editingHonorId = id || null;
    $('honor-form-title').textContent = id ? '编辑资质 / 荣誉' : '新增资质 / 荣誉';
    $('h-id').value = item.id || '';
    $('h-id').disabled = !!id;
    $('h-kind').value = item.kind === 'qualification' ? 'qualification' : 'honor';
    $('h-year').value = item.year || '';
    $('h-name-zh').value = (item.name && item.name.zh) || '';
    $('h-name-en').value = (item.name && item.name.en) || '';
    $('h-issuer-zh').value = (item.issuer && item.issuer.zh) || '';
    $('h-issuer-en').value = (item.issuer && item.issuer.en) || '';
    $('h-note-zh').value = (item.note && item.note.zh) || '';
    $('h-note-en').value = (item.note && item.note.en) || '';
    $('h-image').value = item.image || '';
    $('h-image-file').value = '';
    setStatus($('honor-status'), '');
    show('honor-form-view');
  }

  function collectHonor() {
    var year = $('h-year').value.trim();
    var nameZh = $('h-name-zh').value.trim();
    var id = $('h-id').value.trim() || ((year || 'item') + '-' + slugify($('h-name-en').value || nameZh));
    return {
      id: id,
      year: year,
      kind: $('h-kind').value,
      name: { zh: nameZh, en: $('h-name-en').value.trim() },
      issuer: { zh: $('h-issuer-zh').value.trim(), en: $('h-issuer-en').value.trim() },
      note: { zh: $('h-note-zh').value.trim(), en: $('h-note-en').value.trim() },
      image: $('h-image').value.trim()
    };
  }

  function saveHonor() {
    var btn = $('save-honor');
    var status = $('honor-status');
    var item = collectHonor();
    if (!item.name.zh) {
      setStatus(status, '请至少填写繁中名称。', 'err');
      return;
    }
    var file = $('h-image-file').files[0];
    if (file && (/\.gif$/i.test(file.name) || file.type === 'image/gif')) {
      setStatus(status, '不采用动图，请上传 jpg / png / webp。', 'err');
      return;
    }
    btn.disabled = true;
    setStatus(status, '正在保存…');
    var upload = file ? uploadImage(file, 'uploads/honors/') : Promise.resolve(item.image);
    upload.then(function (imagePath) {
      item.image = imagePath || item.image;
      if (!honorsFile.data.items) honorsFile.data.items = [];
      var items = honorsFile.data.items;
      var idx = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === item.id || (editingHonorId && items[i].id === editingHonorId)) {
          idx = i;
          break;
        }
      }
      var isUpdate = idx >= 0;
      if (isUpdate) items[idx] = item;
      else items.unshift(item);
      editingHonorId = item.id;
      $('h-id').value = item.id;
      $('h-id').disabled = true;
      return saveFile('content/honors.json', honorsFile, isUpdate ? '更新资质荣誉：' + item.id : '新增资质荣誉：' + item.id);
    }).then(function () {
      setStatus(status, '已保存。约 30 秒后刷新「关于我们」即可看到。', 'ok');
      renderHonorList();
    }).catch(function (err) {
      setStatus(status, '保存失败：' + err.message, 'err');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function deleteHonor(id) {
    if (!confirm('确定删除这条资质 / 荣誉？删除后会立即写入仓库。')) return;
    honorsFile.data.items = (honorsFile.data.items || []).filter(function (x) { return x.id !== id; });
    saveFile('content/honors.json', honorsFile, '删除资质荣誉：' + id).then(function () {
      renderHonorList();
    }).catch(function (err) {
      alert('删除失败：' + err.message);
    });
  }

  function afterLogin() {
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    renderNewsList();
    renderHonorList();
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
      loadFile('content/site.json', siteFile),
      loadFile('content/honors.json', honorsFile)
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
      var tab = btn.getAttribute('data-tab');
      if (tab === 'news') {
        renderNewsList();
        show('news-list-view');
      } else if (tab === 'honors') {
        renderHonorList();
        show('honor-list-view');
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
  $('new-honor').addEventListener('click', function () { openHonorForm(null); });
  $('cancel-honor').addEventListener('click', function () { show('honor-list-view'); });
  $('save-honor').addEventListener('click', saveHonor);

  $('add-text-block').addEventListener('click', function () {
    syncBlocksFromDom();
    draftBlocks.push({ type: 'text', zh: '', en: '' });
    renderBlocks();
  });

  $('add-image-block').addEventListener('click', function () {
    syncBlocksFromDom();
    draftBlocks.push({ type: 'image', src: '', caption: { zh: '', en: '' } });
    renderBlocks();
  });

  $('blocks').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var blockEl = btn.closest('.block');
    if (!blockEl) return;
    var i = parseInt(blockEl.getAttribute('data-index'), 10);
    syncBlocksFromDom();
    var act = btn.getAttribute('data-act');
    if (act === 'up' && i > 0) {
      var up = draftBlocks[i - 1];
      draftBlocks[i - 1] = draftBlocks[i];
      draftBlocks[i] = up;
    } else if (act === 'down' && i < draftBlocks.length - 1) {
      var down = draftBlocks[i + 1];
      draftBlocks[i + 1] = draftBlocks[i];
      draftBlocks[i] = down;
    } else if (act === 'remove') {
      if (draftBlocks.length === 1) {
        setStatus($('news-status'), '至少保留一块内容。', 'err');
        return;
      }
      draftBlocks.splice(i, 1);
    } else if (act === 'upload') {
      uploadBlockIndex = i;
      $('block-file').value = '';
      $('block-file').click();
      return;
    }
    renderBlocks();
  });

  $('block-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var i = uploadBlockIndex;
    if (!file || i < 0) return;
    if (/\.gif$/i.test(file.name) || file.type === 'image/gif') {
      setStatus($('news-status'), '不采用动图，请上传 jpg / png / webp。', 'err');
      return;
    }
    setStatus($('news-status'), '正在上传图片…');
    uploadImage(file).then(function (dest) {
      syncBlocksFromDom();
      if (draftBlocks[i] && draftBlocks[i].type === 'image') draftBlocks[i].src = dest;
      renderBlocks();
      setStatus($('news-status'), '图片已上传，保存新闻后才会发布到网站。', 'ok');
    }).catch(function (err) {
      setStatus($('news-status'), '图片上传失败：' + err.message, 'err');
    });
  });
})();
