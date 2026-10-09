/*!
 * verify.spec.js —— 认领验证与申诉（本项目的核心机制）
 *
 * 这个文件里最重要的两条断言，是针对**设计决策**而不是功能的：
 *
 *  ① **全错和只错一题，返回给前端的东西必须一模一样。**
 *     这是这一版机制的核心承诺。第一版为了让失主知道错在哪，必须回传错题下标；
 *     结果冒领者每答错一次就排除一个选项，3 次机会足够把答案试出来。
 *     把"结构完全一致"写成用例，将来谁为了"提升体验"把错题信息加回来，这里会立刻变红。
 *
 *  ② **未答完提交不消耗次数。**
 *     否则用户会被自己的手滑消耗掉机会，而这是我们能替他挡住的。
 */
(function (root) {
  'use strict';

  var isNode = (typeof module === 'object' && module.exports);
  var T = isNode ? require('./fixtures.js') : root.T;
  var LF = T.LF;
  var assert = (isNode ? require('../lib/chai.js') : root.chai).assert;

  function locked() {
    var store = T.makeStore();
    var post = T.withPost(store, T.ME, {});
    return { store: store, id: post.id };
  }

  function exhaustAttempts(c) {
    for (var i = 0; i < LF.VERIFY.MAX_ATTEMPTS; i++) {
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
    }
  }

  var VALID_APPEAL = {
    claimantName: '陈雨桐',
    contact: 'QQ 8845123',
    detail: '伞柄是木头的，伞骨八根，伞面上有一道修补痕迹，这把伞确实是我的'
  };

  describe('取题 startClaim', function () {
    it('返回全部题目（一次给完，不做分页）', function () {
      var c = locked();
      var s = c.store.startClaim(c.id, T.OTHER);
      assert.isTrue(s.ok);
      assert.lengthOf(s.questions, 3);
    });

    it('返回剩余次数与上限，供页面显示', function () {
      var c = locked();
      var s = c.store.startClaim(c.id, T.OTHER);
      assert.strictEqual(s.attemptsLeft, LF.VERIFY.MAX_ATTEMPTS);
      assert.strictEqual(s.maxAttempts, LF.VERIFY.MAX_ATTEMPTS);
    });

    it('发布者姓名在取题页也是打码的', function () {
      var c = locked();
      assert.strictEqual(c.store.startClaim(c.id, T.OTHER).contactName, '周**');
    });

    it('不需要验证的信息不给题', function () {
      var store = T.makeStore();
      var lost = T.withPost(store, T.ME, T.validLost());
      var res = store.startClaim(lost.id, T.OTHER);
      assert.isFalse(res.ok);
      assert.include(res.message, '不需要认领验证');
    });

    it('「其他」类不给题', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, { category: 'other', questions: [] });
      assert.isFalse(store.startClaim(p.id, T.OTHER).ok);
    });

    it('已经通过验证后再取题会被提示', function () {
      var c = locked();
      c.store.submitClaim(c.id, T.correctAnswers(), T.OTHER);
      var res = c.store.startClaim(c.id, T.OTHER);
      assert.isFalse(res.ok);
      assert.include(res.message, '你已经通过验证');
    });

    it('不存在的 id 返回友好提示而不是抛异常', function () {
      var c = locked();
      assert.doesNotThrow(function () { c.store.startClaim('no_such_id', T.OTHER); });
      assert.isFalse(c.store.startClaim('no_such_id', T.OTHER).ok);
    });
  });

  describe('未答完就提交：不消耗次数', function () {
    it('返回"还有几道题没有作答"', function () {
      var c = locked();
      var res = c.store.submitClaim(c.id, [0, null, 1], T.OTHER);
      assert.isFalse(res.ok);
      assert.include(res.message, '还有 1 道题没有作答');
      assert.include(res.message, '不计入作答次数');
    });

    it('次数保持不变', function () {
      var c = locked();
      c.store.submitClaim(c.id, [0, null, 1], T.OTHER);
      assert.strictEqual(c.store.getPost(c.id).attemptsLeft, LF.VERIFY.MAX_ATTEMPTS);
    });

    it('一道都没选也算未答完', function () {
      var c = locked();
      var res = c.store.submitClaim(c.id, [], T.OTHER);
      assert.isFalse(res.ok);
      assert.include(res.message, '3 道题');
      assert.strictEqual(c.store.getPost(c.id).attemptsLeft, LF.VERIFY.MAX_ATTEMPTS);
    });

    it('用空字符串占位同样算未作答', function () {
      var c = locked();
      assert.isFalse(c.store.submitClaim(c.id, ['', '', ''], T.OTHER).ok);
      assert.strictEqual(c.store.getPost(c.id).attemptsLeft, LF.VERIFY.MAX_ATTEMPTS);
    });

    it('作答数组比题目短时，缺的部分算未作答', function () {
      var c = locked();
      var res = c.store.submitClaim(c.id, [0], T.OTHER);
      assert.isFalse(res.ok);
      assert.strictEqual(c.store.getPost(c.id).attemptsLeft, LF.VERIFY.MAX_ATTEMPTS);
    });
  });

  describe('统一判定：只回「通过 / 不通过」', function () {
    it('答对全部题目即通过，并生成 CL- 开头的凭证码', function () {
      var c = locked();
      var res = c.store.submitClaim(c.id, T.correctAnswers(), T.OTHER);
      assert.isTrue(res.ok);
      assert.isTrue(res.passed);
      assert.match(res.voucher, /^CL-\d{4}-\d{4}$/);
    });

    it('答对不消耗次数', function () {
      var c = locked();
      c.store.submitClaim(c.id, T.correctAnswers(), T.OTHER);
      assert.strictEqual(c.store.getPost(c.id).attemptsLeft, LF.VERIFY.MAX_ATTEMPTS);
    });

    it('失败时只回一句统一提示', function () {
      var c = locked();
      var res = c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      assert.isTrue(res.ok);
      assert.isFalse(res.passed);
      assert.strictEqual(res.message, '回答的细节与描述不符');
    });

    it('失败结果里没有 failed / 错题下标这类字段', function () {
      var c = locked();
      var res = c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      assert.notProperty(res, 'failed');
      assert.notProperty(res, 'wrongIndexes');
      assert.notProperty(res, 'correct');
    });

    it('★ 全错和只错一题，返回的对象结构完全一样', function () {
      var c1 = locked();
      var allWrong = c1.store.submitClaim(c1.id, T.wrongAnswers(), T.OTHER);

      var c2 = locked();
      // 只把第一题改错
      var onlyOneWrong = T.correctAnswers();
      onlyOneWrong[0] = 1 - onlyOneWrong[0];
      var oneWrong = c2.store.submitClaim(c2.id, onlyOneWrong, T.OTHER);

      assert.deepEqual(Object.keys(allWrong).sort(), Object.keys(oneWrong).sort(),
        '两种失败情况返回的键集合必须完全一致');
      assert.strictEqual(allWrong.message, oneWrong.message);
      assert.strictEqual(JSON.stringify(allWrong), JSON.stringify(oneWrong),
        '序列化后也必须一模一样——否则前端就能从差异里推断出答对了几题');
    });

    it('失败结果序列化后连题号都不出现', function () {
      var c = locked();
      var json = JSON.stringify(c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER));
      assert.notInclude(json, 'q1');
      assert.notInclude(json, 'stem');
    });

    it('每次失败扣一次次数', function () {
      var c = locked();
      assert.strictEqual(c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER).remaining, 2);
      assert.strictEqual(c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER).remaining, 1);
      assert.strictEqual(c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER).remaining, 0);
    });

    it('次数用完后再提交会被拦住，并指向申诉', function () {
      var c = locked();
      exhaustAttempts(c);
      var res = c.store.submitClaim(c.id, T.correctAnswers(), T.OTHER);
      assert.isFalse(res.ok);
      assert.isTrue(res.locked);
      assert.include(res.message, '申诉');
    });

    it('发布者能看到每条认领的对错，但这条数据只走 listClaims 那一侧', function () {
      var c = locked();
      // 先答错再答对：答对之后信息就解锁了，此后再提交会被拦住，所以顺序不能反
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      c.store.submitClaim(c.id, T.correctAnswers(), T.OTHER);
      var raw = c.store.debugState().posts[0];
      assert.lengthOf(raw.claims, 2);
      assert.isTrue(raw.claims[0].passed, '最新一条是答对的那次');
      assert.isFalse(raw.claims[1].passed, '更早一条是答错的那次');
      assert.strictEqual(raw.claims[0].voucher, c.store.getPost(c.id, T.OTHER).voucher);
    });
  });

  describe('申诉解锁条件', function () {
    it('次数没用完不能申诉', function () {
      var c = locked();
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      var res = c.store.submitAppeal(c.id, VALID_APPEAL, T.OTHER);
      assert.isFalse(res.ok);
      assert.include(res.message, '还剩 2 次');
    });

    it('一次都没答过更不能申诉', function () {
      var c = locked();
      assert.isFalse(c.store.submitAppeal(c.id, VALID_APPEAL, T.OTHER).ok);
    });

    it('canAppeal 在次数大于 0 时恒为 false', function () {
      var c = locked();
      assert.isFalse(c.store.getPost(c.id, T.OTHER).canAppeal);
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      assert.isFalse(c.store.getPost(c.id, T.OTHER).canAppeal);
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      assert.isFalse(c.store.getPost(c.id, T.OTHER).canAppeal);
    });

    it('答满 3 次后 canAppeal 才变成 true', function () {
      var c = locked();
      exhaustAttempts(c);
      assert.isTrue(c.store.getPost(c.id, T.OTHER).canAppeal);
    });

    it('发布者自己没有申诉入口', function () {
      var c = locked();
      exhaustAttempts(c);
      assert.isFalse(c.store.getPost(c.id, T.ME).canAppeal);
    });

    it('已通过验证的信息没有申诉入口', function () {
      var c = locked();
      c.store.submitClaim(c.id, T.correctAnswers(), T.OTHER);
      assert.isFalse(c.store.getPost(c.id, T.OTHER).canAppeal);
    });

    it('已经提交过申诉后不再重复开放入口', function () {
      var c = locked();
      exhaustAttempts(c);
      c.store.submitAppeal(c.id, VALID_APPEAL, T.OTHER);
      var view = c.store.getPost(c.id, T.OTHER);
      assert.isFalse(view.canAppeal);
      assert.isTrue(view.appealPending);
    });
  });

  describe('申诉表单校验', function () {
    it('称呼为空被拒绝', function () {
      var c = locked(); exhaustAttempts(c);
      var res = c.store.submitAppeal(c.id, T.merge(VALID_APPEAL, { claimantName: '' }), T.OTHER);
      assert.isFalse(res.ok);
      assert.isString(res.errors.claimantName);
    });

    it('联系方式为空被拒绝', function () {
      var c = locked(); exhaustAttempts(c);
      var res = c.store.submitAppeal(c.id, T.merge(VALID_APPEAL, { contact: '' }), T.OTHER);
      assert.isFalse(res.ok);
      assert.isString(res.errors.contact);
    });

    it('联系方式不像可用形态时被拒绝', function () {
      var c = locked(); exhaustAttempts(c);
      var res = c.store.submitAppeal(c.id, T.merge(VALID_APPEAL, { contact: '你猜' }), T.OTHER);
      assert.isFalse(res.ok);
      assert.isString(res.errors.contact);
    });

    it('细节描述过短被拒绝（挡住"就是我的"这类无信息量的申诉）', function () {
      var c = locked(); exhaustAttempts(c);
      var res = c.store.submitAppeal(c.id, T.merge(VALID_APPEAL, { detail: '我的' }), T.OTHER);
      assert.isFalse(res.ok);
      assert.isString(res.errors.detail);
    });

    it('细节描述 10 字通过（下边界）、9 字被拒', function () {
      var c1 = locked(); exhaustAttempts(c1);
      assert.isTrue(c1.store.submitAppeal(c1.id,
        T.merge(VALID_APPEAL, { detail: '伞柄是木头的伞骨八根' }), T.OTHER).ok);
      var c2 = locked(); exhaustAttempts(c2);
      assert.isFalse(c2.store.submitAppeal(c2.id,
        T.merge(VALID_APPEAL, { detail: '伞柄是木头的伞骨八' }), T.OTHER).ok);
    });

    it('细节描述 300 字通过、301 字被拒', function () {
      var ch = function (n) { return new Array(n + 1).join('细'); };
      var c1 = locked(); exhaustAttempts(c1);
      assert.isTrue(c1.store.submitAppeal(c1.id, T.merge(VALID_APPEAL, { detail: ch(300) }), T.OTHER).ok);
      var c2 = locked(); exhaustAttempts(c2);
      assert.isFalse(c2.store.submitAppeal(c2.id, T.merge(VALID_APPEAL, { detail: ch(301) }), T.OTHER).ok);
    });

    it('合法申诉能落库，并且带 pending 状态', function () {
      var c = locked(); exhaustAttempts(c);
      var res = c.store.submitAppeal(c.id, VALID_APPEAL, T.OTHER);
      assert.isTrue(res.ok);
      assert.strictEqual(res.appeal.decision, 'pending');
      assert.isString(res.appeal.id);
    });
  });

  describe('发布者处理申诉', function () {
    function withAppeal() {
      var c = locked();
      exhaustAttempts(c);
      var res = c.store.submitAppeal(c.id, VALID_APPEAL, T.OTHER);
      return { store: c.store, id: c.id, appealId: res.appeal.id };
    }

    it('同意交还会解锁联系方式并生成交接编号', function () {
      var c = withAppeal();
      var res = c.store.resolveAppeal(c.id, c.appealId, 'accepted', '', T.ME);
      assert.isTrue(res.ok);
      assert.match(res.appeal.voucher, /^CL-\d{4}-\d{4}$/);
      assert.strictEqual(c.store.getPost(c.id, T.OTHER).contactWay, 'QQ 5123678');
    });

    it('驳回不解锁联系方式', function () {
      var c = withAppeal();
      var res = c.store.resolveAppeal(c.id, c.appealId, 'rejected', '你描述的划痕和实物不一致', T.ME);
      assert.isTrue(res.ok);
      assert.strictEqual(res.appeal.voucher, '');
      assert.strictEqual(c.store.getPost(c.id, T.OTHER).contactWay, '');
    });

    it('驳回理由会回给申诉人（发布者不用再想办法解释）', function () {
      var c = withAppeal();
      c.store.resolveAppeal(c.id, c.appealId, 'rejected', '你描述的划痕和实物不一致', T.ME);
      var appeals = c.store.listAppeals(c.id, T.ME).appeals;
      assert.strictEqual(appeals[0].note, '你描述的划痕和实物不一致');
    });

    it('同一条申诉不能处理两次', function () {
      var c = withAppeal();
      c.store.resolveAppeal(c.id, c.appealId, 'accepted', '', T.ME);
      var again = c.store.resolveAppeal(c.id, c.appealId, 'rejected', '', T.ME);
      assert.isFalse(again.ok);
      assert.include(again.message, '已经处理过');
    });

    it('处理结果只能是 accepted / rejected', function () {
      var c = withAppeal();
      assert.isFalse(c.store.resolveAppeal(c.id, c.appealId, 'whatever', '', T.ME).ok);
    });

    it('不存在的申诉 id 返回友好提示', function () {
      var c = withAppeal();
      var res = c.store.resolveAppeal(c.id, 'no_such_appeal', 'accepted', '', T.ME);
      assert.isFalse(res.ok);
    });

    it('处理后申诉条目保留在明细里（有据可查）', function () {
      var c = withAppeal();
      c.store.resolveAppeal(c.id, c.appealId, 'accepted', '核对通过', T.ME);
      var list = c.store.listAppeals(c.id, T.ME).appeals;
      assert.lengthOf(list, 1);
      assert.strictEqual(list[0].decision, 'accepted');
      assert.isNotNull(list[0].decidedAt);
    });
  });

  describe('发布者换题：重新给满次数', function () {
    it('改了题目之后 attemptsLeft 重置为 3', function () {
      var c = locked();
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      assert.strictEqual(c.store.getPost(c.id).attemptsLeft, 1);

      var newQuestions = [
        { type: 'judge', stem: '雨伞是自动伞', answer: 0 },
        { type: 'judge', stem: '伞套还在', answer: 1 },
        { type: 'choice', stem: '伞面颜色是', options: ['藏蓝', '墨绿', '黑色'], answer: 0 }
      ];
      var res = c.store.updatePost(c.id, { questions: newQuestions }, T.ME);
      assert.isTrue(res.ok);
      assert.strictEqual(res.post.attemptsLeft, LF.VERIFY.MAX_ATTEMPTS);
    });

    it('改了题目之后旧的认领记录被清空（对不上新题了）', function () {
      var c = locked();
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      var newQuestions = T.validQuestions();
      newQuestions[0].stem = '完全不同的题干内容';
      c.store.updatePost(c.id, { questions: newQuestions }, T.ME);
      assert.strictEqual(c.store.getPost(c.id).claimCount, 0);
    });

    it('只改标题不会重置次数（不是所有编辑都该重置）', function () {
      var c = locked();
      c.store.submitClaim(c.id, T.wrongAnswers(), T.OTHER);
      c.store.updatePost(c.id, { title: '新的标题内容' }, T.ME);
      assert.strictEqual(c.store.getPost(c.id).attemptsLeft, LF.VERIFY.MAX_ATTEMPTS - 1);
    });

    it('改成「其他」类后，题目被清空、门槛消失', function () {
      var c = locked();
      var res = c.store.updatePost(c.id, { category: 'other' }, T.ME);
      assert.isTrue(res.ok);
      assert.strictEqual(res.post.questionCount, 0);
      assert.isFalse(res.post.needsVerify);
      assert.strictEqual(c.store.getPost(c.id, T.OTHER).contactWay, 'QQ 5123678',
        '「其他」类走信任模式，联系方式应直接可见');
    });

    it('从「其他」类改回有特征的分类时，必须重新出题才能发布', function () {
      var store = T.makeStore();
      var p = T.withPost(store, T.ME, { category: 'other', questions: [] });
      var res = store.updatePost(p.id, { category: 'rain' }, T.ME);
      assert.isFalse(res.ok, '这一类需要出题，没出题就不该让它通过');
      assert.isString(res.errors.questions);
    });
  });

  describe('判定与文案的边界', function () {
    it('答案下标是字符串 "0" 时也能判对（表单传过来的就是字符串）', function () {
      var c = locked();
      var res = c.store.submitClaim(c.id, ['0', '1', '1'], T.OTHER);
      assert.isTrue(res.passed);
    });

    it('答案越界（选了不存在的选项）判为错误而不是抛异常', function () {
      var c = locked();
      assert.doesNotThrow(function () { c.store.submitClaim(c.id, [9, 8, 7], T.OTHER); });
      assert.isFalse(c.store.submitClaim(c.id, [9, 8, 7], T.OTHER).passed);
    });

    it('只错最后一题也算失败', function () {
      var c = locked();
      var answers = T.correctAnswers();
      answers[2] = 2;
      assert.isFalse(c.store.submitClaim(c.id, answers, T.OTHER).passed);
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
