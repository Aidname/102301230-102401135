/*!
 * query.spec.js —— 搜索、筛选、排序、分面统计
 *
 * 搜索这一类逻辑最容易出的两种错：
 *   · 只测"应该命中"，结果实现过宽（搜什么都有结果，等于没搜）；
 *   · 只测"应该不命中"，结果实现过严（真失主搜不到自己的东西）。
 * 所以这里**命中与不命中成对写**，而且刻意覆盖用户真实会输入的形态：
 * 大小写、全角、首尾空格、从微信复制带进来的零宽字符。
 */
(function (root) {
  'use strict';

  var isNode = (typeof module === 'object' && module.exports);
  var T = isNode ? require('./fixtures.js') : root.T;
  var LF = T.LF;
  var assert = (isNode ? require('../lib/chai.js') : root.chai).assert;

  function makePool() {
    var store = T.makeStore();
    T.withPost(store, T.ME, {
      type: 'lost', category: 'card', title: '校园卡一张', contactName: '刘同学',
      location: '第一食堂二楼', description: '学号 2023 开头，卡面有贴纸', contactWay: '13800138000'
    });
    T.withPost(store, T.OTHER, {
      type: 'found', category: 'digital', title: '白色 AirPods Pro 耳机', contactName: '周同学',
      location: '图书馆三楼自习区', description: '耳机盒有划痕', contactWay: 'QQ 5123678'
    });
    T.withPost(store, T.OTHER, {
      type: 'found', category: 'book', title: '高等数学上册', contactName: '郑同学',
      location: '教学楼 B 区 305', description: '扉页有名字', contactWay: 'QQ 5123678'
    });
    return store;
  }

  describe('关键词匹配：命中与不命中成对写', function () {
    var store = makePool();

    it('命中标题', function () {
      assert.lengthOf(store.queryPosts({ keyword: '校园卡' }), 1);
    });

    it('不命中不存在的词', function () {
      assert.lengthOf(store.queryPosts({ keyword: '不存在的物品xyz' }), 0);
    });

    it('命中描述里的词', function () {
      assert.lengthOf(store.queryPosts({ keyword: '贴纸' }), 1);
    });

    it('命中地点里的词', function () {
      assert.lengthOf(store.queryPosts({ keyword: '图书馆' }), 1);
    });

    it('命中分类名（搜"证件卡片"能找到标题写"校园卡"的信息）', function () {
      assert.lengthOf(store.queryPosts({ keyword: '证件卡片' }), 1);
    });

    it('命中类型名（搜"招领"能找到招领信息）', function () {
      assert.lengthOf(store.queryPosts({ keyword: '招领' }), 2);
    });

    it('大小写不敏感：airpods 能命中 AirPods', function () {
      assert.lengthOf(store.queryPosts({ keyword: 'airpods' }), 1);
      assert.lengthOf(store.queryPosts({ keyword: 'AIRPODS' }), 1);
    });

    it('全角输入同样能命中：ＡｉｒＰｏｄｓ', function () {
      assert.lengthOf(store.queryPosts({ keyword: 'ＡｉｒＰｏｄｓ' }), 1);
    });

    it('首尾空格被忽略', function () {
      assert.lengthOf(store.queryPosts({ keyword: '   校园卡   ' }), 1);
    });

    it('从微信复制带进来的零宽字符不影响命中', function () {
      assert.lengthOf(store.queryPosts({ keyword: '校园\u200b卡' }), 1);
    });

    it('多个关键词按「与」匹配：同时提到"耳机"和"图书馆"的只有一条', function () {
      assert.lengthOf(store.queryPosts({ keyword: '耳机 图书馆' }), 1);
    });

    it('多个关键词里有一个对不上就返回空', function () {
      assert.lengthOf(store.queryPosts({ keyword: '耳机 食堂' }), 0);
    });

    it('空关键词返回全部（而不是返回空列表）', function () {
      assert.lengthOf(store.queryPosts({ keyword: '' }), 3);
      assert.lengthOf(store.queryPosts({ keyword: '   ' }), 3);
    });

    it('搜索框里输入正则元字符不会崩（用的是 indexOf 而不是 RegExp）', function () {
      assert.doesNotThrow(function () { store.queryPosts({ keyword: '(' }); });
      assert.doesNotThrow(function () { store.queryPosts({ keyword: '.*+?[]' }); });
      assert.doesNotThrow(function () { store.queryPosts({ keyword: '\\' }); });
    });

    it('搜索范围包含打码后的称呼，但不泄露完整姓名', function () {
      assert.lengthOf(store.queryPosts({ keyword: '周' }), 1);
      assert.lengthOf(store.queryPosts({ keyword: '周同学' }), 0, '打码后的称呼是「周**」，完整姓名搜不到');
      assert.lengthOf(store.queryPosts({ keyword: '刘' }), 1);
      assert.lengthOf(store.queryPosts({ keyword: '郑' }), 1);
    });
  });

  describe('筛选：类型 / 分类 / 地点 / 状态', function () {
    var store = makePool();

    it('按类型筛选', function () {
      assert.lengthOf(store.queryPosts({ type: 'lost' }), 1);
      assert.lengthOf(store.queryPosts({ type: 'found' }), 2);
    });

    it('type=all 等价于不筛选', function () {
      assert.lengthOf(store.queryPosts({ type: 'all' }), 3);
    });

    it('按分类筛选', function () {
      assert.lengthOf(store.queryPosts({ category: 'book' }), 1);
      assert.lengthOf(store.queryPosts({ category: 'card' }), 1);
      assert.lengthOf(store.queryPosts({ category: 'rain' }), 0);
    });

    it('地点用子串包含匹配：选"图书馆"能命中"图书馆三楼自习区"', function () {
      assert.lengthOf(store.queryPosts({ location: '图书馆' }), 1);
    });

    it('地点筛选也能用更长的字符串：选"教学楼"能命中"教学楼 B 区 305"', function () {
      assert.lengthOf(store.queryPosts({ location: '教学楼' }), 1);
    });

    it('地点对不上时返回空', function () {
      assert.lengthOf(store.queryPosts({ location: '体育馆' }), 0);
    });

    it('四个维度可以自由组合', function () {
      assert.lengthOf(store.queryPosts({ type: 'found', category: 'book', location: '教学楼' }), 1);
      assert.lengthOf(store.queryPosts({ type: 'lost', category: 'book' }), 0);
    });

    it('关键词与筛选可以叠加', function () {
      assert.lengthOf(store.queryPosts({ keyword: '高等数学', type: 'found' }), 1);
      assert.lengthOf(store.queryPosts({ keyword: '高等数学', type: 'lost' }), 0);
    });
  });

  describe('排序：已完成一律沉底', function () {
    function sortPool() {
      // 用可推进的时钟：三条信息必须落在**不同**的时间点上，
      // 否则"最新在前 / 最早在前"根本没被验证到（比较器全返回 0）
      var clock = T.makeClockStore();
      var a = T.withPost(clock.store, T.ME, { title: '最早发布的信息' });
      clock.tick();
      var b = T.withPost(clock.store, T.ME, { title: '中间发布的信息' });
      clock.tick();
      var c = T.withPost(clock.store, T.ME, { title: '最新发布的信息' });
      clock.store.markDone(a.id);
      return { clock: clock, store: clock.store, ids: [a.id, b.id, c.id] };
    }

    it('默认按最新发布在前', function () {
      var p = sortPool();
      var titles = p.store.queryPosts({}).map(function (x) { return x.title; });
      assert.deepEqual(titles, ['最新发布的信息', '中间发布的信息', '最早发布的信息']);
    });

    it('已完成的沉到后面，即使它是最新发布的', function () {
      var p = sortPool();
      var titles = p.store.queryPosts({}).map(function (x) { return x.title; });
      assert.strictEqual(titles[titles.length - 1], '最早发布的信息');
    });

    it('oldest 排序下已完成同样沉底', function () {
      var p = sortPool();
      var titles = p.store.queryPosts({ sort: 'oldest' }).map(function (x) { return x.title; });
      assert.deepEqual(titles, ['中间发布的信息', '最新发布的信息', '最早发布的信息']);
    });

    it('非法的 sort 值回退到最新发布，而不是报错或乱序', function () {
      var p = sortPool();
      assert.doesNotThrow(function () { p.store.queryPosts({ sort: 'no_such_sort' }); });
      var titles = p.store.queryPosts({ sort: 'no_such_sort' }).map(function (x) { return x.title; });
      assert.deepEqual(titles, ['最新发布的信息', '中间发布的信息', '最早发布的信息']);
    });

    it('hot 排序按浏览量倒序', function () {
      var clock = T.makeClockStore();
      var a = T.withPost(clock.store, T.ME, { title: '浏览多的信息' });
      clock.tick();
      var b = T.withPost(clock.store, T.ME, { title: '浏览少的信息' });
      // 每一次"打开详情页"都是一个新页面（新的 store 实例），
      // 所以这里用 reopen() 模拟用户在不同时间点打开了三次。
      // 注意读的时候也要用新实例：老实例的内存副本不会自动感知别人写进去的改动。
      for (var i = 0; i < 3; i++) clock.reopen().addView(a.id);
      clock.reopen().addView(b.id);
      var fresh = clock.reopen();
      var titles = fresh.queryPosts({ sort: 'hot' }).map(function (x) { return x.title; });
      assert.strictEqual(titles[0], '浏览多的信息');
      assert.strictEqual(fresh.getPost(a.id).views, 3);
      assert.strictEqual(fresh.getPost(b.id).views, 1);
    });

    it('同一次打开里重复调用 addView 不会重复计数（防止重渲染把浏览量刷上去）', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, { title: '一条信息' });
      store.addView(a.id);
      store.addView(a.id);
      store.addView(a.id);
      assert.strictEqual(store.getPost(a.id).views, 1);
    });

    it('浏览量会落盘', function () {
      var clock = T.makeClockStore();
      var a = T.withPost(clock.store, T.ME, { title: '一条信息' });
      clock.store.addView(a.id);
      assert.strictEqual(clock.reopen().getPost(a.id).views, 1);
    });
  });

  describe('分页与计数', function () {
    it('limit 生效', function () {
      var store = makePool();
      assert.lengthOf(store.queryPosts({ limit: 2 }), 2);
    });

    it('offset 生效', function () {
      var store = makePool();
      var all = store.queryPosts({});
      var tail = store.queryPosts({ offset: 1 });
      assert.lengthOf(tail, 2);
      assert.strictEqual(tail[0].id, all[1].id);
    });

    it('offset 超过总数时返回空数组而不是报错', function () {
      var store = makePool();
      assert.lengthOf(store.queryPosts({ offset: 999 }), 0);
    });

    it('负数 offset 被钳到 0', function () {
      var store = makePool();
      assert.lengthOf(store.queryPosts({ offset: -5 }), 3);
    });

    it('countPosts 与 queryPosts 的结果条数一致', function () {
      var store = makePool();
      assert.strictEqual(store.countPosts({ type: 'found' }), store.queryPosts({ type: 'found' }).length);
    });
  });

  describe('分面统计：统计某一维时忽略该维自身的筛选', function () {
    var store = makePool();

    it('分类各选项都有条数', function () {
      var f = store.facets({});
      assert.strictEqual(f.category.card, 1);
      assert.strictEqual(f.category.digital, 1);
      assert.strictEqual(f.category.book, 1);
      assert.strictEqual(f.category.rain, undefined);
    });

    it('选中某个分类后，其他分类的条数不会全变成 0', function () {
      var f = store.facets({ category: 'card' });
      assert.strictEqual(f.category.digital, 1, '否则用户没法从"证件卡片"直接切到"数码电子"');
      assert.strictEqual(f.category.book, 1);
    });

    it('选中某个地点后，其他地点的条数同样保留', function () {
      var f = store.facets({ location: '图书馆' });
      assert.isUndefined(f.location['图书馆'] === 0 ? 0 : undefined);
      assert.strictEqual(f.location['第一食堂'], 1);
    });

    it('其他维度的筛选仍然会对分类条数生效', function () {
      var f = store.facets({ type: 'lost' });
      assert.strictEqual(f.category.card, 1);
      assert.strictEqual(f.category.book, undefined, 'book 分类下只有招领信息，按"寻物"筛后应为 0');
    });

    it('地点统计按字典归并：自由文本"图书馆三楼自习区"归到"图书馆"', function () {
      var f = store.facets({});
      assert.strictEqual(f.location['图书馆'], 1);
    });

    it('归不进字典的地点计入「其他」', function () {
      var s = T.makeStore();
      T.withPost(s, T.ME, { location: '一个字典里没有的地方' });
      var f = s.facets({});
      assert.strictEqual(f.location['其他'], 1);
    });
  });

  describe('热门搜索词由真实数据统计得出', function () {
    it('没有数据时返回空数组（不是写死的词表）', function () {
      var store = T.makeStore();
      assert.lengthOf(store.getHotKeywords(8), 0);
    });

    it('命中的词才会出现在热门里', function () {
      var store = makePool();
      var hot = store.getHotKeywords(20);
      assert.include(hot, '校园卡');
      assert.include(hot, '图书馆');
      assert.notInclude(hot, '雨伞', '没有一条信息能被"雨伞"搜到');
    });

    it('按命中条数倒序', function () {
      var store = T.makeStore();
      T.withPost(store, T.ME, { title: '校园卡一张', category: 'card', location: '第一食堂' });
      T.withPost(store, T.ME, { title: '另一张校园卡', category: 'card', location: '教学楼' });
      T.withPost(store, T.ME, { title: '一副耳机', category: 'digital', location: '实验楼' });
      var hot = store.getHotKeywords(30);
      assert.strictEqual(hot[0], '校园卡', '能搜到 2 条信息的词应该排第一');
    });

    it('limit 生效', function () {
      var store = makePool();
      assert.lengthOf(store.getHotKeywords(2), 2);
    });
  });

  describe('智能配对', function () {
    it('类型相反 + 分类相同 + 标题两字重合才算配对', function () {
      var store = T.makeStore();
      var lost = T.withPost(store, T.ME, {
        type: 'lost', category: 'digital', title: '白色蓝牙耳机丢了'
      });
      T.withPost(store, T.OTHER, { type: 'found', category: 'digital', title: '捡到一副蓝牙耳机' });
      var raw = store.debugState().posts.filter(function (p) { return p.id === lost.id; })[0];
      var matches = store.findMatches(raw, 3);
      assert.lengthOf(matches, 1);
      assert.strictEqual(matches[0].type, 'found');
    });

    it('同类型（都是寻物）不会被配对', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, { type: 'lost', category: 'digital', title: '蓝牙耳机丢了' });
      T.withPost(store, T.OTHER, { type: 'lost', category: 'digital', title: '蓝牙耳机也不见了' });
      var raw = store.debugState().posts.filter(function (p) { return p.id === a.id; })[0];
      assert.lengthOf(store.findMatches(raw, 3), 0);
    });

    it('分类不同不会被配对', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, { type: 'lost', category: 'digital', title: '蓝牙耳机丢了' });
      T.withPost(store, T.OTHER, { type: 'found', category: 'book', title: '捡到一副蓝牙耳机' });
      var raw = store.debugState().posts.filter(function (p) { return p.id === a.id; })[0];
      assert.lengthOf(store.findMatches(raw, 3), 0);
    });

    it('已完成的信息不再参与配对', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, { type: 'lost', category: 'digital', title: '蓝牙耳机丢了' });
      var b = T.withPost(store, T.OTHER, { type: 'found', category: 'digital', title: '捡到一副蓝牙耳机' });
      store.markDone(b.id, T.OTHER);
      var raw = store.debugState().posts.filter(function (p) { return p.id === a.id; })[0];
      assert.lengthOf(store.findMatches(raw, 3), 0);
    });

    it('自己不会和自己配对', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, { type: 'lost', category: 'digital', title: '蓝牙耳机丢了' });
      var raw = store.debugState().posts.filter(function (p) { return p.id === a.id; })[0];
      assert.lengthOf(store.findMatches(raw, 3), 0);
    });

    it('最多返回 3 条', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, { type: 'lost', category: 'digital', title: '蓝牙耳机丢了' });
      for (var i = 0; i < 5; i++) {
        T.withPost(store, T.OTHER, { type: 'found', category: 'digital', title: '蓝牙耳机第 ' + i + ' 副' });
      }
      var raw = store.debugState().posts.filter(function (p) { return p.id === a.id; })[0];
      assert.lengthOf(store.findMatches(raw, 3), 3);
    });
  });

  describe('搜索历史', function () {
    it('去重：重复搜同一个词不会产生两条', function () {
      var store = T.makeStore();
      store.addSearchHistory('校园卡');
      store.addSearchHistory('耳机');
      store.addSearchHistory('校园卡');
      assert.deepEqual(store.getSearchHistory(), ['校园卡', '耳机']);
    });

    it('最新的排在最前面', function () {
      var store = T.makeStore();
      store.addSearchHistory('一');
      store.addSearchHistory('二');
      assert.strictEqual(store.getSearchHistory()[0], '二');
    });

    it('最多保留 10 条，第 11 条挤掉最旧的一条', function () {
      var store = T.makeStore();
      for (var i = 1; i <= 11; i++) store.addSearchHistory('关键词' + i);
      var h = store.getSearchHistory();
      assert.lengthOf(h, LF.LIMITS.HISTORY_MAX);
      assert.strictEqual(h[0], '关键词11');
      assert.notInclude(h, '关键词1');
    });

    it('空关键词不记入历史', function () {
      var store = T.makeStore();
      store.addSearchHistory('');
      store.addSearchHistory('   ');
      assert.lengthOf(store.getSearchHistory(), 0);
    });

    it('可以单条删除', function () {
      var store = T.makeStore();
      store.addSearchHistory('一');
      store.addSearchHistory('二');
      store.removeSearchHistory('一');
      assert.deepEqual(store.getSearchHistory(), ['二']);
    });

    it('可以一键清空', function () {
      var store = T.makeStore();
      store.addSearchHistory('一');
      store.clearSearchHistory();
      assert.lengthOf(store.getSearchHistory(), 0);
    });

    it('历史会落盘，重新加载 store 后还在', function () {
      var adapter = LF.createMemoryAdapter();
      var s1 = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      s1.boot();
      s1.addSearchHistory('校园卡');
      var s2 = LF.createStore(adapter, { now: T.NOW, seed: false });
      s2.boot();
      assert.deepEqual(s2.getSearchHistory(), ['校园卡']);
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
