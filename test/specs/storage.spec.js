/*!
 * storage.spec.js —— 存储适配器、脏数据容错、老数据迁移、导入导出、演示数据
 *
 * 这一层测的是"环境不理想时会怎样"：
 *   · 浏览器不给用 localStorage（无痕模式 / 企业策略）；
 *   · 存储被别的东西写坏了（半截 JSON、混进 null 和字符串、记录缺字段）；
 *   · 存储写满（QuotaExceededError）；
 *   · 上一版的数据结构不一样。
 * 这几类问题的共同点是：**正常路径下永远测不到，一旦发生就是白屏**。
 */
(function (root) {
  'use strict';

  var isNode = (typeof module === 'object' && module.exports);
  var T = isNode ? require('./fixtures.js') : root.T;
  var LF = T.LF;
  var assert = (isNode ? require('../lib/chai.js') : root.chai).assert;

  describe('内存适配器', function () {
    it('getItem / setItem / removeItem 与 localStorage 语义一致', function () {
      var m = LF.createMemoryAdapter();
      assert.isNull(m.getItem('nope'));
      m.setItem('a', '1');
      assert.strictEqual(m.getItem('a'), '1');
      m.removeItem('a');
      assert.isNull(m.getItem('a'));
    });

    it('写入的值会被转成字符串（和 localStorage 一样）', function () {
      var m = LF.createMemoryAdapter();
      m.setItem('n', 42);
      assert.strictEqual(m.getItem('n'), '42');
    });

    it('两个适配器实例互不影响（每个用例一个干净仓库）', function () {
      var a = LF.createMemoryAdapter();
      var b = LF.createMemoryAdapter();
      a.setItem('k', 'v');
      assert.isNull(b.getItem('k'));
    });
  });

  describe('存储探测与降级', function () {
    it('好用的适配器能被探针认出来', function () {
      assert.isTrue(LF.probeStorage(LF.createMemoryAdapter()));
    });

    it('写入就抛异常的适配器探针返回 false', function () {
      assert.isFalse(LF.probeStorage({
        getItem: function () { return null; },
        setItem: function () { throw new Error('blocked'); },
        removeItem: function () {}
      }));
    });

    it('写进去读不出来的适配器同样返回 false（只算"能拿到对象"是不够的）', function () {
      assert.isFalse(LF.probeStorage({
        getItem: function () { return 'tampered'; },
        setItem: function () {},
        removeItem: function () {}
      }));
    });

    it('传 null 不会抛异常', function () {
      assert.doesNotThrow(function () { LF.probeStorage(null); });
      assert.isFalse(LF.probeStorage(null));
    });
  });

  describe('脏数据容错：存坏了也不能白屏', function () {
    function withRaw(raw) {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem(LF.STORAGE_KEY, raw);
      var store = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      store.boot();
      return store;
    }

    it('半截 JSON 不会抛异常', function () {
      assert.doesNotThrow(function () { withRaw('{"version":1,"posts":[{' ); });
    });

    it('存的不是 JSON 时回退到空库', function () {
      var store = withRaw('这不是 JSON');
      assert.strictEqual(store.countPosts({}), 0);
    });

    it('存的 JSON 是 null 时回退到空库', function () {
      assert.strictEqual(withRaw('null').countPosts({}), 0);
    });

    it('posts 不是数组时回退到空库', function () {
      assert.strictEqual(withRaw('{"version":1,"posts":"不是数组"}').countPosts({}), 0);
    });

    it('数组里混进 null / 字符串 / 缺 id 的对象时，坏的被丢掉、好的留下', function () {
      var store = withRaw(JSON.stringify({
        version: 1,
        posts: [null, '字符串', { title: '没有 id' }, {
          id: 'ok_1', type: 'lost', title: '一条正常的信息', category: 'daily',
          location: '食堂', happenedAt: '2026-10-01', contactName: '某人',
          contactWay: '13800138000', createdAt: T.NOW
        }]
      }));
      assert.strictEqual(store.countPosts({}), 1);
      assert.strictEqual(store.queryPosts({})[0].title, '一条正常的信息');
    });

    it('记录缺字段时补上兜底值，而不是显示 undefined', function () {
      var store = withRaw(JSON.stringify({
        version: 1,
        posts: [{ id: 'x1' }]
      }));
      var view = store.getPost('x1');
      assert.isNotNull(view);
      assert.strictEqual(view.title, '');
      assert.strictEqual(view.category, 'other');
      assert.strictEqual(view.status, LF.STATUSES.ACTIVE);
      assert.strictEqual(view.views, 0);
      assert.isNumber(view.createdAt);
    });

    it('非法的分类被归到「其他」，非法类型被归到寻物', function () {
      var store = withRaw(JSON.stringify({
        version: 1,
        posts: [{ id: 'x1', type: 'weird', category: 'no_such', title: '脏数据' }]
      }));
      var view = store.getPost('x1');
      assert.strictEqual(view.category, 'other');
      assert.strictEqual(view.type, 'lost');
    });

    it('坏掉的 history / unlocked 不会让整个库打不开', function () {
      var store = withRaw(JSON.stringify({
        version: 1, posts: [], history: '不是数组', unlocked: { a: 1 }
      }));
      assert.lengthOf(store.getSearchHistory(), 0);
      assert.lengthOf(store.queryPosts({}), 0);
    });
  });

  describe('存储写满（配额错误）', function () {
    it('创建时返回中文的可操作提示，而不是抛异常', function () {
      var store = LF.createStore(T.quotaAdapter(), { now: T.NOW, ownerId: T.ME, seed: false });
      store.boot();
      var res = store.createPost(T.validLost());
      assert.isFalse(res.ok);
      assert.isString(res.errors._);
      assert.include(res.errors._, '写满');
    });

    it('落盘失败时内存里也不留下这条记录（不会出现"看得见但存不进去"）', function () {
      var store = LF.createStore(T.quotaAdapter(), { now: T.NOW, ownerId: T.ME, seed: false });
      store.boot();
      store.createPost(T.validLost());
      assert.strictEqual(store.countPosts({}), 0);
    });
  });

  describe('老数据迁移', function () {
    it('第一次结对作业那份脚手架的数据能被搬过来', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem(LF.LEGACY_STORAGE_KEY, JSON.stringify([
        { id: 1710000000000, type: 'lost', name: '黑色校园卡', place: '图书馆三楼',
          desc: '卡面有贴纸', contact: '13800138000', createTime: '2026/09/20 10:00:00', status: 'ongoing' },
        { id: 1710000000001, type: 'found', name: '一把雨伞', place: '食堂门口',
          desc: '', contact: 'QQ 123456', createTime: '2026/09/21 12:00:00', status: 'done' }
      ]));
      var store = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      var res = store.boot();
      assert.strictEqual(res.migrated, 2);
      assert.strictEqual(store.countPosts({}), 2);
      var first = store.queryPosts({ keyword: '校园卡' })[0];
      assert.strictEqual(first.title, '黑色校园卡');
      assert.strictEqual(first.location, '图书馆三楼');
    });

    it('迁移过来的记录能被正常操作（改名、标记完成）', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem(LF.LEGACY_STORAGE_KEY, JSON.stringify([
        { id: 1, type: 'lost', name: '旧数据', place: '某处', desc: '',
          contact: '13800138000', createTime: '2026/09/20 10:00:00', status: 'ongoing' }
      ]));
      var store = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      store.boot();
      var id = store.queryPosts({})[0].id;
      assert.isTrue(store.updatePost(id, { title: '改过名字的旧数据' }).ok);
      assert.isTrue(store.markDone(id).ok);
    });

    it('损坏的老数据被丢掉而不是让迁移崩掉', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem(LF.LEGACY_STORAGE_KEY, '{坏掉的 JSON');
      var store = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      assert.doesNotThrow(function () { store.boot(); });
    });

    it('已有新数据时不会被老数据覆盖', function () {
      var adapter = LF.createMemoryAdapter();
      var s1 = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      s1.boot();
      s1.createPost(T.validLost({ title: '新结构下的信息' }));
      adapter.setItem(LF.LEGACY_STORAGE_KEY, JSON.stringify([
        { id: 9, type: 'lost', name: '老数据', place: '某处', desc: '',
          contact: '13800138000', createTime: '2026/09/20 10:00:00', status: 'ongoing' }
      ]));
      var s2 = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      s2.boot();
      assert.lengthOf(s2.queryPosts({ keyword: '新结构' }), 1);
      assert.lengthOf(s2.queryPosts({ keyword: '老数据' }), 0);
    });

    it('版本号会被升级到当前版本', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem(LF.STORAGE_KEY, JSON.stringify({ version: 0, posts: [] }));
      var store = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      store.boot();
      store.createPost(T.validLost());
      assert.strictEqual(store.debugState().version, LF.DATA_VERSION);
    });

    it('老数据里「其他」类残留的验证题会被清掉（否则发布者被锁在没有入口的旧流程里）', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem(LF.STORAGE_KEY, JSON.stringify({
        version: 0,
        posts: [{
          id: 'legacy_other', type: 'found', category: 'other', title: '一本旧书',
          location: '图书馆', happenedAt: '2026-09-01', contactName: '某人',
          contactWay: '13800138000', createdAt: T.NOW,
          questions: [
            { id: 'q1', type: 'judge', stem: '扉页有名字', options: ['正确', '错误'], answer: 0 },
            { id: 'q2', type: 'judge', stem: '书里有笔记', options: ['正确', '错误'], answer: 1 },
            { id: 'q3', type: 'judge', stem: '封面是蓝色', options: ['正确', '错误'], answer: 0 }
          ],
          attemptsLeft: 0
        }]
      }));
      var store = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      store.boot();
      var view = store.getPost('legacy_other', T.OTHER);
      assert.strictEqual(view.questionCount, 0, '规则改了，历史数据也得跟着走');
      assert.isFalse(view.needsVerify);
      assert.strictEqual(view.contactWay, '13800138000', '应回落到信任模式');
      assert.isFalse(view.canAppeal);
    });
  });

  describe('导出与导入', function () {
    it('导出的 JSON 能被重新解析，且带 posts 字段', function () {
      var store = T.makeStore();
      T.withPost(store, T.ME, {});
      var parsed = JSON.parse(store.exportData());
      assert.isArray(parsed.posts);
      assert.lengthOf(parsed.posts, 1);
      assert.strictEqual(parsed.app, 'campus-lost-found');
    });

    it('导入能新增条目', function () {
      var src = T.makeStore();
      T.withPost(src, T.ME, { title: '来自备份的信息' });
      var dump = src.exportData();

      var dst = T.makeStore();
      var res = dst.importData(dump);
      assert.isTrue(res.ok);
      assert.strictEqual(res.added, 1);
      assert.lengthOf(dst.queryPosts({ keyword: '备份' }), 1);
    });

    it('导入相同 id 时覆盖而不是产生重复', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, { title: '原始标题' });
      var dump = store.exportData();
      store.updatePost(p.id, { title: '改过的标题' });
      var res = store.importData(dump);
      assert.strictEqual(res.updated, 1);
      assert.strictEqual(res.added, 0);
      assert.strictEqual(store.countPosts({}), 1);
    });

    it('导入乱七八糟的内容时返回中文提示而不是抛异常', function () {
      var store = T.makeStore();
      assert.doesNotThrow(function () { store.importData('不是 JSON'); });
      assert.isFalse(store.importData('不是 JSON').ok);
      assert.isFalse(store.importData('{"foo":1}').ok);
      assert.isFalse(store.importData('{"posts":[]}').ok);
    });

    it('导入的文件里有脏记录时，坏的被丢掉、好的留下来', function () {
      var store = T.makeStore();
      var res = store.importData(JSON.stringify({
        posts: [null, 'x', { id: 'good', type: 'lost', title: '能用的记录' }]
      }));
      assert.isTrue(res.ok);
      assert.strictEqual(res.added, 1);
    });
  });

  describe('演示数据', function () {
    it('首次打开会灌入演示数据', function () {
      var store = T.seededStore();
      assert.isAtLeast(store.countPosts({}), 8);
    });

    it('演示数据里有归属于本机的条目，方便直接体验"我的发布"', function () {
      var store = T.seededStore();
      assert.isAtLeast(store.getMyPosts().length, 2);
    });

    it('★ 已经有数据时绝不覆盖用户内容', function () {
      var adapter = LF.createMemoryAdapter();
      var s1 = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME, seed: false });
      s1.boot();
      s1.createPost(T.validLost({ title: '用户自己发的信息' }));

      var s2 = LF.createStore(adapter, { now: T.NOW, ownerId: T.ME });
      var res = s2.boot();
      assert.isFalse(res.seeded);
      assert.lengthOf(s2.queryPosts({ keyword: '用户自己' }), 1);
    });

    it('明确要求不灌数据时就不灌（测试里靠它拿到干净仓库）', function () {
      var store = LF.createStore(LF.createMemoryAdapter(), { now: T.NOW, ownerId: T.ME, seed: false });
      store.boot();
      assert.strictEqual(store.countPosts({}), 0);
    });

    it('演示数据里每一条都必须能通过当前的发布校验（否则说明夹具与规则脱节了）', function () {
      var posts = LF.buildSeedPosts(T.NOW, T.ME);
      posts.forEach(function (p) {
        var qs = p.questions.map(function (q) {
          return { type: q.type, stem: q.stem, options: q.options, answer: q.answer };
        });
        var r = LF.validatePost({
          type: p.type, title: p.title, category: p.category, location: p.location,
          happenedAt: p.happenedAt, description: p.description,
          contactName: p.contactName, contactWay: p.contactWay, photo: p.photo,
          questions: qs, now: T.NOW
        });
        assert.isTrue(r.ok, '演示数据「' + p.title + '」不合法：' + JSON.stringify(r.errors));
      });
    });

    it('演示数据覆盖了认领验证的三种状态', function () {
      var store = T.seededStore();
      var posts = store.queryPosts({});
      var canAnswer = posts.filter(function (p) { return p.needsVerify && p.attemptsLeft > 0; });
      var canAppeal = posts.filter(function (p) { return p.canAppeal; });
      var trust = posts.filter(function (p) { return !p.needsVerify && p.type === 'found'; });
      assert.isAtLeast(canAnswer.length, 1, '需要一条能答题的招领');
      assert.isAtLeast(canAppeal.length, 1, '需要一条已答满 3 次、可以演示申诉的招领');
      assert.isAtLeast(trust.length, 1, '需要一条「其他」类的信任模式招领');
    });

    it('演示数据里有一条待处理申诉（用来演示人工审核）', function () {
      var store = T.seededStore();
      var found = false;
      store.getMyPosts().forEach(function (p) {
        var res = store.listAppeals(p.id);
        if (res.ok && res.appeals.some(function (a) { return a.decision === 'pending'; })) found = true;
      });
      assert.isTrue(found);
    });

    it('恢复演示数据会先清空原有内容', function () {
      var store = T.seededStore();
      store.createPost(T.validLost({ title: '临时发的信息' }));
      store.seedDemo();
      assert.lengthOf(store.queryPosts({ keyword: '临时发的' }), 0);
      assert.isAtLeast(store.countPosts({}), 8);
    });

    it('演示数据里的验证题答案不会泄漏到公开视图', function () {
      var store = T.seededStore();
      assert.notInclude(JSON.stringify(store.queryPosts({})), 'answer');
    });

    it('清空全部数据后库里是空的', function () {
      var store = T.seededStore();
      store.clearAll();
      assert.strictEqual(store.countPosts({}), 0);
      assert.strictEqual(store.getStats().total, 0);
      assert.lengthOf(store.getSearchHistory(), 0);
    });
  });

  describe('多页面场景：数据要跨页面存活', function () {
    it('发布之后跳到成功页（新的 store 实例）仍然读得到', function () {
      var clock = T.makeClockStore();
      var created = clock.store.createPost(T.validLost({ title: '刚发布的信息' }));
      assert.isTrue(created.ok);
      var nextPage = clock.reopen();
      assert.isNotNull(nextPage.getPost(created.post.id));
      assert.strictEqual(nextPage.getPost(created.post.id).title, '刚发布的信息');
    });

    it('解锁状态与凭证码同样跨页面存活', function () {
      var clock = T.makeClockStore();
      var p = T.withPost(clock.store, T.ME, {});
      clock.store.submitClaim(p.id, T.correctAnswers(), T.OTHER);
      var nextPage = clock.reopen();
      assert.isTrue(nextPage.isUnlocked(p.id, T.OTHER));
      assert.match(nextPage.getPost(p.id, T.OTHER).voucher, /^CL-\d{4}-\d{4}$/);
    });

    it('ownerId 会持久化，换了页面也不会变成"别人的信息"', function () {
      var clock = T.makeClockStore();
      var p = T.withPost(clock.store, T.ME, {});
      var nextPage = clock.reopen();
      assert.strictEqual(nextPage.ownerId(), T.ME);
      assert.isTrue(nextPage.getPost(p.id).isOwner);
    });
  });

  describe('时间工具的边界', function () {
    it('相对时间：刚刚 / 分钟 / 小时 / 天', function () {
      assert.strictEqual(LF.timeAgo(T.NOW - 10 * 1000, { now: T.NOW }), '刚刚');
      assert.strictEqual(LF.timeAgo(T.NOW - 5 * 60 * 1000, { now: T.NOW }), '5 分钟前');
      assert.strictEqual(LF.timeAgo(T.NOW - 3 * 3600 * 1000, { now: T.NOW }), '3 小时前');
      assert.strictEqual(LF.timeAgo(T.NOW - 2 * 24 * 3600 * 1000, { now: T.NOW }), '2 天前');
    });

    it('超过 30 天改为显示具体日期', function () {
      assert.strictEqual(LF.timeAgo(T.NOW - 40 * 24 * 3600 * 1000, { now: T.NOW }), '2026-08-30');
    });

    it('未来时间显示日期并注明（不显示"-3 分钟前"）', function () {
      var out = LF.timeAgo(T.NOW + 3600 * 1000, { now: T.NOW });
      assert.include(out, '未来');
    });

    it('非法输入返回空串而不是 Invalid Date', function () {
      assert.strictEqual(LF.timeAgo('这不是时间', { now: T.NOW }), '');
      assert.strictEqual(LF.formatDate('乱码'), '');
    });

    it('编号格式是 LF + 8 位日期 + 3 位序号', function () {
      var code = LF.makeCode(7, { now: T.NOW });
      assert.match(code, /^LF\d{11}$/);
      assert.strictEqual(code, 'LF20261009007');
    });

    it('序号超过 999 时回绕而不是把编号撑长', function () {
      assert.match(LF.makeCode(1001, { now: T.NOW }), /^LF\d{11}$/);
    });

    it('uid 在同一毫秒内连续生成也不会重复', function () {
      var seen = {};
      for (var i = 0; i < 500; i++) seen[LF.uid('p')] = true;
      assert.strictEqual(Object.keys(seen).length, 500);
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
