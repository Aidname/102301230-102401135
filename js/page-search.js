/*!
 * page-search.js —— 搜索页控制器
 *
 * 三个细节是刻意做的：
 *  ① **边打边搜**（300ms 防抖），但只重绘结果列表，不重绘输入框——
 *     重建输入框会丢焦点，表现为"打一个字就跳出输入框"，这是最常见的搜索框 bug；
 *  ② 搜索历史**去重 + 可单条删除 + 可一键清空**，最多留 10 条；
 *  ③ 搜不到时给出"下一步"（清空关键词 / 去发布），
 *     因为"0 条结果"和"没人捡到"在页面上长得一模一样，用户很容易就此放弃。
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'search' });

  var state = { keyword: '', type: 'all' };
  var SUBMIT_DELAY = 300;

  var el = {
    form: document.getElementById('searchForm'),
    input: document.getElementById('searchInput'),
    typeTabs: document.getElementById('typeTabs'),
    discover: document.getElementById('discover'),
    results: document.getElementById('results'),
    resultCount: document.getElementById('resultCount'),
    resultHost: document.getElementById('resultHost'),
    hotChips: document.getElementById('hotChips'),
    historyChips: document.getElementById('historyChips'),
    clearHistory: document.getElementById('clearHistory'),
    clearKw: document.getElementById('clearKw')
  };

  /* ---------- 发现区（热门 + 历史） ---------- */

  function renderHot() {
    var words = store.getHotKeywords(10);
    el.hotChips.innerHTML = words.length
      ? words.map(function (w) {
        return '<button type="button" class="chip" data-kw="' + esc(w) + '">🔎 ' + esc(w) + '</button>';
      }).join('')
      : '<span class="hint">还没有数据可供统计，先发布一条试试。</span>';
  }

  function renderHistory() {
    var history = store.getSearchHistory();
    if (!history.length) {
      el.historyChips.innerHTML = '<span class="hint">还没有搜索记录。</span>';
      el.clearHistory.disabled = true;
      return;
    }
    el.clearHistory.disabled = false;
    el.historyChips.innerHTML = history.map(function (kw) {
      return '<span class="chip" data-kw="' + esc(kw) + '">' + esc(kw)
        + '<button type="button" class="opt-del" data-del="' + esc(kw) + '" title="删除这条记录">×</button></span>';
    }).join('');
  }

  /* ---------- 类型切换 ---------- */

  function renderTypeTabs() {
    var counts = store.facets({ keyword: state.keyword }).type || {};
    var total = store.countPosts({ keyword: state.keyword });
    var items = [{ key: 'all', label: '全部', n: total }]
      .concat(LF.TYPES.map(function (t) { return { key: t.key, label: t.fullName, n: counts[t.key] || 0 }; }));
    el.typeTabs.innerHTML = items.map(function (it) {
      return '<button type="button" class="' + (state.type === it.key ? 'active' : '') + '" data-type="' + it.key + '">'
        + esc(it.label) + '<span class="count"> ' + it.n + '</span></button>';
    }).join('');
    // 没有关键词时不需要类型切换，隐藏掉省地方
    el.typeTabs.hidden = !state.keyword;
  }

  /* ---------- 结果 ---------- */

  function renderResults() {
    if (!state.keyword) {
      el.discover.hidden = false;
      el.results.hidden = true;
      renderHot();
      renderHistory();
      renderTypeTabs();
      return;
    }
    el.discover.hidden = true;
    el.results.hidden = false;

    var posts = store.queryPosts({ keyword: state.keyword, type: state.type, sort: 'newest' });
    el.resultCount.textContent = '找到 ' + posts.length + ' 条与「' + state.keyword + '」相关的信息';

    if (!posts.length) {
      el.resultHost.innerHTML = UI.emptyHtml({
        icon: '🕳',
        title: '没有搜到匹配的信息',
        text: '可能是关键词不对，也可能确实还没人发布。换一个词，或者自己发一条让别人找到你。',
        actions: '<div class="empty-actions">'
          + '<button class="btn" id="emptyClear" type="button">清空关键词</button>'
          + '<a class="btn btn-primary" href="publish.html">＋ 发布寻物 / 招领</a></div>'
      });
      var b = document.getElementById('emptyClear');
      if (b) b.addEventListener('click', clearKeyword);
      return;
    }

    el.resultHost.innerHTML = UI.listHtml(posts, { keyword: state.keyword, from: 'search' });
  }

  function renderAll() {
    renderTypeTabs();
    renderResults();
  }

  /* ---------- 行为 ---------- */

  var commitHistory = LF.debounce(function (kw) {
    if (kw) store.addSearchHistory(kw);
  }, 1200);

  function doSearch(keyword, options) {
    options = options || {};
    state.keyword = LF.clean(keyword);
    el.input.value = state.keyword;
    if (options.focus === false) { /* 从 URL 进来时不抢焦点 */ } else { /* 保持焦点 */ }
    renderAll();
    if (state.keyword && options.record) commitHistory(state.keyword);
  }

  function clearKeyword() {
    state.keyword = '';
    el.input.value = '';
    el.input.focus();
    renderAll();
  }

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    // 手动点搜索按钮/回车：立刻记进历史，不等防抖
    doSearch(el.input.value, { record: true });
  });

  el.input.addEventListener('input', LF.debounce(function () {
    // ★ 只重绘结果区，绝不重建输入框本身，否则每打一个字就丢一次焦点
    state.keyword = LF.clean(el.input.value);
    renderAll();
    if (state.keyword) commitHistory(state.keyword);
  }, SUBMIT_DELAY));

  el.input.addEventListener('search', function () {
    doSearch(el.input.value, { record: true });
  });

  el.typeTabs.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-type]') : null;
    if (!t) return;
    state.type = t.getAttribute('data-type');
    renderAll();
  });

  document.addEventListener('click', function (e) {
    var chipEl = e.target.closest ? e.target.closest('.chip') : null;
    if (!chipEl) return;

    var del = e.target.closest('[data-del]');
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      store.removeSearchHistory(del.getAttribute('data-del'));
      renderHistory();
      return;
    }
    if (chipEl.hasAttribute('data-kw')) {
      doSearch(chipEl.getAttribute('data-kw'), { record: true });
    }
  });

  el.clearHistory.addEventListener('click', function () {
    store.clearSearchHistory();
    renderHistory();
    UI.toast('已清空搜索历史');
  });

  el.clearKw.addEventListener('click', clearKeyword);

  /* ---------- 入口 ---------- */

  // 支持 index.html 上点热门词直接跳过来带关键词：search.html?kw=校园卡
  var initial = UI.param('kw');
  if (initial) {
    doSearch(initial, { record: false });
  } else {
    renderAll();
    el.input.focus();
  }
})();
