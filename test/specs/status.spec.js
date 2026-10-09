/*!
 * status.spec.js —— 状态流转与统计
 *
 * 需求里点名的那句"更新状态"，是这条主线的终点，也是最容易做错的一环：
 * 东西已经还回去了、信息还挂着"待认领"，别人就会白跑一趟——这正是需求要解决的痛点。
 * 所以这里除了测"能改"，还专门测了**幂等**和**权限**这两件容易被忽略的事。
 */
(function (root) {
  'use strict';

  var isNode = (typeof module === 'object' && module.exports);
  var T = isNode ? require('./fixtures.js') : root.T;
  var LF = T.LF;
  var assert = (isNode ? require('../lib/chai.js') : root.chai).assert;

  describe('状态文案：同一套 status，寻物和招领说法不同', function () {
    it('寻物 + 进行中 = 寻找中；寻物 + 已完成 = 已找到', function () {
      assert.strictEqual(LF.statusTextOf('lost', 'active'), '寻找中');
      assert.strictEqual(LF.statusTextOf('lost', 'done'), '已找到');
    });

    it('招领 + 进行中 = 待认领；招领 + 已完成 = 已归还', function () {
      assert.strictEqual(LF.statusTextOf('found', 'active'), '待认领');
      assert.strictEqual(LF.statusTextOf('found', 'done'), '已归还');
    });

    it('未知类型有兜底文案，不会显示 undefined', function () {
      assert.strictEqual(LF.statusTextOf('unknown', 'active'), '进行中');
      assert.strictEqual(LF.statusTextOf('unknown', 'done'), '已完成');
    });

    it('视图里的 statusText 与类型匹配', function () {
      var store = T.makeStore();
      var lost = T.withPost(store, T.ME, T.validLost());
      var found = T.withPost(store, T.ME, {});
      assert.strictEqual(store.getPost(lost.id).statusText, '寻找中');
      assert.strictEqual(store.getPost(found.id).statusText, '待认领');
    });
  });

  describe('标记已完成', function () {
    it('寻物标记后 doneType 是 found', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, T.validLost());
      var res = store.markDone(p.id);
      assert.isTrue(res.ok);
      assert.strictEqual(res.post.status, LF.STATUSES.DONE);
      assert.strictEqual(res.post.doneType, 'found');
      assert.strictEqual(res.post.statusText, '已找到');
    });

    it('招领标记后 doneType 是 returned', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      var res = store.markDone(p.id);
      assert.strictEqual(res.post.doneType, 'returned');
      assert.strictEqual(res.post.statusText, '已归还');
    });

    it('会记录完成时间', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      var res = store.markDone(p.id);
      assert.strictEqual(res.post.doneAt, T.NOW);
    });

    it('★ 幂等：第二次调用返回 unchanged，且不改动原有的完成时间', function () {
      var clock = T.makeClockStore();
      var p = T.withPost(clock.store, T.ME, {});
      var first = clock.store.markDone(p.id);
      clock.tick(60 * 60 * 1000);          // 一小时后有人又点了一次
      var second = clock.store.markDone(p.id);
      assert.isTrue(second.ok);
      assert.isTrue(second.unchanged);
      assert.strictEqual(second.post.doneAt, first.post.doneAt,
        '否则"已归还于昨天"会变成"已归还于刚才"，记录就不准了');
    });

    it('只有发布者能标记', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      assert.isFalse(store.markDone(p.id, T.OTHER).ok);
    });

    it('不存在的 id 返回友好提示而不是抛异常', function () {
      var store = T.makeStore();
      assert.doesNotThrow(function () { store.markDone('no_such_id'); });
      assert.isFalse(store.markDone('no_such_id').ok);
    });

    it('完成后列表里沉底（需求要解决的"白跑一趟"问题）', function () {
      var clock = T.makeClockStore();
      var a = T.withPost(clock.store, T.ME, { title: '较早的信息' });
      clock.tick();
      var b = T.withPost(clock.store, T.ME, { title: '较新的信息' });
      clock.store.markDone(b.id);
      var titles = clock.store.queryPosts({}).map(function (x) { return x.title; });
      assert.strictEqual(titles[0], '较早的信息');
    });

    it('完成后仍然可以被搜到（只是置灰，不是消失）', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, { title: '一把藏蓝色雨伞' });
      store.markDone(p.id);
      assert.lengthOf(store.queryPosts({ keyword: '藏蓝色' }), 1);
    });

    it('也可以按状态筛出已完成的', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, {});
      T.withPost(store, T.ME, {});
      store.markDone(a.id);
      assert.lengthOf(store.queryPosts({ status: LF.STATUSES.DONE }), 1);
      assert.lengthOf(store.queryPosts({ status: LF.STATUSES.ACTIVE }), 1);
    });
  });

  describe('恢复为进行中', function () {
    it('状态和 doneType / doneAt 一起回到初始值', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      store.markDone(p.id);
      var res = store.restorePost(p.id);
      assert.isTrue(res.ok);
      assert.strictEqual(res.post.status, LF.STATUSES.ACTIVE);
      assert.isNull(res.post.doneType);
      assert.isNull(res.post.doneAt);
      assert.strictEqual(res.post.statusText, '待认领');
    });

    it('只有发布者能恢复', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      store.markDone(p.id);
      assert.isFalse(store.restorePost(p.id, T.OTHER).ok);
    });

    it('恢复后会重新出现在筛选"进行中"的结果里', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      store.markDone(p.id);
      store.restorePost(p.id);
      assert.lengthOf(store.queryPosts({ status: LF.STATUSES.ACTIVE }), 1);
    });
  });

  describe('删除', function () {
    it('发布者可以删除，删完查不到', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      assert.isTrue(store.removePost(p.id).ok);
      assert.isNull(store.getPost(p.id));
    });

    it('删除会一并清掉本机的解锁记录与凭证码（避免残留脏数据）', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      store.submitClaim(p.id, T.correctAnswers(), T.OTHER);
      assert.isTrue(store.isUnlocked(p.id, T.OTHER));
      store.removePost(p.id);
      assert.isFalse(store.isUnlocked(p.id, T.OTHER));
    });

    it('删除一条不影响其他条目', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, { title: '要删的' });
      T.withPost(store, T.ME, { title: '要留的' });
      store.removePost(a.id);
      assert.lengthOf(store.queryPosts({}), 1);
      assert.strictEqual(store.queryPosts({})[0].title, '要留的');
    });

    it('重复删除第二次返回失败而不是抛异常', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      store.removePost(p.id);
      assert.doesNotThrow(function () { store.removePost(p.id); });
      assert.isFalse(store.removePost(p.id).ok);
    });
  });

  describe('个人统计', function () {
    it('只统计本人发布的信息', function () {
      var store = T.makeStore();
      T.withPost(store, T.ME, { title: '我的第一条' });
      T.withPost(store, T.ME, { title: '我的第二条' });
      T.withPost(store, T.OTHER, { title: '别人的' });
      assert.strictEqual(store.getStats().total, 2);
    });

    it('分别统计进行中与已完成', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, {});
      T.withPost(store, T.ME, {});
      store.markDone(a.id);
      var s = store.getStats();
      assert.strictEqual(s.total, 2);
      assert.strictEqual(s.active, 1);
      assert.strictEqual(s.done, 1);
    });

    it('累计浏览量', function () {
      var store = T.makeStore();
      var a = T.withPost(store, T.ME, {});
      store.addView(a.id);
      assert.strictEqual(store.getStats().views, 1);
    });

    it('统计收到的认领尝试次数', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      store.submitClaim(p.id, T.wrongAnswers(), T.OTHER);
      store.submitClaim(p.id, T.wrongAnswers(), T.OTHER);
      assert.strictEqual(store.getStats().claims, 2);
    });

    it('统计待处理的申诉条数', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      for (var i = 0; i < LF.VERIFY.MAX_ATTEMPTS; i++) store.submitClaim(p.id, T.wrongAnswers(), T.OTHER);
      store.submitAppeal(p.id, {
        claimantName: '某人', contact: 'QQ 12345678',
        detail: '这把伞是我的，伞柄木头，伞骨八根，请核对一下'
      }, T.OTHER);
      assert.strictEqual(store.getStats().pendingAppeals, 1);
    });

    it('没有发布过任何信息时统计全为 0（而不是 null）', function () {
      var store = T.makeStore();
      var s = store.getStats();
      assert.strictEqual(s.total, 0);
      assert.strictEqual(s.views, 0);
      assert.strictEqual(s.pendingAppeals, 0);
    });

    it('getMyPosts 只返回本人的，且按时间倒序', function () {
      var clock = T.makeClockStore();
      T.withPost(clock.store, T.ME, { title: '我的早的' });
      clock.tick();
      T.withPost(clock.store, T.ME, { title: '我的晚的' });
      T.withPost(clock.store, T.OTHER, { title: '别人的' });
      var mine = clock.store.getMyPosts();
      assert.lengthOf(mine, 2);
      assert.strictEqual(mine[0].title, '我的晚的');
    });
  });

  describe('个人资料与草稿', function () {
    it('资料默认是空的，保存后能读回来', function () {
      var store = T.makeStore();
      assert.strictEqual(store.getProfile().name, '');
      store.saveProfile({ name: '林同学', contact: '微信 linfeng_2023', college: '计算机与大数据学院' });
      var p = store.getProfile();
      assert.strictEqual(p.name, '林同学');
      assert.strictEqual(p.college, '计算机与大数据学院');
    });

    it('资料只更新传入的字段，没传的保持原样', function () {
      var store = T.makeStore();
      store.saveProfile({ name: '林同学', college: '计算机' });
      store.saveProfile({ campus: '旗山校区' });
      var p = store.getProfile();
      assert.strictEqual(p.name, '林同学');
      assert.strictEqual(p.college, '计算机');
      assert.strictEqual(p.campus, '旗山校区');
    });

    it('草稿能存能读能清', function () {
      var store = T.makeStore();
      assert.isNull(store.getDraft());
      store.saveDraft({ title: '填了一半', type: 'found' });
      assert.strictEqual(store.getDraft().title, '填了一半');
      store.clearDraft();
      assert.isNull(store.getDraft());
    });

    it('草稿是深拷贝，改草稿不会影响 store 里的副本', function () {
      var store = T.makeStore();
      store.saveDraft({ title: '原始标题' });
      var d = store.getDraft();
      d.title = '被改过的';
      assert.strictEqual(store.getDraft().title, '原始标题');
    });

    it('草稿会落盘', function () {
      var clock = T.makeClockStore();
      clock.store.saveDraft({ title: '跨页面的草稿' });
      assert.strictEqual(clock.reopen().getDraft().title, '跨页面的草稿');
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
