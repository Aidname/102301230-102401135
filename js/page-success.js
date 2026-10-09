/*!
 * page-success.js —— 发布成功页控制器
 *
 * 这一页存在的意义不是"报个喜"，而是回答两个问题：
 *   ① 我发的这条现在长什么样、编号是多少（方便线下核对）；
 *   ② **有没有人刚好捡到 / 丢了同一件东西？**
 * 第二个问题靠 findMatches() 主动搭桥——传统失物招领只是被动列信息，
 * 丢的人和捡的人还得自己一条条翻。这里把"第一次关联"替他们做了。
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'publish' });

  var id = UI.param('id');
  var post = id ? store.getPost(id) : null;

  var el = {
    heroTitle: document.getElementById('heroTitle'),
    heroSub: document.getElementById('heroSub'),
    codeBox: document.getElementById('codeBox'),
    summaryHost: document.getElementById('summaryHost'),
    viewBtn: document.getElementById('viewBtn'),
    matchSection: document.getElementById('matchSection'),
    matchHost: document.getElementById('matchHost')
  };

  if (!post) {
    el.heroTitle.textContent = '没有找到刚发布的信息';
    el.heroSub.textContent = '可能是链接不完整，或者这条信息已经被删除了。';
    el.summaryHost.innerHTML = UI.emptyHtml({
      icon: '🤔',
      title: '拿不到这条信息',
      text: '发布成功页需要一个 ?id= 参数才能显示摘要。',
      actions: '<div class="empty-actions"><a class="btn btn-primary" href="index.html">回首页看看</a></div>'
    });
    return;
  }

  el.viewBtn.href = UI.detailUrl(post.id, 'success');
  el.codeBox.innerHTML = '<span class="hint">信息编号</span> '
    + '<span class="voucher" style="border-style:solid;border-color:var(--c-primary-line);color:var(--c-primary)">'
    + esc(post.code) + '</span>';

  el.summaryHost.innerHTML = '<div class="info-grid">'
    + '<dt>类型</dt><dd>' + esc(post.typeIcon + ' ' + post.typeFullName) + '</dd>'
    + '<dt>物品名称</dt><dd>' + esc(post.title) + '</dd>'
    + '<dt>分类</dt><dd>' + esc(post.categoryIcon + ' ' + post.categoryName) + '</dd>'
    + '<dt>地点</dt><dd>' + esc(post.location) + '</dd>'
    + '<dt>日期</dt><dd>' + esc(post.happenedAt) + '</dd>'
    + '<dt>验证题</dt><dd>' + (post.needsVerify
      ? ('已设置 ' + post.questionCount + ' 道，认领人需全部答对才能看到你的联系方式')
      : '本条不设认领验证' + (post.category === 'other' ? '（「其他」类走信任模式，联系方式和描述直接公开）' : ''))
    + '</dd>'
    + '<dt>联系方式</dt><dd>' + esc(post.contactWay) + '（只有你本人和通过验证的人能看到）</dd>'
    + '</div>';

  /* ---------- 智能配对 ---------- */

  var raw = store.debugState().posts.filter(function (p) { return p.id === post.id; })[0];
  var matches = store.findMatches(raw, 3);

  if (matches.length) {
    el.matchSection.hidden = false;
    var tip = post.type === 'lost'
      ? '有人刚好发布了这些招领信息，去确认一下是不是你的东西。'
      : '有人正在找这类东西，可能就是物主。';
    el.matchHost.innerHTML = '<p class="hint" style="margin-bottom:12px">' + esc(tip) + '</p>'
      + UI.listHtml(matches, { from: 'success' });
  }
})();
