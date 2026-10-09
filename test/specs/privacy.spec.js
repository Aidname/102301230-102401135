/*!
 * privacy.spec.js —— 防冒领的第一道闸门：公开视图里到底有什么
 *
 * 这个文件测的是整个项目里**最容易被改坏、而且改坏了看不出来**的一段逻辑。
 *
 * 如果哪天有人为了"提升体验"把正确答案加回公开视图，界面上不会有任何异常，
 * 但防冒领机制已经形同虚设了。所以这里的断言刻意针对**数据**而不是界面：
 *   · 题目对象没有 answer 属性；
 *   · 整个视图 JSON 序列化之后搜不到 "answer" 字样；
 *   · claims / appeals 这两个键**根本不存在**（而不是值为空）。
 * 这样将来谁把它加回来，用例会立刻变红。
 */
(function (root) {
  'use strict';

  var isNode = (typeof module === 'object' && module.exports);
  var T = isNode ? require('./fixtures.js') : root.T;
  var LF = T.LF;
  var assert = (isNode ? require('../lib/chai.js') : root.chai).assert;

  function storeWithLocked() {
    var store = T.makeStore();
    var post = T.withPost(store, T.ME, {});
    return { store: store, post: post, id: post.id };
  }

  describe('公开视图：正确答案不外泄', function () {
    it('单条公开视图里没有 answer 字段', function () {
      var c = storeWithLocked();
      var view = c.store.getPost(c.id, T.OTHER);
      assert.strictEqual(view.questionCount, 3);
      // 公开视图本身就不带题目数组，取题要走 startClaim
      assert.isUndefined(view.questions);
    });

    it('startClaim 下发的题目只有题干和选项', function () {
      var c = storeWithLocked();
      var session = c.store.startClaim(c.id, T.OTHER);
      assert.isTrue(session.ok);
      session.questions.forEach(function (q) {
        assert.isUndefined(q.answer, '题目里不能带正确答案');
        assert.isArray(q.options);
        assert.isString(q.stem);
        assert.isString(q.typeName);
      });
    });

    it('整份取题结果的 JSON 序列化里搜不到 answer 字样', function () {
      var c = storeWithLocked();
      var session = c.store.startClaim(c.id, T.OTHER);
      assert.notInclude(JSON.stringify(session), 'answer');
    });

    it('列表视图的 JSON 里同样搜不到 answer', function () {
      var store = T.makeStore();
      T.withPost(store, T.ME, {});
      assert.notInclude(JSON.stringify(store.queryPosts({})), 'answer');
    });

    it('发布者自己看也要走同一套公开视图（答案不在视图里，而在 debugState 里）', function () {
      var c = storeWithLocked();
      var view = c.store.getPost(c.id, T.ME);
      assert.notInclude(JSON.stringify(view), 'answer');
    });
  });

  describe('公开视图：认领记录与申诉明细不外泄', function () {
    it('公开视图里根本没有 claims 这个键', function () {
      var c = storeWithLocked();
      var view = c.store.getPost(c.id, T.OTHER);
      assert.notProperty(view, 'claims');
    });

    it('公开视图里根本没有 appeals 这个键', function () {
      var c = storeWithLocked();
      var view = c.store.getPost(c.id, T.OTHER);
      assert.notProperty(view, 'appeals');
    });

    it('反复答题之后，公开视图里仍然搜不到申诉人的信息', function () {
      var c = storeWithLocked();
      var answers = T.wrongAnswers();
      // 先加两道题凑够 3 次失败
      for (var i = 0; i < LF.VERIFY.MAX_ATTEMPTS; i++) c.store.submitClaim(c.id, answers, T.OTHER);
      c.store.submitAppeal(c.id, {
        claimantName: '陈雨桐', contact: 'QQ 8845123',
        detail: '伞柄是木头的，伞骨八根，伞面上有一道明显的补痕，这把伞是我的'
      }, T.OTHER);
      var view = c.store.getPost(c.id, T.OTHER);
      var json = JSON.stringify(view);
      assert.notInclude(json, '陈雨桐');
      assert.notInclude(json, '8845123');
      assert.notProperty(view, 'appeals');
    });

    it('非发布者调 listAppeals 会被拒绝（是数据层拒绝，不是界面隐藏）', function () {
      var c = storeWithLocked();
      var res = c.store.listAppeals(c.id, T.OTHER);
      assert.isFalse(res.ok);
      assert.lengthOf(res.appeals, 0);
    });

    it('发布者能看到申诉明细', function () {
      var c = storeWithLocked();
      for (var i = 0; i < LF.VERIFY.MAX_ATTEMPTS; i++) c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      c.store.submitAppeal(c.id, {
        claimantName: '陈雨桐', contact: 'QQ 8845123',
        detail: '伞柄是木头的，伞骨八根，这把伞确实是我的，谢谢'
      }, T.OTHER);
      var res = c.store.listAppeals(c.id, T.ME);
      assert.isTrue(res.ok);
      assert.lengthOf(res.appeals, 1);
      assert.strictEqual(res.appeals[0].claimantName, '陈雨桐');
    });

    it('非发布者拿到的认领条数是 0（连"有多少人试过"都不透露）', function () {
      var c = storeWithLocked();
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      assert.strictEqual(c.store.getPost(c.id, T.OTHER).claimCount, 0);
      assert.strictEqual(c.store.getPost(c.id, T.ME).claimCount, 1);
    });
  });

  describe('公开视图：联系方式只在该给的时候才进页面', function () {
    it('未解锁时 contactWay 是空串，而不是被前端藏起来的文本', function () {
      var c = storeWithLocked();
      var view = c.store.getPost(c.id, T.OTHER);
      assert.strictEqual(view.contactWay, '');
      assert.isTrue(view.contactLocked);
      assert.notInclude(JSON.stringify(view), '5123678', '联系方式不该出现在公开视图的 JSON 里');
    });

    it('未解锁时姓名被打码', function () {
      var c = storeWithLocked();
      assert.strictEqual(c.store.getPost(c.id, T.OTHER).contactName, '周**');
    });

    it('发布者自己看到完整姓名和联系方式', function () {
      var c = storeWithLocked();
      var view = c.store.getPost(c.id, T.ME);
      assert.strictEqual(view.contactName, '周同学');
      assert.strictEqual(view.contactWay, 'QQ 5123678');
      assert.strictEqual(view.lockState, 'owner');
    });

    it('寻物信息不需要验证：联系方式对所有访问者直接可见', function () {
      var store = T.makeStore();
      var post = T.withPost(store, T.ME, T.validLost());
      var view = store.getPost(post.id, T.OTHER);
      assert.isFalse(view.needsVerify);
      assert.strictEqual(view.lockState, 'open');
      assert.strictEqual(view.contactWay, '13800138000');
    });

    it('「其他」类招领走信任模式：没有题目，联系方式直接可见', function () {
      var store = T.makeStore();
      var post = T.withPost(store, T.ME, { category: 'other', questions: [] });
      var view = store.getPost(post.id, T.OTHER);
      assert.isFalse(view.needsVerify);
      assert.strictEqual(view.contactWay, 'QQ 5123678');
    });

    it('通过验证后 contactWay 才出现，并带上凭证码', function () {
      var c = storeWithLocked();
      var res = c.store.submitClaim(c.id, T.correctAnswers(), T.OTHER);
      assert.isTrue(res.passed);
      var view = c.store.getPost(c.id, T.OTHER);
      assert.strictEqual(view.contactWay, 'QQ 5123678');
      assert.strictEqual(view.lockState, 'unlocked');
      assert.match(view.voucher, /^CL-\d{4}-\d{4}$/);
    });

    it('姓名打码规则：单字保留、两字留首字加一星、三字留首字加两星', function () {
      assert.strictEqual(LF.maskName('张'), '张');
      assert.strictEqual(LF.maskName('张三'), '张*');
      assert.strictEqual(LF.maskName('张小明'), '张**');
      assert.strictEqual(LF.maskName(''), '');
    });

    it('其他访问者不会因为某人解锁了就一起解锁（解锁状态存在本机的 db 里）', function () {
      var c = storeWithLocked();
      c.store.submitClaim(c.id, T.correctAnswers(), T.OTHER);
      // 换一份全新的 db（模拟换一台设备）后仍然是锁着的
      var fresh = T.makeStore();
      var p = T.withPost(fresh, T.ME, {});
      assert.strictEqual(fresh.getPost(p.id, T.OTHER).contactWay, '');
    });
  });

  describe('XSS：用户输入不会被当成 HTML 执行', function () {
    it('escapeHtml 处理五种危险字符', function () {
      assert.strictEqual(LF.escapeHtml('<img src=x onerror=alert(1)>'),
        '&lt;img src=x onerror=alert(1)&gt;');
      assert.strictEqual(LF.escapeHtml('a & b'), 'a &amp; b');
      assert.strictEqual(LF.escapeHtml('"双引号"'), '&quot;双引号&quot;');
      assert.strictEqual(LF.escapeHtml("'单引号'"), '&#39;单引号&#39;');
      assert.strictEqual(LF.escapeHtml(null), '');
      assert.strictEqual(LF.escapeHtml(undefined), '');
    });

    it('高亮：先转义再包 mark，输出里不会出现原始标签', function () {
      var out = LF.highlight('<script>alert(1)</script>', 'script');
      assert.notInclude(out, '<script');
      assert.include(out, '&lt;');
      assert.include(out, '&gt;');
      assert.include(out, '<mark class="hl">script</mark>');
      // 尖括号已经变成实体，命中片段被 mark 包住——两者同时成立才是对的
      assert.include(out, '&lt;<mark class="hl">script</mark>&gt;');
    });

    it('高亮：命中片段本身也要转义', function () {
      var out = LF.highlight('a<b>c', '<b>');
      assert.notInclude(out, '<mark class="hl"><b></mark>');
    });

    it('高亮：一段文字里多处命中都会被标出来', function () {
      var out = LF.highlight('校园卡和另一张校园卡', '校园卡');
      assert.lengthOf(out.match(/<mark class="hl">/g), 2);
    });

    it('高亮：空关键词时原样转义返回', function () {
      assert.strictEqual(LF.highlight('<a>', ''), '&lt;a&gt;');
    });

    it('含 HTML 的标题可以正常发布，取回来时是原文而不是被转义过的内容', function () {
      var store = T.makeStore();
      var post = T.withPost(store, T.ME, { title: '<b>加粗的标题</b>' });
      assert.strictEqual(store.getPost(post.id).title, '<b>加粗的标题</b>');
    });
  });

  describe('越权拦截：不是自己的信息一概改不动', function () {
    it('别人不能标记完成', function () {
      var c = storeWithLocked();
      var res = c.store.markDone(c.id, T.OTHER);
      assert.isFalse(res.ok);
      assert.strictEqual(c.store.getPost(c.id).status, LF.STATUSES.ACTIVE);
    });

    it('别人不能恢复状态', function () {
      var c = storeWithLocked();
      c.store.markDone(c.id, T.ME);
      assert.isFalse(c.store.restorePost(c.id, T.OTHER).ok);
      assert.strictEqual(c.store.getPost(c.id).status, LF.STATUSES.DONE);
    });

    it('别人不能编辑', function () {
      var c = storeWithLocked();
      var res = c.store.updatePost(c.id, { title: '被篡改的标题' }, T.OTHER);
      assert.isFalse(res.ok);
      assert.strictEqual(c.store.getPost(c.id).title, '藏蓝色三折雨伞');
    });

    it('别人不能删除', function () {
      var c = storeWithLocked();
      assert.isFalse(c.store.removePost(c.id, T.OTHER).ok);
      assert.isNotNull(c.store.getPost(c.id));
    });

    it('别人不能处理申诉', function () {
      var c = storeWithLocked();
      for (var i = 0; i < LF.VERIFY.MAX_ATTEMPTS; i++) c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      c.store.submitAppeal(c.id, {
        claimantName: '某人', contact: 'QQ 12345678',
        detail: '这把伞是我的，伞柄木头，伞骨八根，请核对'
      }, T.OTHER);
      var appeals = c.store.listAppeals(c.id, T.ME).appeals;
      assert.isFalse(c.store.resolveAppeal(c.id, appeals[0].id, 'accepted', '', T.OTHER).ok);
    });

    it('发布者不能认领自己发布的信息', function () {
      var c = storeWithLocked();
      var res = c.store.submitClaim(c.id, T.correctAnswers(), T.ME);
      assert.isFalse(res.ok);
      assert.include(res.message, '自己发布');
    });
  });

  describe('受保护字段：绕过界面直接调数据层也改不动', function () {
    it('id / 编号 / 归属 / 浏览量 / 发布时间都改不了', function () {
      var c = storeWithLocked();
      var before = c.store.getPost(c.id);
      var res = c.store.updatePost(c.id, {
        id: 'hacked_id',
        code: 'HACKED',
        ownerId: 'hacker',
        views: 99999,
        createdAt: 0,
        status: LF.STATUSES.DONE,
        claims: [{ at: 0, passed: true }],
        appeals: [{ id: 'fake' }],
        attemptsLeft: 999
      }, T.ME);
      assert.isTrue(res.ok, '受保护字段应当被静默剔除，而不是让整次更新失败');
      var after = c.store.getPost(c.id);
      assert.strictEqual(after.id, before.id);
      assert.strictEqual(after.code, before.code);
      assert.strictEqual(after.views, before.views);
      assert.strictEqual(after.createdAt, before.createdAt);
      assert.strictEqual(after.status, before.status);
      assert.strictEqual(after.claimCount, before.claimCount);
      assert.strictEqual(after.attemptsLeft, before.attemptsLeft);
      // 归属没被改：原发布者仍然改得动，伪造的 owner 改不动
      assert.isTrue(c.store.removePost(c.id, T.ME).ok);
    });

    it('受保护字段之外的内容可以正常更新', function () {
      var c = storeWithLocked();
      var res = c.store.updatePost(c.id, { title: '藏蓝色五折雨伞', location: '体育馆' }, T.ME);
      assert.isTrue(res.ok);
      assert.strictEqual(res.post.title, '藏蓝色五折雨伞');
      assert.strictEqual(res.post.location, '体育馆');
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
