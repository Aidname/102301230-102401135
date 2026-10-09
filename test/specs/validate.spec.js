/*!
 * validate.spec.js —— 发布表单校验 & 出题规则
 *
 * 构造测试数据的思路：
 *  · **等价类划分 + 边界值**：每个长度类字段都同时测"边界内侧"和"越界一侧"。
 *    比如物品名称 2~40 字，就测 1 字（应拒）、2 字（应过）、40 字（应过）、41 字（应拒）。
 *  · **正例反例成对写**：只测"应该通过"会写出过宽的实现，只测"应该拒绝"会写出过严的实现。
 *  · **每次只动一个变量**：基准数据永远是一份必然合法的输入，每条用例只改其中一个字段。
 */
(function (root) {
  'use strict';

  var isNode = (typeof module === 'object' && module.exports);
  var T = isNode ? require('./fixtures.js') : root.T;
  var LF = T.LF;
  var assert = (isNode ? require('../lib/chai.js') : root.chai).assert;
  var repeat = function (ch, n) { return new Array(n + 1).join(ch); };

  describe('发布校验：物品名称', function () {
    it('缺失时提示必填', function () {
      var r = LF.validatePost(T.validLost({ title: '' }));
      assert.isFalse(r.ok);
      assert.isString(r.errors.title);
    });

    it('1 个字被拒绝（下边界外侧）', function () {
      assert.isFalse(LF.validatePost(T.validLost({ title: '伞' })).ok);
    });

    it('2 个字通过（下边界内侧）', function () {
      assert.isTrue(LF.validatePost(T.validLost({ title: '雨伞' })).ok);
    });

    it('40 个字通过（上边界内侧）', function () {
      assert.isTrue(LF.validatePost(T.validLost({ title: repeat('伞', 40) })).ok);
    });

    it('41 个字被拒绝（上边界外侧）', function () {
      assert.isFalse(LF.validatePost(T.validLost({ title: repeat('伞', 41) })).ok);
    });

    it('首尾空白会被清理，而不是当成有效内容', function () {
      var r = LF.validatePost(T.validLost({ title: '   雨伞   ' }));
      assert.isTrue(r.ok);
      assert.strictEqual(r.value.title, '雨伞');
    });

    it('清理时保留用户写的内容，不做全角转半角', function () {
      var r = LF.validatePost(T.validLost({ title: 'ＡＢＣ雨伞' }));
      assert.isTrue(r.ok);
      assert.strictEqual(r.value.title, 'ＡＢＣ雨伞');
    });
  });

  describe('发布校验：类型与分类', function () {
    it('类型缺失时报错', function () {
      assert.isFalse(LF.validatePost(T.validLost({ type: '' })).ok);
    });

    it('类型不在枚举内时报错', function () {
      assert.isFalse(LF.validatePost(T.validLost({ type: 'unknown' })).ok);
    });

    it('分类缺失时报错', function () {
      var r = LF.validatePost(T.validLost({ category: '' }));
      assert.isFalse(r.ok);
      assert.isString(r.errors.category);
    });

    it('分类不在字典里时报错', function () {
      assert.isFalse(LF.validatePost(T.validLost({ category: 'no_such_category' })).ok);
    });

    it('字典里的每个分类都能通过校验', function () {
      LF.CATEGORIES.forEach(function (c) {
        var overrides = { category: c.key };
        if (c.allowVerify && c.key !== 'other') {
          var r = LF.validatePost(T.validFound(overrides));
          assert.isTrue(r.ok, '分类 ' + c.key + ' 应当可以通过：' + JSON.stringify(r.errors));
        } else {
          assert.isTrue(LF.validatePost(T.validLost(overrides)).ok, '分类 ' + c.key + ' 应当可以通过');
        }
      });
    });
  });

  describe('发布校验：地点与日期', function () {
    it('地点为空被拒绝', function () {
      assert.isFalse(LF.validatePost(T.validLost({ location: '' })).ok);
    });

    it('地点恰好 50 字通过、51 字被拒绝', function () {
      assert.isTrue(LF.validatePost(T.validLost({ location: repeat('地', 50) })).ok);
      assert.isFalse(LF.validatePost(T.validLost({ location: repeat('地', 51) })).ok);
    });

    it('日期为空被拒绝', function () {
      assert.isFalse(LF.validatePost(T.validLost({ happenedAt: '' })).ok);
    });

    it('明天被拒绝（不允许未来日期）', function () {
      var r = LF.validatePost(T.validLost({ happenedAt: '2026-10-10', now: T.NOW }));
      assert.isFalse(r.ok);
      assert.include(r.errors.happenedAt, '不能晚于今天');
    });

    it('今天通过（上边界内侧）', function () {
      assert.isTrue(LF.validatePost(T.validLost({ happenedAt: '2026-10-09', now: T.NOW })).ok);
    });

    it('格式不正确的日期被拒绝', function () {
      assert.isFalse(LF.validatePost(T.validLost({ happenedAt: '2026/10/08', now: T.NOW })).ok);
    });

    it('不存在的日期（2 月 30 日）被拒绝', function () {
      assert.isFalse(LF.validatePost(T.validLost({ happenedAt: '2026-02-30', now: T.NOW })).ok);
    });

    it('闰年的 2 月 29 日通过', function () {
      assert.isTrue(LF.validatePost(T.validLost({ happenedAt: '2024-02-29', now: T.NOW })).ok);
    });
  });

  describe('发布校验：描述与联系方式', function () {
    it('描述可以为空（选填）', function () {
      assert.isTrue(LF.validatePost(T.validLost({ description: '' })).ok);
    });

    it('描述恰好 200 字通过、201 字被拒绝', function () {
      assert.isTrue(LF.validatePost(T.validLost({ description: repeat('描', 200) })).ok);
      assert.isFalse(LF.validatePost(T.validLost({ description: repeat('描', 201) })).ok);
    });

    it('描述里的换行会被保留（cleanMultiline 不是 clean）', function () {
      var r = LF.validatePost(T.validLost({ description: '第一行\n第二行' }));
      assert.include(r.value.description, '\n');
    });

    it('称呼为空被拒绝', function () {
      assert.isFalse(LF.validatePost(T.validLost({ contactName: '' })).ok);
    });

    it('称呼 20 字通过、21 字被拒绝', function () {
      assert.isTrue(LF.validatePost(T.validLost({ contactName: repeat('名', 20) })).ok);
      assert.isFalse(LF.validatePost(T.validLost({ contactName: repeat('名', 21) })).ok);
    });

    it('手机号形态的联系方式通过', function () {
      assert.isTrue(LF.validatePost(T.validLost({ contactWay: '13912345678' })).ok);
    });

    it('QQ 号形态的联系方式通过', function () {
      assert.isTrue(LF.validatePost(T.validLost({ contactWay: 'QQ 8845123' })).ok);
      assert.isTrue(LF.validatePost(T.validLost({ contactWay: '8845123' })).ok);
    });

    it('邮箱形态的联系方式通过', function () {
      assert.isTrue(LF.validatePost(T.validLost({ contactWay: 'lin@fzu.edu.cn' })).ok);
    });

    it('微信号形态的联系方式通过', function () {
      assert.isTrue(LF.validatePost(T.validLost({ contactWay: '微信 linfeng_2023' })).ok);
    });

    it('太短的联系方式被拒绝', function () {
      assert.isFalse(LF.validatePost(T.validLost({ contactWay: '12' })).ok);
    });

    it('既不是手机号也不是 QQ / 微信 / 邮箱的内容被拒绝', function () {
      var r = LF.validatePost(T.validLost({ contactWay: '你猜猜看呀哈哈' }));
      assert.isFalse(r.ok);
      assert.isString(r.errors.contactWay);
    });

    it('联系方式为空被拒绝', function () {
      assert.isFalse(LF.validatePost(T.validLost({ contactWay: '' })).ok);
    });
  });

  describe('发布校验：照片', function () {
    it('空照片通过', function () {
      assert.isTrue(LF.validatePost(T.validLost({ photo: '' })).ok);
    });

    it('非 dataURL 的内容被拒绝（挡住直接塞外部链接）', function () {
      assert.isFalse(LF.validatePost(T.validLost({ photo: 'http://example.com/a.jpg' })).ok);
    });

    it('超过 400KB 的 dataURL 被拒绝', function () {
      var big = 'data:image/jpeg;base64,' + repeat('A', 420 * 1024);
      var r = LF.validatePost(T.validLost({ photo: big }));
      assert.isFalse(r.ok);
      assert.isString(r.errors.photo);
    });
  });

  describe('出题规则：题量与题型', function () {
    it('招领 + 需要验证的分类：少于 3 道被拒绝', function () {
      var r = LF.validatePost(T.validFound({ questions: T.validQuestions().slice(0, 2) }));
      assert.isFalse(r.ok);
      assert.isString(r.errors.questions);
    });

    it('招领 + 需要验证的分类：恰好 3 道通过', function () {
      assert.isTrue(LF.validatePost(T.validFound({ questions: T.validQuestions() })).ok);
    });

    it('招领 + 需要验证的分类：恰好 5 道通过', function () {
      var qs = T.validQuestions().concat([
        { type: 'judge', stem: '伞套还在吗', answer: 1 },
        { type: 'choice', stem: '伞的长度是', options: ['短柄', '长柄'], answer: 0 }
      ]);
      assert.isTrue(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('招领 + 需要验证的分类：6 道被拒绝', function () {
      var qs = T.validQuestions().concat([
        { type: 'judge', stem: '第四题题干', answer: 1 },
        { type: 'judge', stem: '第五题题干', answer: 0 },
        { type: 'judge', stem: '第六题题干', answer: 0 }
      ]);
      assert.isFalse(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('题干过短（1 字）被拒绝', function () {
      var qs = T.validQuestions();
      qs[0].stem = '伞';
      assert.isFalse(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('题干恰好 60 字通过、61 字被拒绝', function () {
      var qs = T.validQuestions();
      qs[0].stem = repeat('题', 60);
      assert.isTrue(LF.validatePost(T.validFound({ questions: qs })).ok);
      qs[0].stem = repeat('题', 61);
      assert.isFalse(LF.validatePost(T.validFound({ questions: qs })).ok);
    });
  });

  describe('出题规则：选项', function () {
    it('选择题少于 2 个有效选项被拒绝', function () {
      var qs = T.validQuestions();
      qs[2].options = ['6 根', ''];
      assert.isFalse(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('选择题 2 个选项通过（下边界）', function () {
      var qs = T.validQuestions();
      qs[2].options = ['6 根', '8 根'];
      qs[2].answer = 0;
      assert.isTrue(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('选择题 4 个选项通过（上边界）', function () {
      var qs = T.validQuestions();
      qs[2].options = ['6 根', '8 根', '10 根', '12 根'];
      qs[2].answer = 3;
      assert.isTrue(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('同一题有重复选项被拒绝（认领人无法区分）', function () {
      var qs = T.validQuestions();
      qs[2].options = ['8 根', '8 根'];
      assert.isFalse(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('只差全角/大小写的重复选项同样被拒绝', function () {
      var qs = T.validQuestions();
      qs[2].options = ['Type-C', 'Ｔｙｐｅ－Ｃ'];
      assert.isFalse(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('选项超过 20 字被拒绝', function () {
      var qs = T.validQuestions();
      qs[2].options = ['6 根', repeat('长', 21)];
      assert.isFalse(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('没有指定正确答案被拒绝', function () {
      var qs = T.validQuestions();
      qs[2].answer = -1;
      var r = LF.validatePost(T.validFound({ questions: qs }));
      assert.isFalse(r.ok);
    });

    it('正确答案下标越界被拒绝', function () {
      var qs = T.validQuestions();
      qs[2].answer = 99;
      assert.isFalse(LF.validatePost(T.validFound({ questions: qs })).ok);
    });

    it('空选项行被丢掉后，正确答案下标跟着重排', function () {
      var normalized = LF.normalizeQuestions([
        { type: 'choice', stem: '伞骨有几根', options: ['6 根', '', '8 根'], answer: 2 }
      ]);
      assert.deepEqual(normalized.questions[0].options, ['6 根', '8 根']);
      assert.strictEqual(normalized.questions[0].answer, 1, '原来指向第 3 项，丢掉空行后应指向第 2 项');
    });

    it('判断题的选项由数据层固定为「正确 / 错误」，发布者传什么都不算数', function () {
      var normalized = LF.normalizeQuestions([
        { type: 'judge', stem: '伞柄是木头的', options: ['是', '否', '不确定'], answer: 2 }
      ]);
      assert.deepEqual(normalized.questions[0].options, LF.VERIFY.JUDGE_OPTIONS);
    });
  });

  describe('出题禁区：哪些情况不该出题', function () {
    it('寻物信息带题目时，题目会被丢弃而不是报错', function () {
      var r = LF.validatePost(T.validLost({ questions: T.validQuestions() }));
      assert.isTrue(r.ok);
      assert.strictEqual(r.value.questions.length, 0, '寻物信息不该带验证题');
    });

    it('「其他」类带题目时，题目会被丢弃', function () {
      var r = LF.validatePost(T.validFound({ category: 'other', questions: T.validQuestions() }));
      assert.isTrue(r.ok);
      assert.strictEqual(r.value.questions.length, 0);
    });

    it('「其他」类不带题目时能正常通过（信任模式）', function () {
      var r = LF.validatePost(T.validFound({ category: 'other', questions: [] }));
      assert.isTrue(r.ok);
    });

    it('allowVerifyFor 返回三态：有特征 true / 无特征 false / 字典外 null', function () {
      assert.isTrue(LF.allowVerifyFor('rain'));
      assert.isFalse(LF.allowVerifyFor('other'));
      assert.isNull(LF.allowVerifyFor('no_such_category'));
    });

    it('分类不在字典里时，不再叠加一条用户改不掉的"请至少出 3 道题"', function () {
      var r = LF.validatePost(T.validFound({ category: 'no_such_category', questions: [] }));
      assert.isFalse(r.ok);
      assert.isString(r.errors.category);
      assert.isUndefined(r.errors.questions, '分类已经报错了，不该再叠一条出题报错');
    });
  });

  describe('选项清晰度提示（只提示、不拦截）', function () {
    it('同一色系的深浅会被提示', function () {
      var w = LF.checkOptionClarity(['深蓝色', '藏青色', '黑色']);
      assert.isAbove(w.length, 0);
    });

    it('能分清的深浅不会被误报', function () {
      var w = LF.checkOptionClarity(['深蓝色', '浅蓝色']);
      assert.lengthOf(w, 0, '深蓝和浅蓝属于不同色系，不该拦');
    });

    it('完全不相关的选项不会误报', function () {
      assert.lengthOf(LF.checkOptionClarity(['6 根', '8 根', '10 根']), 0);
    });

    it('提示只是提示：带易混选项的题目仍然可以发布', function () {
      var qs = T.validQuestions();
      qs[2].options = ['深蓝色', '藏青色'];
      qs[2].answer = 0;
      assert.isTrue(LF.validatePost(T.validFound({ questions: qs })).ok);
    });
  });

  describe('搜索引导语与分类字典的一致性', function () {
    it('每个分类都要有一条引导语', function () {
      LF.CATEGORIES.forEach(function (c) {
        assert.isString(LF.searchHintFor(c.key));
        assert.isAbove(LF.searchHintFor(c.key).length, 0, '分类 ' + c.key + ' 缺少 searchHint');
      });
    });

    it('字典外的分类返回空串，页面据此隐藏整块提示', function () {
      assert.strictEqual(LF.searchHintFor('no_such_category'), '');
    });

    it('允许出题的分类都要有出题模板（降低发布者的出题门槛）', function () {
      LF.CATEGORIES.forEach(function (c) {
        if (c.allowVerify) {
          assert.isAbove(c.templates.length, 0, '分类 ' + c.key + ' 允许出题却没有模板');
        } else {
          assert.lengthOf(c.templates, 0, '不出题的分类不该有模板');
        }
      });
    });

    it('出题模板本身要合法（能直接插进去用）', function () {
      LF.CATEGORIES.forEach(function (c) {
        c.templates.forEach(function (t) {
          assert.include(['judge', 'choice'], t.type);
          if (t.type === 'choice') {
            assert.isAtLeast(t.options.length, LF.VERIFY.MIN_OPTIONS);
            assert.isAtMost(t.options.length, LF.VERIFY.MAX_OPTIONS);
          }
          assert.isAtLeast(t.stem.length, LF.VERIFY.MIN_STEM);
        });
      });
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
