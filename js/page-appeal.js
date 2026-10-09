/*!
 * page-appeal.js —— 申诉页控制器
 *
 * 申诉是一次**真正落库的表单**，不是一句"请联系发布者"的弹窗。
 * 差别在于：弹窗只是把问题推回给用户，发布者手里没有任何可判断的凭据；
 * 表单则把"称呼 + 联系方式 + 只有物主才知道的细节"存进这条信息，
 * 发布者在「我的发布 → 人工审核」里逐条处理。
 *
 * 页面上还刻意先摆一道"提问"：答完 3 次都没过，最常见的原因其实是
 * 这件东西本来就不是你的。所以在让他填表之前，先请他自问一句。
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'index' });

  var id = UI.param('id');
  var host = document.getElementById('appealHost');
  var backBar = document.getElementById('backBar');

  var post = store.getPost(id);
  backBar.innerHTML = '<a href="' + esc(UI.detailUrl(id, 'index')) + '">← 返回信息详情</a>';

  if (!post) {
    host.innerHTML = UI.emptyHtml({
      icon: '🫥', title: '这条信息不存在或已被删除',
      actions: '<div class="empty-actions"><a class="btn btn-primary" href="index.html">回首页</a></div>'
    });
    return;
  }

  if (post.isOwner) {
    host.innerHTML = UI.emptyHtml({
      icon: '🙋', title: '这是你自己发布的信息', text: '发布者不需要申诉。要处理别人提交的申诉，请到「我的发布 → 人工审核」。',
      actions: '<div class="empty-actions"><a class="btn btn-primary" href="mine.html">去我的发布</a></div>'
    });
    return;
  }

  if (post.appealPending) {
    host.innerHTML = UI.emptyHtml({
      icon: '⏳', title: '申诉已经提交过了', text: '正在等待发布者人工核对。发布者同意交还后，详情页会显示联系方式和线下交接编号。',
      actions: '<div class="empty-actions"><a class="btn btn-primary" href="' + esc(UI.detailUrl(id, 'index'))
        + '">返回信息详情</a></div>'
    });
    return;
  }

  if (!post.canAppeal) {
    host.innerHTML = UI.emptyHtml({
      icon: '🔒', title: '现在还不能申诉',
      text: post.needsVerify
        ? ('作答次数还没用完（还剩 ' + post.attemptsLeft + ' 次），请先尝试作答。')
        : '这条信息不需要认领验证，直接联系发布者即可。',
      actions: '<div class="empty-actions"><a class="btn btn-primary" href="'
        + esc(post.attemptsLeft > 0 ? 'verify.html?id=' + encodeURIComponent(id) : UI.detailUrl(id, 'index'))
        + '">' + (post.attemptsLeft > 0 ? '去答题' : '返回信息详情') + '</a></div>'
    });
    return;
  }

  renderForm();

  function renderForm() {
    host.innerHTML = '' +
      '<div class="page-head">' +
        '<h1>提交申诉（人工审核）</h1>' +
        '<p>你已经答满 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次仍未通过。如果确信东西是你的，请写下发布者能核对的细节。</p>' +
      '</div>' +
      '<div class="panel" style="background:var(--c-surface-2)">' +
        '<h3>先自问一句</h3>' +
        '<div class="note note-warn">答完 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次都没过，最常见的原因是' +
          '<b>这件东西本来就不是你的</b>，或者你记错了细节。申诉会直接送到发布者手上，' +
          '请只在确实有把握时提交——占用别人的时间，也会让真正需要的人排在后面。</div>' +
      '</div>' +
      '<div id="errorBox"></div>' +
      '<form class="form panel" id="appealForm" novalidate>' +
        '<div class="field" id="f-claimantName">' +
          '<label for="aName">你的称呼 <span class="req">*</span></label>' +
          '<input class="input" id="aName" maxlength="30" placeholder="例如：陈雨桐">' +
          '<div class="field-error" id="err-claimantName" hidden></div>' +
        '</div>' +
        '<div class="field" id="f-contact">' +
          '<label for="aContact">你的联系方式 <span class="req">*</span></label>' +
          '<input class="input" id="aContact" maxlength="60" placeholder="手机号 / QQ / 微信号 / 邮箱">' +
          '<div class="hint">' + esc(LF.CONTACT_HINT) + '。只有发布者能看到这一项。</div>' +
          '<div class="field-error" id="err-contact" hidden></div>' +
        '</div>' +
        '<div class="field" id="f-detail">' +
          '<label for="aDetail">只有物主才知道的细节 <span class="req">*</span></label>' +
          '<textarea class="textarea" id="aDetail" maxlength="400" rows="6" ' +
            'placeholder="尽可能具体，例如：耳机盒左下角有一道两三毫米的划痕，是我摔的；序列号末位是 7；盒子里还夹着一张图书馆座位预约小票。"></textarea>' +
          '<div class="counter" id="c-detail"></div>' +
          '<div class="hint">写得越具体，发布者越好判断。只写"就是我的"这类话，基本会被驳回。</div>' +
          '<div class="field-error" id="err-detail" hidden></div>' +
        '</div>' +
        '<div class="toolbar" style="margin-bottom:0">' +
          '<button class="btn btn-primary btn-lg" type="submit">提交申诉</button>' +
          '<a class="btn btn-lg" href="' + esc(UI.detailUrl(id, 'index')) + '">取消</a>' +
        '</div>' +
      '</form>' +
      '<div class="panel">' +
        '<h3>这条信息的基本情况</h3>' +
        '<dl class="info-grid">' +
          '<dt>物品名称</dt><dd>' + esc(post.title) + '</dd>' +
          '<dt>分类</dt><dd>' + esc(post.categoryIcon + ' ' + post.categoryName) + '</dd>' +
          '<dt>地点</dt><dd>' + esc(post.location) + '</dd>' +
          '<dt>发布者</dt><dd>' + esc(post.contactName) + '（联系方式需发布者同意后才开放）</dd>' +
        '</dl>' +
      '</div>';

    var name = document.getElementById('aName');
    var contact = document.getElementById('aContact');
    var detail = document.getElementById('aDetail');
    var counter = document.getElementById('c-detail');

    detail.addEventListener('input', function () {
      var n = detail.value.trim().length;
      counter.textContent = n + ' / ' + LF.LIMITS.APPEAL_DETAIL_MAX
        + (n < LF.LIMITS.APPEAL_DETAIL_MIN ? '（至少 ' + LF.LIMITS.APPEAL_DETAIL_MIN + ' 字）' : '');
      counter.classList.toggle('over', n > LF.LIMITS.APPEAL_DETAIL_MAX);
    });

    var profile = store.getProfile();
    if (profile.name) name.value = profile.name;
    if (profile.contact) contact.value = profile.contact;
    detail.dispatchEvent(new Event('input'));

    document.getElementById('appealForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var res = store.submitAppeal(id, {
        claimantName: name.value,
        contact: contact.value,
        detail: detail.value
      });
      if (!res.ok) {
        var box = document.getElementById('errorBox');
        box.innerHTML = '<div class="error-box"><b>' + esc(res.message) + '</b><ul>'
          + Object.keys(res.errors).map(function (k) { return '<li>' + esc(res.errors[k]) + '</li>'; }).join('')
          + '</ul></div>';
        Object.keys(res.errors).forEach(function (field) {
          var f = document.getElementById('f-' + field);
          if (f) f.classList.add('is-error');
          var n = document.getElementById('err-' + field);
          if (n) { n.hidden = false; n.textContent = '⚠️ ' + res.errors[field]; }
        });
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      UI.toast(res.message, 'ok');
      setTimeout(function () { UI.go(UI.detailUrl(id, 'index')); }, 700);
    });
  }
})();
