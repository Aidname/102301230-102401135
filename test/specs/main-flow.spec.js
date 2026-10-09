/*!
 * main-flow.spec.js —— 端到端串联
 *
 * 单模块测试全过、拼起来却出问题，是结对开发里很常见的情况。
 * 所以单独用一个文件把作业要求的那条主线完整走一遍：
 *
 *   发布信息 → 浏览 / 搜索 → 查看详情 → 联系发布者 → 更新状态
 *
 * 另外把核心附加特点的那条链路也串起来：
 *   答题失败 3 次 → 提交申诉 → 发布者同意交还 → 拿到交接编号与联系方式
 *
 * 这些用例刻意"跨 actor"：同一个 store 里，A 发布、B 认领，
 * 因为真实场景里这两件事本来就发生在不同人身上——单设备演示时靠切换 actor 来模拟。
 */
(function (root) {
  'use strict';

  var isNode = (typeof module === 'object' && module.exports);
  var T = isNode ? require('./fixtures.js') : root.T;
  var LF = T.LF;
  var assert = (isNode ? require('../lib/chai.js') : root.chai).assert;

  describe('主流程：发布 → 搜索 → 详情 → 联系 → 更新状态', function () {
    it('整条主线一次走通', function () {
      var clock = T.makeClockStore();
      var store = clock.store;

      /* 1. 拾得者发布一条带验证题的招领信息 */
      var created = store.createPost({
        type: 'found',
        title: '白色蓝牙耳机一副',
        category: 'digital',
        location: '图书馆三楼自习区靠窗那排',
        happenedAt: '2026-10-08',
        description: '自习位捡到的，耳机盒有点脏。',
        contactName: '林同学',
        contactWay: '微信 linfeng_2023',
        questions: [
          { type: 'judge', stem: '耳机盒外壳有划痕', answer: 0 },
          { type: 'choice', stem: '耳机盒的充电口是', options: ['Type-C', 'Lightning'], answer: 1 },
          { type: 'judge', stem: '盒子上贴有贴纸', answer: 1 }
        ]
      }, T.ME);
      assert.isTrue(created.ok, JSON.stringify(created.errors));
      var id = created.post.id;
      assert.match(created.post.code, /^LF\d{11}$/);

      /* 2. 别人能在列表和搜索里看到它 */
      clock.tick();
      assert.lengthOf(store.queryPosts({ keyword: '蓝牙耳机' }), 1);
      assert.lengthOf(store.queryPosts({ keyword: '图书馆 耳机' }), 1);
      assert.lengthOf(store.queryPosts({ category: 'digital', type: 'found' }), 1);

      /* 3. 打开详情：看得到描述，看不到联系方式，也看不到答案 */
      var detail = store.getPost(id, T.OTHER);
      assert.strictEqual(detail.description, '自习位捡到的，耳机盒有点脏。');
      assert.strictEqual(detail.contactWay, '');
      assert.isTrue(detail.contactLocked);
      assert.strictEqual(detail.contactName, '林**');
      assert.notInclude(JSON.stringify(detail), 'answer');
      assert.strictEqual(detail.attemptsLeft, LF.VERIFY.MAX_ATTEMPTS);

      /* 4. 认领：第一次故意答错，只拿到统一提示，且扣一次次数 */
      var wrong = store.submitClaim(id, [1, 0, 0], T.OTHER);
      assert.isTrue(wrong.ok);
      assert.isFalse(wrong.passed);
      assert.strictEqual(wrong.message, '回答的细节与描述不符');
      assert.strictEqual(wrong.remaining, 2);
      assert.strictEqual(store.getPost(id, T.OTHER).contactWay, '', '答错之后联系方式仍然锁着');

      /* 5. 第二次全答对：解锁联系方式并拿到凭证码 */
      var right = store.submitClaim(id, [0, 1, 1], T.OTHER);
      assert.isTrue(right.passed);
      assert.match(right.voucher, /^CL-\d{4}-\d{4}$/);

      var unlocked = store.getPost(id, T.OTHER);
      assert.strictEqual(unlocked.contactWay, '微信 linfeng_2023');
      assert.strictEqual(unlocked.lockState, 'unlocked');
      assert.strictEqual(unlocked.voucher, right.voucher);

      /* 6. 列表里也能看出这条已经不需要验证了（要指定 actor，否则默认是本机发布者视角） */
      var inList = store.queryPosts({ keyword: '蓝牙耳机', actor: T.OTHER })[0];
      assert.strictEqual(inList.lockState, 'unlocked');
      assert.strictEqual(inList.contactWay, '微信 linfeng_2023');

      /* 7. 发布者标记已归还，信息沉底、状态文案跟着变 */
      clock.tick();
      var done = store.markDone(id, T.ME);
      assert.isTrue(done.ok);
      assert.strictEqual(done.post.statusText, '已归还');

      var afterDone = store.getPost(id, T.OTHER);
      assert.strictEqual(afterDone.status, LF.STATUSES.DONE);
      assert.strictEqual(afterDone.doneType, 'returned');

      /* 8. 统计对得上 */
      var stats = store.getStats(T.ME);
      assert.strictEqual(stats.total, 1);
      assert.strictEqual(stats.done, 1);
      assert.strictEqual(stats.claims, 2);
    });
  });

  describe('主流程：3 次全败 → 申诉 → 同意交还', function () {
    it('整条人工审核链路一次走通', function () {
      var clock = T.makeClockStore();
      var store = clock.store;

      var created = store.createPost({
        type: 'found', title: '藏蓝色折叠雨伞', category: 'rain',
        location: '第二食堂门口伞架', happenedAt: '2026-10-05',
        description: '雨天之后挂在伞架上没人拿。', contactName: '周同学', contactWay: 'QQ 5123678',
        questions: [
          { type: 'judge', stem: '伞柄是木头的', answer: 0 },
          { type: 'choice', stem: '伞骨有几根', options: ['6 根', '8 根'], answer: 1 },
          { type: 'judge', stem: '伞面有修补痕迹', answer: 0 }
        ]
      }, T.ME);
      assert.isTrue(created.ok, JSON.stringify(created.errors));
      var id = created.post.id;

      /* 1. 认领人连续答错 3 次 */
      for (var i = 1; i <= LF.VERIFY.MAX_ATTEMPTS; i++) {
        clock.tick();
        var res = store.submitClaim(id, [1, 0, 1], T.OTHER);
        assert.isTrue(res.ok);
        assert.isFalse(res.passed);
        assert.strictEqual(res.remaining, LF.VERIFY.MAX_ATTEMPTS - i);
      }

      /* 2. 次数用完：作答入口关闭，申诉入口打开 */
      var exhausted = store.getPost(id, T.OTHER);
      assert.strictEqual(exhausted.attemptsLeft, 0);
      assert.isFalse(exhausted.canAppeal === false);
      assert.isTrue(exhausted.canAppeal);
      assert.strictEqual(exhausted.contactWay, '');

      clock.tick();
      assert.isFalse(store.submitClaim(id, [0, 1, 0], T.OTHER).ok, '次数用完后再提交应被拦住');

      /* 3. 提交申诉 */
      clock.tick();
      var appeal = store.submitAppeal(id, {
        claimantName: '陈雨桐',
        contact: 'QQ 8845123',
        detail: '伞柄是木头的，伞骨八根，伞面上有一处我自己补过的痕迹，用的是深蓝色线'
      }, T.OTHER);
      assert.isTrue(appeal.ok, JSON.stringify(appeal.errors));

      /* 4. 申诉后不重复开放入口 */
      var pending = store.getPost(id, T.OTHER);
      assert.isTrue(pending.appealPending);
      assert.isFalse(pending.canAppeal);

      /* 5. 别人看不到申诉明细 */
      assert.isFalse(store.listAppeals(id, 'somebody_else').ok);
      assert.notInclude(JSON.stringify(store.queryPosts({})), '8845123');

      /* 6. 发布者能看到明细，并同意交还 */
      var list = store.listAppeals(id, T.ME);
      assert.isTrue(list.ok);
      assert.lengthOf(list.appeals, 1);
      assert.strictEqual(list.appeals[0].claimantName, '陈雨桐');
      assert.strictEqual(list.appeals[0].decision, 'pending');

      clock.tick();
      var decided = store.resolveAppeal(id, list.appeals[0].id, 'accepted', '细节对得上，同意交还', T.ME);
      assert.isTrue(decided.ok);
      assert.match(decided.appeal.voucher, /^CL-\d{4}-\d{4}$/);

      /* 7. 认领人拿到联系方式与线下交接编号 */
      var finalView = store.getPost(id, T.OTHER);
      assert.strictEqual(finalView.contactWay, 'QQ 5123678');
      assert.strictEqual(finalView.voucher, decided.appeal.voucher);
      assert.isFalse(finalView.canAppeal);
      assert.isFalse(finalView.appealPending);

      /* 8. 统计里待处理申诉归零 */
      assert.strictEqual(store.getStats(T.ME).pendingAppeals, 0);
    });

    it('驳回则联系方式保持锁定，并把理由回给申诉人', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, {});
      for (var i = 0; i < LF.VERIFY.MAX_ATTEMPTS; i++) store.submitClaim(p.id, T.wrongAnswers(), T.OTHER);
      var appeal = store.submitAppeal(p.id, {
        claimantName: '某人', contact: 'QQ 12345678',
        detail: '这把伞是我的，伞柄是木头的，伞骨一共八根，请核对'
      }, T.OTHER);
      assert.isTrue(appeal.ok);

      var res = store.resolveAppeal(p.id, appeal.appeal.id, 'rejected', '你描述的伞柄材质和实物不一致', T.ME);
      assert.isTrue(res.ok);
      assert.strictEqual(store.getPost(p.id, T.OTHER).contactWay, '', '驳回后仍然锁着');
      assert.strictEqual(store.listAppeals(p.id, T.ME).appeals[0].note, '你描述的伞柄材质和实物不一致');
    });
  });

  describe('信任模式对照：「其他」类不设门槛', function () {
    it('发布 → 浏览 → 直接看到联系方式，全程没有验证环节', function () {
      var store = T.makeStore();
      var created = store.createPost({
        type: 'found', category: 'other', title: '《高等数学》上册',
        location: '图书馆二楼阅览室', happenedAt: '2026-10-08',
        description: '扉页有名字，书里夹着公式卡片。这类书没法出验证题。',
        contactName: '吴同学', contactWay: 'QQ 3378901',
        questions: []
      }, T.ME);
      assert.isTrue(created.ok);
      var id = created.post.id;

      var view = store.getPost(id, T.OTHER);
      assert.isFalse(view.needsVerify);
      assert.strictEqual(view.contactWay, 'QQ 3378901');
      assert.strictEqual(view.contactLocked, false);
      assert.strictEqual(view.questionCount, 0);
      assert.isFalse(view.canAppeal, '没有验证就没有申诉这回事');
      assert.isFalse(store.startClaim(id, T.OTHER).ok, '不该开放认领入口');
    });

    it('搜索引导语明确写出"这一类不设验证题"', function () {
      assert.include(LF.searchHintFor('other'), '不设认领验证题');
    });
  });

  describe('寻物信息与招领信息在同一套界面里共存', function () {
    it('两种类型各自的行为都对', function () {
      var store = T.makeStore();

      var lost = store.createPost(T.validLost({ title: '我的保温杯丢了' }), T.ME);
      var found = store.createPost({
        type: 'found', title: '捡到一个保温杯', category: 'daily',
        location: '第一食堂二楼', happenedAt: '2026-10-08',
        description: '灰色，杯底有胶带。', contactName: '周同学', contactWay: 'QQ 5123678',
        questions: T.validQuestions()
      }, T.OTHER);

      assert.isTrue(lost.ok);
      assert.isTrue(found.ok);

      // 寻物：无门槛，谁都能看到联系方式
      assert.strictEqual(store.getPost(lost.post.id, T.OTHER).contactWay, '13800138000');
      assert.strictEqual(store.getPost(lost.post.id, T.OTHER).questionCount, 0);

      // 招领：有门槛
      assert.strictEqual(store.getPost(found.post.id, T.ME).contactWay, '');
      assert.strictEqual(store.getPost(found.post.id, T.ME).questionCount, 3);

      // 智能配对把两条关联起来（类型相反 + 同分类 + 标题两字重合）
      var raw = store.debugState().posts.filter(function (p) { return p.id === lost.post.id; })[0];
      var matches = store.findMatches(raw, 3);
      assert.lengthOf(matches, 1);
      assert.strictEqual(matches[0].id, found.post.id);
    });
  });

  describe('多页面接力：跳一次页面就是一个新的 store', function () {
    it('发布页 → 成功页 → 详情页 → 我的发布，数据一路都在', function () {
      var clock = T.makeClockStore();

      // 发布页
      var created = clock.store.createPost(T.validLost({ title: '跨页面接力的信息' }), T.ME);
      assert.isTrue(created.ok);

      // 成功页（新页面）
      var successPage = clock.reopen();
      assert.isNotNull(successPage.getPost(created.post.id));

      // 详情页（新页面）：看一次会加浏览量
      var detailPage = clock.reopen();
      detailPage.addView(created.post.id);

      // 我的发布（新页面）
      var minePage = clock.reopen();
      var mine = minePage.getMyPosts();
      assert.lengthOf(mine, 1);
      assert.strictEqual(mine[0].title, '跨页面接力的信息');
      assert.strictEqual(mine[0].views, 1, '浏览量也要跨页面留下');
      assert.isTrue(mine[0].isOwner, 'ownerId 持久化之后仍然认得这是"我的"');
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
