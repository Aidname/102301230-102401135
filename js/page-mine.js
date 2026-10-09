/*!
 * page-mine.js —— 「我的」页控制器
 *
 * 这一页回答的是需求里那个被点名的问题：**"联系之后，这条信息怎么结束？"**
 * 由发布者在这里（或详情页）标记为已找到 / 已归还；标记后信息在列表中置灰沉底，
 * 详情页也不再展示联系入口，从机制上减少无效联系。
 *
 * 另外两块：
 *   · **人工审核**：认领人答满 3 次仍未通过时会转到这里，发布者看到对方写的
 *     "只有物主才知道的细节"和联系方式，自己判断是否交还；同意则生成线下交接编号。
 *   · **本地数据**：没有后端，所以把导出/导入/恢复演示数据/清空放在明面上，
 *     并如实写出当前存储的实际保留范围。
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'mine' });

  var el = {
    profileName: document.getElementById('profileName'),
    profileBody: document.getElementById('profileBody'),
    editProfileBtn: document.getElementById('editProfileBtn'),
    ownerId: document.getElementById('ownerId'),
    statGrid: document.getElementById('statGrid'),
    mineTabs: document.getElementById('mineTabs'),
    mineListHost: document.getElementById('mineListHost'),
    appealPanel: document.getElementById('appealPanel'),
    appealHint: document.getElementById('appealHint'),
    appealHost: document.getElementById('appealHost'),
    storageInfo: document.getElementById('storageInfo'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    seedBtn: document.getElementById('seedBtn'),
    clearBtn: document.getElementById('clearBtn')
  };

  var tab = 'all';

  /* ---------- 个人资料 ---------- */

  function renderProfile() {
    var p = store.getProfile();
    el.profileName.textContent = p.name || '未填写称呼';
    el.ownerId.textContent = store.ownerId();

    var rows = [
      ['称呼', p.name || '（未填写）'],
      ['常用联系方式', p.contact || '（未填写）'],
      ['学院', p.college || '（未填写）'],
      ['校区', p.campus || '（未填写）']
    ];
    el.profileBody.innerHTML = '<dl class="info-grid">' + rows.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('') + '</dl>';
  }

  function openProfileEditor() {
    var p = store.getProfile();
    var modal = UI.openModal({
      html:
        '<h3>编辑个人资料</h3>' +
        '<p>这里填的内容会在发布时自动带出，省得每次重填。</p>' +
        '<div class="field"><label for="pName">称呼</label>' +
          '<input class="input" id="pName" maxlength="30" value="' + esc(p.name) + '"></div>' +
        '<div class="field" style="margin-top:10px"><label for="pContact">常用联系方式</label>' +
          '<input class="input" id="pContact" maxlength="60" value="' + esc(p.contact) + '"></div>' +
        '<div class="field" style="margin-top:10px"><label for="pCollege">学院</label>' +
          '<input class="input" id="pCollege" maxlength="40" value="' + esc(p.college) + '"></div>' +
        '<div class="field" style="margin-top:10px"><label for="pCampus">校区</label>' +
          '<input class="input" id="pCampus" maxlength="40" value="' + esc(p.campus) + '"></div>' +
        '<div class="dialog-actions">' +
          '<button class="btn" data-act="close" type="button">取消</button>' +
          '<button class="btn btn-primary" data-act="save" type="button">保存</button>' +
        '</div>'
    });
    modal.el.addEventListener('click', function (e) {
      if (!e.target.getAttribute || e.target.getAttribute('data-act') !== 'save') return;
      store.saveProfile({
        name: modal.el.querySelector('#pName').value,
        contact: modal.el.querySelector('#pContact').value,
        college: modal.el.querySelector('#pCollege').value,
        campus: modal.el.querySelector('#pCampus').value
      });
      modal.close();
      renderProfile();
      UI.toast('资料已保存', 'ok');
    });
  }

  /* ---------- 统计 ---------- */

  function renderStats() {
    var s = store.getStats();
    var items = [
      { n: s.total, label: '共发布' },
      { n: s.active, label: '进行中' },
      { n: s.done, label: '已完成' },
      { n: s.views, label: '总浏览量' },
      { n: s.claims, label: '收到认领' },
      { n: s.pendingAppeals, label: '待处理申诉' }
    ];
    el.statGrid.innerHTML = items.map(function (it) {
      return '<div class="stat"><b>' + it.n + '</b><span>' + esc(it.label) + '</span></div>';
    }).join('');
  }

  /* ---------- 我的发布 ---------- */

  function renderTabs(posts) {
    var counts = { all: posts.length, active: 0, done: 0 };
    posts.forEach(function (p) {
      if (p.status === LF.STATUSES.DONE) counts.done++; else counts.active++;
    });
    var items = [
      { key: 'all', label: '全部', n: counts.all },
      { key: 'active', label: '进行中', n: counts.active },
      { key: 'done', label: '已完成', n: counts.done }
    ];
    el.mineTabs.innerHTML = items.map(function (it) {
      return '<button type="button" data-tab="' + it.key + '" class="' + (tab === it.key ? 'active' : '') + '">'
        + esc(it.label) + '<span class="count"> ' + it.n + '</span></button>';
    }).join('');
  }

  function renderMineList() {
    var posts = store.getMyPosts();
    renderTabs(posts);
    var filtered = tab === 'all' ? posts
      : posts.filter(function (p) { return tab === 'done' ? p.status === LF.STATUSES.DONE : p.status !== LF.STATUSES.DONE; });

    if (!filtered.length) {
      el.mineListHost.innerHTML = UI.emptyHtml(posts.length
        ? { icon: '🗂', title: '这个分类下还没有信息', text: '切回「全部」看看。' }
        : { icon: '📝', title: '你还没有发布过信息',
            text: '发布之后，这里可以标记已找到/已归还、处理别人的认领申诉。',
            actions: '<div class="empty-actions"><a class="btn btn-primary" href="publish.html">＋ 发布第一条</a></div>' });
      return;
    }
    el.mineListHost.innerHTML = UI.listHtml(filtered, { showActions: true, from: 'mine' });
  }

  el.mineTabs.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-tab]') : null;
    if (!btn) return;
    tab = btn.getAttribute('data-tab');
    renderMineList();
  });

  // 卡片上的操作按钮：标记完成 / 恢复 / 删除
  el.mineListHost.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    e.preventDefault();
    var wrap = btn.closest('.card-actions');
    var id = wrap.getAttribute('data-id');
    var act = btn.getAttribute('data-act');
    var post = store.getPost(id);
    if (!post) { UI.toast('这条信息不存在或已被删除', 'error'); return; }

    if (act === 'done') {
      UI.confirm({
        title: '标记为' + (post.type === 'lost' ? '已找到' : '已归还') + '？',
        text: '「' + post.title + '」会在列表中置灰并沉到后面，详情页不再显示联系入口。标错了可以再恢复。',
        okText: '确认标记'
      }).then(function (yes) {
        if (!yes) return;
        var res = store.markDone(id);
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        UI.toast('已标记为「' + res.post.statusText + '」', 'ok');
        renderAll();
      });
      return;
    }

    if (act === 'restore') {
      var res2 = store.restorePost(id);
      if (!res2.ok) { UI.toast(res2.message, 'error'); return; }
      UI.toast('已恢复为进行中', 'ok');
      renderAll();
      return;
    }

    if (act === 'remove') {
      UI.confirm({
        title: '删除这条信息？',
        text: '「' + post.title + '」删除后无法恢复，收到的认领记录与申诉会一起消失。',
        okText: '确认删除'
      }).then(function (yes) {
        if (!yes) return;
        var res3 = store.removePost(id);
        if (!res3.ok) { UI.toast(res3.message, 'error'); return; }
        UI.toast('已删除', 'ok');
        renderAll();
      });
    }
  });

  /* ---------- 人工审核 ---------- */

  function collectPendingAppeals() {
    var out = [];
    store.getMyPosts().forEach(function (p) {
      var res = store.listAppeals(p.id);
      if (!res.ok) return;
      res.appeals.forEach(function (a) {
        out.push({ post: p, appeal: a });
      });
    });
    out.sort(function (a, b) {
      if ((a.appeal.decision === 'pending') !== (b.appeal.decision === 'pending')) {
        return a.appeal.decision === 'pending' ? -1 : 1;
      }
      return b.appeal.createdAt - a.appeal.createdAt;
    });
    return out;
  }

  function renderAppeals() {
    var all = collectPendingAppeals();
    var pending = all.filter(function (x) { return x.appeal.decision === 'pending'; });

    el.appealHint.textContent = all.length
      ? ('共 ' + all.length + ' 条，待处理 ' + pending.length + ' 条')
      : '还没有人提交申诉';

    if (!all.length) {
      el.appealHost.innerHTML = '<p class="hint">当认领人答满 ' + LF.VERIFY.MAX_ATTEMPTS
        + ' 次仍未通过时，可以提交申诉。申诉内容（称呼、联系方式、物品细节）只有你能看到。</p>';
      return;
    }

    el.appealHost.innerHTML = all.map(function (row, i) {
      var a = row.appeal;
      var badge = a.decision === 'pending'
        ? '<span class="status status-lock">待处理</span>'
        : (a.decision === 'accepted'
          ? '<span class="status status-open">已同意交还</span>'
          : '<span class="status status-done">已驳回</span>');
      return '<div class="appeal-item' + (a.decision === 'pending' ? ' is-pending' : '') + '" data-i="' + i + '">' +
        '<div class="appeal-head">' +
          '<b>' + esc(row.post.typeIcon + ' ' + row.post.title) + '</b>' + badge +
        '</div>' +
        '<div class="appeal-detail">' +
          '称呼：' + esc(a.claimantName) + '\n' +
          '联系方式：' + esc(a.contact) + '\n' +
          '物主细节：' + esc(a.detail) +
          (a.note ? '\n我的批注：' + esc(a.note) : '') +
          (a.voucher ? '\n线下交接编号：' + esc(a.voucher) : '') +
        '</div>' +
        (a.decision === 'pending'
          ? '<div class="toolbar" style="margin:8px 0 0">' +
              '<button class="btn btn-sm btn-ok" data-appeal-act="accept" type="button">同意交还</button>' +
              '<button class="btn btn-sm btn-danger" data-appeal-act="reject" type="button">驳回</button>' +
              '<button class="btn btn-sm" data-appeal-act="copy" type="button" data-copy="' + esc(a.contact) + '">复制联系方式</button>' +
            '</div>'
          : '<div class="hint">处理于 ' + esc(LF.formatDateTime(a.decidedAt)) + '</div>') +
        '</div>';
    }).join('');
  }

  el.appealHost.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-appeal-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-appeal-act');
    if (act === 'copy') return;   // 交给 UI.bindCopy 处理

    var row = btn.closest('.appeal-item');
    var index = Number(row.getAttribute('data-i'));
    var all = collectPendingAppeals();
    var target = all[index];
    if (!target) return;

    if (act === 'accept') {
      UI.confirm({
        title: '同意交还？',
        text: '将解锁你对 ' + target.appeal.claimantName + ' 的联系方式展示，并生成一个线下交接编号。'
          + '请务必先确认对方写的细节与实物一致。',
        okText: '同意交还'
      }).then(function (yes) {
        if (!yes) return;
        var res = store.resolveAppeal(target.post.id, target.appeal.id, 'accepted', '', null);
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        UI.toast('已同意交还，交接编号 ' + res.appeal.voucher, 'ok');
        renderAll();
      });
      return;
    }

    // 驳回：让发布者写一句理由，这句话会回给申诉人
    var modal = UI.openModal({
      html: '<h3>驳回这条申诉</h3>' +
        '<p>写一句理由，申诉人在详情页会看到它——比一句"不符合"有用得多。</p>' +
        '<textarea class="textarea" id="rejectNote" maxlength="200" placeholder="例如：你描述的划痕位置和实物不一致"></textarea>' +
        '<div class="dialog-actions">' +
          '<button class="btn" data-act="close" type="button">取消</button>' +
          '<button class="btn btn-danger" data-act="ok" type="button">确认驳回</button>' +
        '</div>'
    });
    modal.el.addEventListener('click', function (ev) {
      if (!ev.target.getAttribute || ev.target.getAttribute('data-act') !== 'ok') return;
      var note = modal.el.querySelector('#rejectNote').value;
      var res = store.resolveAppeal(target.post.id, target.appeal.id, 'rejected', note, null);
      modal.close();
      if (!res.ok) { UI.toast(res.message, 'error'); return; }
      UI.toast('已驳回', 'ok');
      renderAll();
    });
  });

  /* ---------- 本地数据 ---------- */

  var KIND_TEXT = {
    local: '当前数据保存在浏览器 localStorage 里，关掉浏览器再打开还在。',
    session: '当前浏览器不允许 localStorage，已临时降级为 sessionStorage：关掉标签页数据就会丢。',
    memory: '当前浏览器既不允许 localStorage 也不允许 sessionStorage，数据只存在内存里，刷新即丢。',
    custom: '当前使用的是一个外部注入的存储实现。'
  };

  function renderStorage() {
    var state = store.debugState();
    var bytes = 0;
    try { bytes = JSON.stringify(state).length; } catch (e) { bytes = 0; }
    el.storageInfo.innerHTML = '<div class="note">' + esc(KIND_TEXT[store.kind] || KIND_TEXT.custom) + '<br>'
      + '当前共有 ' + state.posts.length + ' 条信息，占用约 ' + Math.round(bytes / 1024) + ' KB。'
      + '</div>';
  }

  el.exportBtn.addEventListener('click', function () {
    var json = store.exportData();
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '校园失物招领-导出-' + LF.today() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    UI.toast('已导出，文件在浏览器的下载目录里', 'ok');
  });

  el.importBtn.addEventListener('click', function () { el.importFile.click(); });

  el.importFile.addEventListener('change', function () {
    var file = el.importFile.files && el.importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { UI.toast('文件读取失败', 'error'); };
    reader.onload = function () {
      var res = store.importData(String(reader.result));
      el.importFile.value = '';
      if (!res.ok) { UI.toast(res.message, 'error'); return; }
      UI.toast(res.message, 'ok');
      renderAll();
    };
    reader.readAsText(file);
  });

  el.seedBtn.addEventListener('click', function () {
    UI.confirm({
      title: '恢复演示数据？',
      text: '这会清空当前全部信息，并重新灌入一批演示数据（其中 3 条归属于你本人）。此操作不可撤销。',
      okText: '恢复演示数据'
    }).then(function (yes) {
      if (!yes) return;
      var n = store.seedDemo();
      UI.toast('已恢复 ' + n + ' 条演示数据', 'ok');
      renderAll();
    });
  });

  el.clearBtn.addEventListener('click', function () {
    UI.confirm({
      title: '清空全部数据？',
      text: '所有信息、认领记录、申诉、搜索历史和草稿都会被删除，且无法恢复。建议先导出备份。',
      okText: '确认清空'
    }).then(function (yes) {
      if (!yes) return;
      store.clearAll();
      UI.toast('已清空', 'ok');
      renderAll();
    });
  });

  /* ---------- 启动 ---------- */

  function renderAll() {
    renderProfile();
    renderStats();
    renderMineList();
    renderAppeals();
    renderStorage();
  }

  el.editProfileBtn.addEventListener('click', openProfileEditor);
  renderAll();
})();
