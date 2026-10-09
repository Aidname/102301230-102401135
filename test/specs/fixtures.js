/*!
 * fixtures.js —— 测试夹具与运行环境适配
 *
 * 不包含任何用例，只负责两件事：
 *  ① 让同一批 spec 文件**既能被 Chrome 双击 test/test.html 跑，也能被 Node 直接 require 跑**；
 *  ② 提供一份"必然合法"的基准数据 + 隔离的内存 store，
 *     这样每条用例只需要在基准上改**一个**字段，失败时出错原因就是唯一的。
 *
 * 时间固定成 2026-10-09T10:00:00。不固定的话，
 * "3 分钟前""日期不能晚于今天"这些断言会随运行时刻变化，测试就会间歇性地红。
 */
(function (root) {
  'use strict';

  var isNode = (typeof module === 'object' && module.exports);
  var LF;

  if (isNode) {
    LF = require('../../js/config.js');
    require('../../js/utils.js');
    require('../../js/seed.js');
    require('../../js/store.js');
  } else {
    LF = root.LF;
  }

  var NOW = Date.parse('2026-10-09T10:00:00');
  var ME = 'me_test';
  var OTHER = 'other_actor';

  /** 一套标准的、必然合法的验证题（3 道，覆盖判断与选择两种题型） */
  function validQuestions() {
    return [
      { type: 'judge', stem: '伞柄是木头的', answer: 0 },
      { type: 'judge', stem: '伞面有卡通图案', answer: 1 },
      { type: 'choice', stem: '伞骨有几根', options: ['6 根', '8 根', '10 根'], answer: 1 }
    ];
  }

  /** 与 validQuestions() 完全对齐的一份正确答案 */
  function correctAnswers() {
    return [0, 1, 1];
  }

  /** 必然非法的作答：从正确答案整体右移一位，保证至少错一道 */
  function wrongAnswers() {
    return [1, 0, 0];
  }

  function validLost(overrides) {
    var base = {
      type: 'lost',
      title: '黑色保温杯丢在食堂了',
      category: 'daily',
      location: '第一食堂二楼',
      happenedAt: '2026-10-08',
      description: '杯身有轻微掉漆，杯底贴了胶带。',
      contactName: '林同学',
      contactWay: '13800138000',
      photo: '',
      questions: []
    };
    return merge(base, overrides);
  }

  function validFound(overrides) {
    var base = {
      type: 'found',
      title: '藏蓝色三折雨伞',
      category: 'rain',
      location: '第二食堂门口伞架',
      happenedAt: '2026-10-07',
      description: '雨天之后一直挂在伞架上，先收起来了。',
      contactName: '周同学',
      contactWay: 'QQ 5123678',
      photo: '',
      questions: validQuestions()
    };
    return merge(base, overrides);
  }

  function merge(base, overrides) {
    var out = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (overrides) {
      for (k in overrides) if (Object.prototype.hasOwnProperty.call(overrides, k)) out[k] = overrides[k];
    }
    return out;
  }

  /** 每个用例一个全新的内存仓库，用例之间互不污染，也不用担心测试数据残留 */
  function makeStore(options) {
    options = options || {};
    var store = LF.createStore(LF.createMemoryAdapter(), {
      now: NOW,
      ownerId: options.ownerId || ME,
      seed: false
    });
    store.boot();
    return store;
  }

  /** 带演示数据的 store（用于验证 seed 数据的完整性，而不是业务规则） */
  function seededStore(options) {
    options = options || {};
    var store = LF.createStore(LF.createMemoryAdapter(), {
      now: NOW,
      ownerId: options.ownerId || ME
    });
    store.boot();
    return store;
  }

  /** 可以推进时间的 store。
   *
   *  为什么需要它：`now` 是注入的，如果整条用例里时间固定不动，
   *  所有信息的 createdAt 就会完全相等，"最新在前 / 最早在前"这两条排序规则
   *  实际上根本没被验证到（比较器全部返回 0，只剩稳定排序的顺序）。
   *  所以这里注入一个**可变的时钟函数**，用例可以在两次创建之间往前走一分钟。
   *  这也顺带证明了 `now` 注入点是真的可用——而不是只在测试里摆样子。 */
  function makeClockStore(options) {
    options = options || {};
    var clock = { t: NOW };
    var adapter = options.adapter || LF.createMemoryAdapter();
    var store = LF.createStore(adapter, {
      now: function () { return clock.t; },
      ownerId: options.ownerId || ME,
      seed: false
    });
    store.boot();
    return {
      store: store,
      adapter: adapter,
      tick: function (ms) { clock.t += (ms || 60 * 1000); return clock.t; },
      rewind: function (ms) { clock.t -= (ms || 60 * 1000); return clock.t; },
      /** 新开一个"页面"：多页应用里每跳一次页面就是一个新的 store 实例 */
      reopen: function () {
        var s = LF.createStore(adapter, {
          now: function () { return clock.t; },
          ownerId: options.ownerId || ME,
          seed: false
        });
        s.boot();
        return s;
      }
    };
  }

  /** 造一条归属于某个 actor 的信息，返回 store 和它的 id */
  function withPost(store, actor, overrides) {
    var raw = merge(validFound(), overrides);
    if (raw.type === 'lost') raw.questions = [];
    var res = store.createPost(raw, actor || ME);
    if (!res.ok) {
      throw new Error('夹具创建失败：' + JSON.stringify(res.errors));
    }
    return res.post;
  }

  function today(options) { return LF.formatDate(NOW); }

  var T = {
    LF: LF,
    NOW: NOW,
    ME: ME,
    OTHER: OTHER,
    validLost: validLost,
    validFound: validFound,
    validQuestions: validQuestions,
    correctAnswers: correctAnswers,
    wrongAnswers: wrongAnswers,
    makeStore: makeStore,
    seededStore: seededStore,
    makeClockStore: makeClockStore,
    withPost: withPost,
    merge: merge,
    today: today,
    /** 造一个"会抛配额错误"的假适配器，用来测写满时的兜底 */
    quotaAdapter: function () {
      var data = {};
      return {
        kind: 'quota',
        getItem: function (k) { return data[k] === undefined ? null : data[k]; },
        setItem: function () {
          var e = new Error('quota exceeded');
          e.name = 'QuotaExceededError';
          throw e;
        },
        removeItem: function (k) { delete data[k]; }
      };
    }
  };

  if (isNode) module.exports = T;
  else root.T = T;
})(typeof globalThis !== 'undefined' ? globalThis : this);
