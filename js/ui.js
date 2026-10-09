/*!
 * ui.js —— 公共界面层
 *
 * 放跨页面复用的东西：导航外壳、卡片渲染、轻提示、确认弹窗、一键复制。
 * 每个页面只做三件事——调 store 拿数据、用这里的函数渲染、给按钮绑事件。
 *
 * 有一条纪律：**所有用户输入在拼进 innerHTML 之前都必须过 esc()**。
 * 卡片是一种渲染入口，详情页是第二种，悬浮预览、搜索历史、申诉明细也都是。
 * 漏掉任何一个，XSS 就会从那个入口进来。
 */
(function (global) {
  'use strict';

  var LF = global.LF;
  if (!LF && typeof require === 'function') {
    require('./config.js');
    require('./utils.js');
    require('./store.js');
    require('./seed.js');
    LF = global.LF;
  }
  if (!LF) throw new Error('ui.js 需要先加载 config.js / utils.js / store.js / seed.js');

  var esc = LF.escapeHtml;

  /* ============================================================
   * 一、URL 与跳转
   * ============================================================ */

  function param(name) {
    var search = (global.location && global.location.search) || '';
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(search);
    if (!m) return '';
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
  }

  function go(url) { global.location.href = url; }

  function detailUrl(id, from) {
    return 'detail.html?id=' + encodeURIComponent(id) + (from ? '&from=' + encodeURIComponent(from) : '');
  }

  /* ============================================================
   * 二、导航外壳
   * ============================================================ */

  var NAV_ITEMS = [
    { key: 'index', href: 'index.html', label: '首页', icon: '🏠' },
    { key: 'search', href: 'search.html', label: '搜索', icon: '🔍' },
    { key: 'publish', href: 'publish.html', label: '发布', icon: '＋' },
    { key: 'mine', href: 'mine.html', label: '我的', icon: '👤' }
  ];

  function renderNav(active) {
    var host = document.getElementById('app-nav');
    if (!host) return;

    var tabs = NAV_ITEMS.map(function (item) {
      var cls = item.key === active ? 'tab active' : 'tab';
      var icon = item.key === 'publish' ? '<span class="tab-plus">＋</span>' : '<span class="tab-icon">' + item.icon + '</span>';
      return '<a class="' + cls + '" href="' + item.href + '">' + icon + '<span class="tab-label">' + item.label + '</span></a>';
    }).join('');

    host.innerHTML =
      '<header class="topbar">' +
        '<a class="brand" href="index.html">' +
          '<span class="brand-mark">拾</span>' +
          '<span class="brand-text"><b>校园失物招领</b><i>发布 · 搜索 · 认领 · 归还</i></span>' +
        '</a>' +
        '<nav class="topnav">' +
          '<a href="index.html"' + (active === 'index' ? ' class="on"' : '') + '>浏览信息</a>' +
          '<a href="search.html"' + (active === 'search' ? ' class="on"' : '') + '>搜索</a>' +
          '<a href="mine.html"' + (active === 'mine' ? ' class="on"' : '') + '>我的发布</a>' +
          '<a class="btn-primary" href="publish.html">＋ 发布信息</a>' +
        '</nav>' +
      '</header>' +
      '<nav class="tabbar">' + tabs + '</nav>';

    renderStorageBanner();
  }

  /* ============================================================
   * 三、存储降级提示
   * ------------------------------------------------------------
   * 降级的目标是"功能仍然可用"，但用户有权知道数据能存多久。
   * 所以顶部明确写出当前数据的保留范围，而不是让他在毫不知情的情况下丢数据。
   * ============================================================ */

  var STORAGE_TEXT = {
    local: '',
    session: '当前浏览器不允许长期保存数据，已临时改为「仅本标签页内有效」：关掉标签页后发布的内容会丢失。',
    memory: '当前浏览器既不允许 localStorage 也不允许 sessionStorage，数据只能暂存在内存里：刷新页面即丢失。'
  };

  function renderStorageBanner() {
    var kind = (global.LF && LF.__storeKind) || 'local';
    var text = STORAGE_TEXT[kind];
    if (!text) return;
    var host = document.getElementById('app-banner');
    if (!host) return;
    host.innerHTML = '<div class="banner banner-warn">⚠️ ' + esc(text) + '</div>';
  }

  /* ============================================================
   * 四、卡片与徽标
   * ============================================================ */

  function typeBadge(post) {
    var cls = post.type === 'lost' ? 'badge badge-lost' : 'badge badge-found';
    return '<span class="' + cls + '">' + esc(post.typeName) + '</span>';
  }

  function statusBadge(post) {
    var cls = post.status === LF.STATUSES.DONE ? 'status status-done' : 'status status-active';
    return '<span class="' + cls + '">' + esc(post.statusText) + '</span>';
  }

  function lockBadge(post) {
    if (post.lockState === 'locked') return '<span class="status status-lock">🔒 需验证</span>';
    if (post.lockState === 'unlocked') return '<span class="status status-open">🔓 已解锁</span>';
    return '';
  }

  function thumbHtml(post) {
    if (post.photo) {
      return '<div class="card-thumb"><img src="' + esc(post.photo) + '" alt="' + esc(post.title) + '"></div>';
    }
    return '<div class="card-thumb card-thumb-icon">' + esc(post.categoryIcon || '📦') + '</div>';
  }

  /** 一张卡片。列表页、搜索页、我的发布三处共用同一个渲染函数——
   *  "三处各写一遍"是样式和行为跑偏的常见起点。 */
  function cardHtml(post, opts) {
    opts = opts || {};
    var keyword = opts.keyword || '';
    var desc = LF.truncate(post.description || '（暂无补充描述）', 60);
    var actions = '';

    if (opts.showActions && post.isOwner) {
      actions =
        '<div class="card-actions" data-id="' + esc(post.id) + '">' +
          (post.status === LF.STATUSES.DONE
            ? '<button class="btn-mini" data-act="restore">恢复为进行中</button>'
            : '<button class="btn-mini btn-mini-ok" data-act="done">标记' + (post.type === 'lost' ? '已找到' : '已归还') + '</button>') +
          '<a class="btn-mini" href="publish.html?id=' + encodeURIComponent(post.id) + '">编辑</a>' +
          '<button class="btn-mini btn-mini-danger" data-act="remove">删除</button>' +
        '</div>';
    }

    return '' +
      '<article class="card' + (post.status === LF.STATUSES.DONE ? ' card-done' : '') + '" data-id="' + esc(post.id) + '">' +
        '<a class="card-link" href="' + esc(detailUrl(post.id, opts.from)) + '">' +
          thumbHtml(post) +
          '<div class="card-main">' +
            '<div class="card-head">' +
              typeBadge(post) +
              '<h3 class="card-title">' + (keyword ? LF.highlight(post.title, keyword) : esc(post.title)) + '</h3>' +
            '</div>' +
            '<p class="card-desc">' + (keyword ? LF.highlight(desc, keyword) : esc(desc)) + '</p>' +
            '<div class="card-meta">' +
              '<span>📍 ' + (keyword ? LF.highlight(post.location, keyword) : esc(post.location)) + '</span>' +
              '<span>🕒 ' + esc(post.timeAgoText) + '</span>' +
              '<span>' + esc(post.categoryIcon + ' ' + post.categoryName) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="card-side">' +
            statusBadge(post) +
            lockBadge(post) +
            (post.views ? '<span class="views">👁 ' + post.views + '</span>' : '') +
          '</div>' +
        '</a>' +
        actions +
      '</article>';
  }

  function listHtml(posts, opts) {
    opts = opts || {};
    if (!posts.length) return emptyHtml(opts.empty);
    return '<div class="card-list">' + posts.map(function (p) { return cardHtml(p, opts); }).join('') + '</div>';
  }

  /** 空状态要给"下一步"，不能只是干巴巴一行"暂无数据"——
   *  "0 条结果"和"没人捡到"在页面上长得一模一样，用户会直接放弃。 */
  function emptyHtml(cfg) {
    cfg = cfg || {};
    return '' +
      '<div class="empty">' +
        '<div class="empty-icon">' + esc(cfg.icon || '🗂') + '</div>' +
        '<h3>' + esc(cfg.title || '这里还没有信息') + '</h3>' +
        '<p>' + esc(cfg.text || '换个关键词，或者自己发布一条试试。') + '</p>' +
        (cfg.actions || '') +
      '</div>';
  }

  /* ============================================================
   * 五、轻提示 / 确认框
   * ============================================================ */

  function toast(message, type) {
    var host = document.getElementById('app-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'app-toast';
      document.body.appendChild(host);
    }
    var node = document.createElement('div');
    node.className = 'toast toast-' + (type || 'info');
    node.textContent = message;
    host.appendChild(node);
    setTimeout(function () { node.classList.add('toast-out'); }, 2200);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 2600);
  }

  /** 自己写一个确认弹窗，不用 window.confirm：
   *  原生 confirm 在移动端样式割裂，而且没法在文案里带上物品名称这类上下文。 */
  function confirmDialog(cfg) {
    return new Promise(function (resolve) {
      cfg = cfg || {};
      var mask = document.createElement('div');
      mask.className = 'mask';
      mask.innerHTML =
        '<div class="dialog">' +
          '<h3>' + esc(cfg.title || '确认操作') + '</h3>' +
          '<p>' + esc(cfg.text || '') + '</p>' +
          '<div class="dialog-actions">' +
            '<button class="btn" data-act="cancel">' + esc(cfg.cancelText || '取消') + '</button>' +
            '<button class="btn btn-primary" data-act="ok">' + esc(cfg.okText || '确定') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(mask);
      function close(val) {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        resolve(val);
      }
      mask.addEventListener('click', function (e) {
        var act = e.target && e.target.getAttribute ? e.target.getAttribute('data-act') : null;
        if (act === 'ok') close(true);
        else if (act === 'cancel' || e.target === mask) close(false);
      });
    });
  }

  /** 通用弹层（人工审核详情、手动复制框都用它） */
  function openModal(cfg) {
    cfg = cfg || {};
    var mask = document.createElement('div');
    mask.className = 'mask';
    mask.innerHTML = '<div class="dialog dialog-wide">' + (cfg.html || '') + '</div>';
    document.body.appendChild(mask);
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    mask.addEventListener('click', function (e) {
      if (e.target === mask || (e.target.getAttribute && e.target.getAttribute('data-act') === 'close')) close();
    });
    return { el: mask, close: close };
  }

  /* ============================================================
   * 六、一键复制
   * ------------------------------------------------------------
   * 复制失败时不是只弹一句错误就完了——会把原文弹进一个输入框里让用户手动复制，
   * 事情还办得成。file:// 下 navigator.clipboard 拿不到是常态，这条路必须走通。
   * ============================================================ */

  function copyWithFeedback(text, okMessage) {
    return LF.copyText(text).then(function (res) {
      if (res.ok) {
        toast(okMessage || '已复制到剪贴板', 'ok');
        return true;
      }
      var modal = openModal({
        html:
          '<h3>自动复制失败</h3>' +
          '<p>当前浏览器不允许脚本写入剪贴板（本地直接打开 HTML 时很常见）。下面是原文，请长按或 Ctrl+C 手动复制：</p>' +
          '<input class="manual-copy" readonly value="' + esc(text) + '">' +
          '<div class="dialog-actions"><button class="btn btn-primary" data-act="close">我知道了</button></div>'
      });
      var input = modal.el.querySelector('.manual-copy');
      if (input) { input.focus(); input.select(); }
      return false;
    });
  }

  /** 事件委托：给容器里所有 [data-copy] 元素绑上复制行为，内容是 data-copy 的值 */
  function bindCopy(container) {
    (container || document).addEventListener('click', function (e) {
      var target = e.target.closest ? e.target.closest('[data-copy]') : null;
      if (!target) return;
      e.preventDefault();
      copyWithFeedback(target.getAttribute('data-copy'), target.getAttribute('data-copy-msg') || '联系方式已复制');
    });
  }

  /* ============================================================
   * 七、页面启动
   * ============================================================ */

  var store = null;

  function boot(options) {
    options = options || {};
    store = LF.bootStore({ seed: options.seed });
    LF.__storeKind = store.kind;
    renderNav(options.active || '');
    bindCopy(document);
    return store;
  }

  function getStore() { return store; }

  /** 未发布内容的离开提醒：填了一半误关页面是真实会发生的，
   *  草稿走 store.saveDraft（400ms 防抖），这里只负责"回来时问一句"。 */
  function guardUnload(shouldGuard) {
    global.addEventListener('beforeunload', function (e) {
      if (!shouldGuard()) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
  }

  LF.UI = {
    esc: esc,
    param: param,
    go: go,
    detailUrl: detailUrl,
    NAV_ITEMS: NAV_ITEMS,
    renderNav: renderNav,
    typeBadge: typeBadge,
    statusBadge: statusBadge,
    lockBadge: lockBadge,
    cardHtml: cardHtml,
    listHtml: listHtml,
    emptyHtml: emptyHtml,
    toast: toast,
    confirm: confirmDialog,
    openModal: openModal,
    copyWithFeedback: copyWithFeedback,
    bindCopy: bindCopy,
    boot: boot,
    store: getStore,
    guardUnload: guardUnload
  };

  if (typeof module === 'object' && module.exports) module.exports = LF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
