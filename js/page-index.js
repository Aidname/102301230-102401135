/*!
 * page-index.js —— 首页控制器
 *
 * 首页要回答的问题只有一个：**"我的东西是不是在这儿？"**
 * 所以这里做的三件事都围绕"尽快让人筛到目标"：
 *   ① 类型 / 分类 / 地点 / 状态四个维度自由组合；
 *   ② 每个选项右侧实时显示条数（分面统计），选之前就知道有没有结果；
 *   ③ 选中分类时给出一条搜索引导——因为"0 条结果"和"没人捡到"在页面上长得一样，
 *      用户搜不到会以为自己东西没被捡到，而不是"我搜错了"。
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'index' });

  var PAGE_SIZE = 8;
  var state = { type: 'all', category: 'all', location: 'all', status: 'all', sort: 'newest', page: 1 };

  var el = {
    side: document.getElementById('side'),
    filterToggle: document.getElementById('filterToggle'),
    catStrip: document.getElementById('catStrip'),
    locChips: document.getElementById('locChips'),
    statusChips: document.getElementById('statusChips'),
    hotChips: document.getElementById('hotChips'),
    typeTabs: document.getElementById('typeTabs'),
    resultCount: document.getElementById('resultCount'),
    sortSelect: document.getElementById('sortSelect'),
    resetBtn: document.getElementById('resetBtn'),
    hintBox: document.getElementById('hintBox'),
    listHost: document.getElementById('listHost'),
    loadMore: document.getElementById('loadMore')
  };

  function queryOpts() {
    return {
      type: state.type, category: state.category,
      location: state.location, status: state.status, sort: state.sort
    };
  }

  function chip(label, active, attrs, count) {
    return '<button type="button" class="chip' + (active ? ' active' : '') + '" ' + attrs + '>'
      + esc(label)
      + (typeof count === 'number' ? '<span class="chip-count">' + count + '</span>' : '')
      + '</button>';
  }

  /* ---------- 类型切换（全部 / 寻物 / 招领） ---------- */

  function renderTypeTabs(facets) {
    var total = store.countPosts({});
    var counts = facets.type || {};
    var items = [{ key: 'all', label: '全部', n: total }]
      .concat(LF.TYPES.map(function (t) { return { key: t.key, label: t.fullName, n: counts[t.key] || 0 }; }));

    el.typeTabs.innerHTML = items.map(function (it) {
      return '<button type="button" class="' + (state.type === it.key ? 'active' : '') + '" data-type="' + it.key + '">'
        + esc(it.label) + '<span class="count"> ' + it.n + '</span></button>';
    }).join('');
  }

  /* ---------- 分类（图标条） ---------- */

  function renderCategories(facets) {
    var counts = facets.category || {};
    var html = '<button type="button" class="cat-tile' + (state.category === 'all' ? ' active' : '') + '" data-cat="all">'
      + '<div class="ct-icon">🗂</div><div class="ct-name">全部</div>'
      + '<div class="ct-count">' + store.countPosts(withOut('category')) + '</div></button>';

    html += LF.CATEGORIES.map(function (c) {
      var n = counts[c.key] || 0;
      return '<button type="button" class="cat-tile' + (state.category === c.key ? ' active' : '') + '" data-cat="' + c.key + '">'
        + '<div class="ct-icon">' + c.icon + '</div>'
        + '<div class="ct-name">' + esc(c.name) + '</div>'
        + '<div class="ct-count">' + n + '</div></button>';
    }).join('');

    el.catStrip.innerHTML = html;
  }

  /** 统计某一个维度时忽略该维度自身的筛选，否则选中"图书馆"后其他地点条数全变 0，
   *  用户就没法从"图书馆"直接切到"食堂"了。 */
  function withOut(dim) {
    var o = queryOpts();
    if (dim === 'category') o.category = 'all';
    if (dim === 'location') o.location = 'all';
    if (dim === 'status') o.status = 'all';
    return o;
  }

  /* ---------- 地点 ---------- */

  function renderLocations(facets) {
    var counts = facets.location || {};
    var html = chip('全部', state.location === 'all', 'data-loc="all"',
      store.countPosts(withOut('location')));
    html += LF.LOCATIONS.map(function (loc) {
      return chip(loc, state.location === loc, 'data-loc="' + esc(loc) + '"', counts[loc] || 0);
    }).join('');
    el.locChips.innerHTML = html;
  }

  /* ---------- 状态 ---------- */

  function renderStatus(facets) {
    var counts = facets.status || {};
    var items = [
      { key: 'all', label: '全部', n: store.countPosts(withOut('status')) },
      { key: LF.STATUSES.ACTIVE, label: '进行中', n: counts[LF.STATUSES.ACTIVE] || 0 },
      { key: LF.STATUSES.DONE, label: '已完成', n: counts[LF.STATUSES.DONE] || 0 }
    ];
    el.statusChips.innerHTML = items.map(function (it) {
      return chip(it.label, state.status === it.key, 'data-status="' + it.key + '"', it.n);
    }).join('');
  }

  /* ---------- 热门搜索 ---------- */

  function renderHot() {
    var words = store.getHotKeywords(8);
    el.hotChips.innerHTML = words.length
      ? words.map(function (w) {
        return '<a class="chip" href="search.html?kw=' + encodeURIComponent(w) + '">🔎 ' + esc(w) + '</a>';
      }).join('')
      : '<span class="hint">暂无统计数据</span>';
  }

  /* ---------- 搜索引导 ---------- */

  function renderHint() {
    if (state.category === 'all') { el.hintBox.innerHTML = ''; return; }
    var hint = LF.searchHintFor(state.category);
    if (!hint) { el.hintBox.innerHTML = ''; return; }
    var cat = LF.categoryOf(state.category);
    var extra = LF.allowVerifyFor(state.category) === false
      ? '<div class="note note-warn" style="margin-top:8px">这一类不出认领验证题：描述与联系方式直接公开，'
        + '看到的人可以直接联系发布者核对。</div>'
      : '<div class="note" style="margin-top:8px">这一类带 🔒 的招领信息需要答对发布者出的客观题，'
        + '才能看到联系方式（最多答 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次，答满未通过可以申诉）。</div>';
    el.hintBox.innerHTML = '<div class="banner banner-info">'
      + '<b>' + esc(cat.icon + ' ' + cat.name) + '</b>：' + esc(hint) + '</div>' + extra;
  }

  /* ---------- 列表 ---------- */

  function renderList(facets) {
    var o = queryOpts();
    var total = store.countPosts(o);
    var posts = store.queryPosts(Object.assign({}, o, { limit: state.page * PAGE_SIZE }));
    var hasMore = total > posts.length;

    el.resultCount.textContent = total ? ('共 ' + total + ' 条，已显示 ' + posts.length + ' 条') : '';

    if (!posts.length) {
      var noFilter = state.type === 'all' && state.category === 'all'
        && state.location === 'all' && state.status === 'all';
      el.listHost.innerHTML = UI.emptyHtml(noFilter
        ? { icon: '📭', title: '现在还没有任何信息', text: '点下面的按钮发布第一条，或者先载入一批演示数据到「我的」页。',
            actions: '<div class="empty-actions"><a class="btn btn-primary" href="publish.html">＋ 发布信息</a></div>' }
        : { icon: '🔍', title: '当前筛选下没有匹配的信息', text: '换个分类或地点看看，也可以清空筛选条件。',
            actions: '<div class="empty-actions"><button class="btn" id="emptyReset" type="button">清空全部筛选</button>'
              + '<a class="btn btn-primary" href="publish.html">＋ 发布信息</a></div>' });
      var btn = document.getElementById('emptyReset');
      if (btn) btn.addEventListener('click', resetFilters);
      el.loadMore.hidden = true;
      return;
    }

    el.listHost.innerHTML = UI.listHtml(posts, { from: 'index' });
    if (hasMore) {
      el.loadMore.hidden = false;
      el.loadMore.textContent = '加载更多（还有 ' + (total - posts.length) + ' 条）';
    } else {
      el.loadMore.hidden = true;
    }
  }

  function renderAll() {
    var facets = store.facets(queryOpts());
    renderTypeTabs(facets);
    renderCategories(facets);
    renderLocations(facets);
    renderStatus(facets);
    renderHint();
    renderList(facets);
  }

  function resetFilters() {
    state = { type: 'all', category: 'all', location: 'all', status: 'all', sort: state.sort, page: 1 };
    el.sortSelect.value = state.sort;
    renderAll();
  }

  /* ---------- 事件 ---------- */

  // 筛选区用事件委托：选项是重新渲染出来的，逐个绑事件会在每次重绘后失效
  el.side.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-cat],[data-loc],[data-status]') : null;
    if (!t) return;
    if (t.hasAttribute('data-cat')) state.category = t.getAttribute('data-cat');
    if (t.hasAttribute('data-loc')) state.location = t.getAttribute('data-loc');
    if (t.hasAttribute('data-status')) state.status = t.getAttribute('data-status');
    state.page = 1;
    renderAll();
  });

  el.typeTabs.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-type]') : null;
    if (!t) return;
    state.type = t.getAttribute('data-type');
    state.page = 1;
    renderAll();
  });

  el.filterToggle.addEventListener('click', function () {
    var on = el.side.classList.toggle('expanded');
    el.filterToggle.classList.toggle('on', on);
  });

  el.sortSelect.addEventListener('change', function () {
    state.sort = el.sortSelect.value;
    state.page = 1;
    renderAll();
  });

  el.resetBtn.addEventListener('click', resetFilters);

  el.loadMore.addEventListener('click', function () {
    state.page += 1;
    renderAll();
  });

  renderAll();
})();
