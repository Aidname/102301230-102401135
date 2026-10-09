/*!
 * page-verify.js —— 认领验证答题页控制器
 *
 * 这一页的设计几乎全是被"防试探"这一个目标推出来的：
 *
 *  · **一次性看到全部题目，不分页。** 早先想过"上一题 / 下一题"，但分页会让人
 *    以为可以回头改，也让人误以为系统在逐题判定——而逐题反馈正是我们要避免的。
 *  · **只有点选项，没有自由文本。** 手打答案会带来"深蓝 / 藏青"这类措辞歧义，
 *    真失主反而被判错；换成下标比对之后，这块判定误差直接消失了。
 *  · **只有全部选完才让提交。** 未答完就提交会返回"还差几题"并且**不扣次数**，
 *    否则用户会被自己的手滑消耗掉机会。
 *  · 提交后**只跳结果页**，页面上不显示任何"哪题错了"的痕迹——因为
 *    服务端返回的结果对象里就没有这个信息，前端改也造不出来。
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'index' });

  var id = UI.param('id');
  var host = document.getElementById('verifyHost');
  var backBar = document.getElementById('backBar');

  var answers = {};       // 题目 id -> 选中的下标
  var session = null;

  function fail(title, text, actions) {
    host.innerHTML = UI.emptyHtml({ icon: '🔒', title: title, text: text, actions: actions || '' });
  }

  function load() {
    backBar.innerHTML = '<a href="' + esc(UI.detailUrl(id, 'index')) + '">← 返回信息详情</a>';
    session = store.startClaim(id);
    if (!session.ok) {
      fail('现在不能答题', session.message,
        '<div class="empty-actions"><a class="btn btn-primary" href="' + esc(UI.detailUrl(id, 'index'))
        + '">回到信息详情</a></div>');
      return;
    }
    if (!session.attemptsLeft) {
      fail('作答次数已用完',
        '这条信息的 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次机会已经用完。如果确信东西是你的，可以走人工审核通道。',
        '<div class="empty-actions"><a class="btn btn-primary" href="appeal.html?id=' + encodeURIComponent(id)
        + '">提交申诉</a><a class="btn" href="' + esc(UI.detailUrl(id, 'index')) + '">返回详情</a></div>');
      return;
    }
    render();
  }

  function render() {
    var questions = session.questions;
    host.innerHTML = '' +
      '<div class="quiz-head">' +
        '<h1 style="font-size:var(--f-xl)">认领验证：' + esc(session.title) + '</h1>' +
        '<div class="quiz-meta">' +
          '<span>发布者：' + esc(session.contactName) + '</span>' +
          '<span>分类：' + esc(session.categoryName) + '</span>' +
          '<span>共 ' + questions.length + ' 道题</span>' +
          '<span>剩余作答次数：<b class="attempts">' + session.attemptsLeft + '</b> / ' + session.maxAttempts + '</span>' +
        '</div>' +
        '<div class="note" style="margin-top:12px">' +
          '请<b>一次选完全部题目</b>再提交。系统只回「通过 / 不通过」，不会告诉你是哪一题错了——' +
          '否则反复试几次就能把答案试出来，限制次数也就没有意义了。' +
        '</div>' +
      '</div>' +
      questions.map(function (q, i) {
        return '<div class="quiz-q" data-qid="' + esc(q.id) + '">' +
          '<div class="quiz-stem"><span class="q-index">' + (i + 1) + '</span>' +
            '<span>' + esc(q.stem) + '<span class="hint" style="font-weight:400"> · ' + esc(q.typeName) + '</span></span></div>' +
          '<div class="quiz-options">' +
            q.options.map(function (opt, oi) {
              return '<label class="quiz-option">' +
                '<input type="radio" name="q_' + esc(q.id) + '" value="' + oi + '" data-qid="' + esc(q.id) + '">' +
                '<span>' + esc(opt) + '</span></label>';
            }).join('') +
          '</div></div>';
      }).join('') +
      '<div class="quiz-submit">' +
        '<span class="quiz-progress" id="progress"></span>' +
        '<div class="toolbar" style="margin:0">' +
          '<button class="btn btn-primary btn-lg" id="submitClaim" type="button">提交验证</button>' +
        '</div>' +
      '</div>';

    document.addEventListener('change', onChange);
    document.getElementById('submitClaim').addEventListener('click', onSubmit);
    updateProgress();
  }

  function onChange(e) {
    if (e.target.getAttribute('data-qid') === null) return;
    var qid = e.target.getAttribute('data-qid');
    answers[qid] = Number(e.target.value);
    var box = e.target.closest('.quiz-q');
    Array.prototype.forEach.call(box.querySelectorAll('.quiz-option'), function (opt) {
      opt.classList.toggle('selected', opt.contains(e.target));
    });
    box.classList.remove('is-missing');
    updateProgress();
  }

  function missing() {
    return session.questions.filter(function (q) { return answers[q.id] === undefined; }).length;
  }

  function updateProgress() {
    var left = missing();
    var node = document.getElementById('progress');
    if (!node) return;
    if (left === 0) {
      node.textContent = '✔ ' + session.questions.length + ' 道题已全部作答，可以提交';
      node.classList.add('ready');
    } else {
      node.textContent = '还差 ' + left + ' 道题没有作答';
      node.classList.remove('ready');
    }
  }

  function onSubmit() {
    // 前端先挡一道，避免用户为了"还差几题"白跑一趟；
    // 但数据层也会独立再判一次——前端挡不挡得住不是安全边界。
    var left = missing();
    if (left > 0) {
      UI.toast('还有 ' + left + ' 道题没有作答', 'error');
      session.questions.forEach(function (q, i) {
        if (answers[q.id] === undefined) {
          var box = host.querySelector('[data-qid="' + q.id + '"]');
          if (box) box.classList.add('is-missing');
        }
      });
      var first = host.querySelector('.quiz-q.is-missing');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    var ordered = session.questions.map(function (q) { return answers[q.id]; });
    var result = store.submitClaim(id, ordered);
    sessionStorage.setItem('lf_last_result', JSON.stringify({
      postId: id,
      ok: result.ok,
      passed: !!result.passed,
      message: result.message,
      remaining: typeof result.remaining === 'number' ? result.remaining : null,
      canAppeal: !!result.canAppeal,
      voucher: result.voucher || ''
    }));
    UI.go('verify-result.html?id=' + encodeURIComponent(id));
  }

  load();
})();
