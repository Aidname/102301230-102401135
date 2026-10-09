/*!
 * page-verify-result.js —— 验证结果页控制器
 *
 * 结果从 sessionStorage 里取（提交那一步写进去的），而不是从 URL 传。
 * 原因是 URL 会被分享、会被回退，而"我这次答对没有"是一次性的过程状态。
 *
 * 失败页的文案是这一页的重点：必须把"为什么不告诉你哪题错"讲清楚，
 * 否则真失主会觉得系统在刁难他。所以我们主动把理由写在页面上，
 * 并给出申诉出口——而不是让他自己去猜。
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'index' });

  var host = document.getElementById('resultHost');
  var id = UI.param('id');

  var raw = null;
  try { raw = JSON.parse(sessionStorage.getItem('lf_last_result') || 'null'); } catch (e) { raw = null; }
  if (!raw || raw.postId !== id) {
    raw = { postId: id, ok: false, passed: false, message: '没有找到本次验证的结果记录', remaining: null, canAppeal: false };
  }

  var post = store.getPost(id);

  function actions(extra) {
    return '<div class="empty-actions">' + extra + '</div>';
  }

  function renderPass() {
    var contact = post ? post.contactWay : '';
    host.innerHTML = '' +
      '<div class="result-hero is-ok">' +
        '<div class="icon">✅</div>' +
        '<h2>验证通过</h2>' +
        '<p>你答对了全部题目，' + esc(post ? post.contactName : '发布者') + ' 的联系方式已解锁。</p>' +
        '<div class="voucher">🎫 ' + esc(raw.voucher || (post && post.voucher) || '') + '</div>' +
        '<p style="margin-top:8px" class="hint">线下交接时出示这个凭证码，发布者可以据此核对。</p>' +
      '</div>' +
      '<div class="panel">' +
        '<h3>联系方式</h3>' +
        '<div class="contact-card">' +
          '<div class="contact-row">' +
            '<span class="contact-value">' + esc(post ? post.contactName : '') + ' · ' + esc(contact) + '</span>' +
            '<button class="btn btn-primary" type="button" data-copy="' + esc(contact) + '">📋 一键复制</button>' +
          '</div>' +
          '<p class="hint" style="margin-top:8px">联系时请主动说明物品的独有特征，并出示凭证码。</p>' +
        '</div>' +
        '<div class="toolbar" style="margin-top:16px;margin-bottom:0">' +
          '<a class="btn btn-primary" href="' + esc(UI.detailUrl(id, 'index')) + '">返回信息详情</a>' +
          '<a class="btn" href="index.html">继续浏览</a>' +
        '</div>' +
      '</div>';
  }

  function renderFail() {
    var remaining = typeof raw.remaining === 'number' ? raw.remaining : (post ? post.attemptsLeft : 0);
    var canAppeal = raw.canAppeal || (post && post.canAppeal);
    var leftBlock = remaining > 0
      ? '<p>还剩 <b class="attempts">' + remaining + '</b> 次作答机会。建议先回去对着物品再确认一遍细节，' +
        '想清楚再提交——每提交一次都会消耗一次机会。</p>'
      : '<p>作答次数已经用完。</p>';

    host.innerHTML = '' +
      '<div class="result-hero is-fail">' +
        '<div class="icon">❌</div>' +
        '<h2>验证未通过</h2>' +
        '<p>' + esc(raw.message || '回答的细节与描述不符') + '</p>' +
      '</div>' +
      '<div class="panel">' +
        '<h3>为什么系统不告诉我哪一题错了？</h3>' +
        '<div class="note note-warn">' +
          '这是刻意的：如果告诉你错在哪一题，每答错一次就能排除一个选项，' +
          '试几次就能把正确答案试出来——限制次数也就形同虚设了。' +
          '所以系统只回「通过 / 不通过」，把机会真的限制在 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次以内。' +
        '</div>' +
        '<div style="margin-top:12px">' + leftBlock + '</div>' +
        '<div class="toolbar" style="margin-top:16px;margin-bottom:0">' +
          (remaining > 0
            ? '<a class="btn btn-primary btn-lg" href="verify.html?id=' + encodeURIComponent(id) + '">再答一次</a>'
            : '') +
          '<a class="btn" href="' + esc(UI.detailUrl(id, 'index')) + '">返回信息详情</a>' +
        '</div>' +
      '</div>' +
      (canAppeal
        ? '<div class="panel">' +
            '<h3>📮 还有一条路：人工审核</h3>' +
            '<p style="color:var(--c-text-2);font-size:var(--f-sm)">' +
              '如果确信这件东西是你的，可以写下<strong>只有物主才知道的细节</strong>和你的联系方式，' +
              '交给发布者亲自判断。发布者同意交还后，你会拿到一个线下交接编号。</p>' +
            '<div class="toolbar" style="margin:12px 0 0">' +
              '<a class="btn btn-primary btn-lg" href="appeal.html?id=' + encodeURIComponent(id) + '">提交申诉</a>' +
            '</div>' +
          '</div>'
        : '');
  }

  if (raw.passed) renderPass(); else renderFail();
})();
