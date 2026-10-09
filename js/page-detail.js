/*!
 * page-detail.js —— 详情页控制器
 *
 * 详情页是"防冒领"这套机制真正兑现的地方，所以这一段最关键：
 * **未通过验证时，联系方式不是被藏起来，而是根本没进这个页面。**
 * store 返回的对象里 contactWay 是空串——打开控制台也拿不到。
 *
 * 另外三个状态要分清楚，它们对应完全不同的交互：
 *   owner    我是发布者      → 完整联系方式 + 状态维护 + 认领/申诉统计
 *   open     这条不需要验证  → 寻物信息，或「其他」类走信任模式，联系方式直接可见
 *   unlocked 我已经通过验证  → 联系方式 + 凭证码
 *   locked   我还没通过验证  → 只显示"通过认领验证后可见"，给认领 / 申诉入口
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'index' });

  var id = UI.param('id');
  var from = UI.param('from');
  var host = document.getElementById('detailHost');
  var backBar = document.getElementById('backBar');

  var FROM_TEXT = {
    index: { href: 'index.html', label: '← 返回列表' },
    search: { href: 'search.html', label: '← 返回搜索结果' },
    mine: { href: 'mine.html', label: '← 返回我的发布' },
    success: { href: 'index.html', label: '← 返回列表' }
  };

  function backLink() {
    var back = FROM_TEXT[from] || FROM_TEXT.index;
    var html = '<a href="' + back.href + '">' + esc(back.label) + '</a>';
    if (from === 'search') {
      html += '<a href="index.html">回首页</a>';
    }
    backBar.innerHTML = html;
  }

  function render() {
    var post = store.getPost(id);
    backLink();

    if (!post) {
      host.innerHTML = UI.emptyHtml({
        icon: '🫥',
        title: '这条信息不存在或已被删除',
        text: '可能发布者已经把它撤下了，或者链接不完整。',
        actions: '<div class="empty-actions"><a class="btn btn-primary" href="index.html">回首页浏览其他信息</a>'
          + '<a class="btn" href="publish.html">＋ 发布一条</a></div>'
      });
      return;
    }

    store.addView(post.id);
    post = store.getPost(id);   // 重新取一次，把 +1 之后的浏览量显示出来

    var ownerActions = post.isOwner ? ownerPanel(post) : '';
    var claimPanel = claimSection(post);
    var appealPanel = appealSection(post);

    host.innerHTML = '' +
      '<article class="panel">' +
        '<div class="card-head" style="margin-bottom:12px;flex-wrap:wrap">' +
          UI.typeBadge(post) + UI.statusBadge(post) + UI.lockBadge(post) +
          '<span class="hint">编号 ' + esc(post.code) + '</span>' +
        '</div>' +
        '<h1 style="margin-bottom:12px">' + esc(post.title) + '</h1>' +
        (post.photo ? '<img src="' + esc(post.photo) + '" alt="' + esc(post.title)
          + '" style="max-height:340px;border-radius:12px;margin-bottom:16px;width:auto">' : '') +
        '<dl class="info-grid">' +
          '<dt>分类</dt><dd>' + esc(post.categoryIcon + ' ' + post.categoryName) + '</dd>' +
          '<dt>地点</dt><dd>' + esc(post.location) + '</dd>' +
          '<dt>' + (post.type === 'lost' ? '丢失日期' : '拾取日期') + '</dt><dd>' + esc(post.happenedAt) + '</dd>' +
          '<dt>发布时间</dt><dd>' + esc(post.createdAtText) + '（' + esc(post.timeAgoText) + '）</dd>' +
          '<dt>浏览量</dt><dd>' + post.views + '</dd>' +
        '</dl>' +
        '<h3 style="margin:18px 0 8px">详细描述</h3>' +
        '<p style="white-space:pre-wrap;color:var(--c-text-2)">'
          + (post.description ? esc(post.description) : '（发布者没有补充描述）') + '</p>' +
        contactPanel(post) +
      '</article>' +
      claimPanel +
      appealPanel +
      ownerActions +
      matchPanel(post);
  }

  /* ---------- 联系方式 ---------- */

  function contactPanel(post) {
    if (post.contactLocked) {
      return '<div class="contact-card locked">' +
        '<b>🔒 联系方式已锁定</b>' +
        '<p style="margin-top:6px;font-size:var(--f-sm)">发布者出了 <b>' + post.questionCount + '</b> 道只有物主答得对的题。' +
        '需要全部答对才能看到 ' + esc(post.contactName) + ' 的联系方式，最多可答 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次，' +
        '剩余 <b>' + post.attemptsLeft + '</b> 次。答满 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次仍未通过，可以提交申诉由发布者人工核对。</p>' +
        '</div>';
    }
    var badge = post.lockState === 'owner'
      ? '<span class="status status-active">你是发布者</span>'
      : (post.lockState === 'unlocked'
        ? '<span class="status status-open">🔓 已验证</span>'
        : '<span class="status status-open">公开可见</span>');
    return '<div class="contact-card">' +
      '<b>联系方式 ' + badge + '</b>' +
      '<div class="contact-row">' +
        '<span class="contact-value">' + esc(post.contactName) + ' · ' + esc(post.contactWay) + '</span>' +
        '<button class="btn btn-sm btn-primary" type="button" data-copy="' + esc(post.contactWay) + '">📋 一键复制</button>' +
      '</div>' +
      (post.voucher ? '<p style="margin-top:8px;font-size:var(--f-sm)">认领凭证码：<b>' + esc(post.voucher)
        + '</b>，线下交接时出示给发布者核对。</p>' : '') +
      (post.status === LF.STATUSES.DONE
        ? '<p class="hint" style="margin-top:8px">这条信息已经标记为「' + esc(post.statusText) + '」，请勿再打扰发布者。</p>' : '') +
      '</div>';
  }

  /* ---------- 认领入口 ---------- */

  function claimSection(post) {
    if (post.isOwner) return '';
    if (!post.needsVerify) {
      if (post.category === 'other' && post.type === 'found') {
        return '<div class="panel"><h3>为什么这条不需要答题？</h3>' +
          '<div class="trust-box"><h4>📦 「其他」类走信任原则</h4>' +
          '<p>这一类物品没有客观、能锁死的特征，硬出题只会让发布者把描述再抄一遍，' +
          '而冒领者照着公开描述就能选对。所以这里直接公开描述和联系方式，由你主动联系发布者核对。</p>' +
          '<p style="margin-top:6px"><span class="cost">请配合：</span>联系时请主动说明物品的独有特征，' +
          '不要只说"我丢了一个包"。</p></div></div>';
      }
      return '';
    }
    if (post.lockState === 'unlocked') {
      return '<div class="panel"><h3>认领状态</h3><p>你已经通过认领验证，凭证码 <b>'
        + esc(post.voucher || '（本次会话未记录）') + '</b>。上方可以直接看到联系方式。</p></div>';
    }
    if (post.attemptsLeft > 0) {
      return '<div class="panel">' +
        '<div class="panel-head"><h3>我要认领</h3>' +
          '<span class="hint">剩余作答次数 <b class="attempts">' + post.attemptsLeft + '</b> / ' + LF.VERIFY.MAX_ATTEMPTS + '</span></div>' +
        '<p style="color:var(--c-text-2);font-size:var(--f-sm)">' +
          '确认这件东西是你的，就点下面的按钮开始答题。题目一次全部给出，需要<b>全部答对</b>；' +
          '提交后系统只回"通过 / 不通过"，不会告诉你是哪一题错了——否则反复试几次就能把答案试出来。' +
        '</p>' +
        '<div class="toolbar" style="margin:12px 0 0">' +
          '<a class="btn btn-primary btn-lg" href="verify.html?id=' + encodeURIComponent(post.id) + '">开始认领验证</a>' +
        '</div></div>';
    }
    return '';
  }

  /* ---------- 申诉入口 ---------- */

  function appealSection(post) {
    if (post.isOwner) return '';
    if (post.appealPending) {
      return '<div class="panel"><h3>申诉已提交</h3>' +
        '<p style="color:var(--c-text-2)">你已经提交过一次申诉，正在等待发布者人工核对。' +
        '发布者同意交还后，这里会显示联系方式与线下交接编号。</p></div>';
    }
    if (!post.canAppeal) return '';
    return '<div class="panel">' +
      '<h3>📮 走人工审核通道</h3>' +
      '<p style="color:var(--c-text-2);font-size:var(--f-sm)">' +
        '你已经答满 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次仍未通过。如果确信东西是你的，' +
        '可以写下<strong>只有物主才知道的细节</strong>和你的联系方式，由发布者亲自判断是否交还。</p>' +
      '<div class="toolbar" style="margin:12px 0 0">' +
        '<a class="btn btn-primary btn-lg" href="appeal.html?id=' + encodeURIComponent(post.id) + '">提交申诉</a>' +
      '</div></div>';
  }

  /* ---------- 发布者管理 ---------- */

  function ownerPanel(post) {
    if (post.status === LF.STATUSES.DONE) {
      return '<div class="panel"><h3>发布者管理</h3>' +
        '<p class="hint">这条信息已于 ' + esc(LF.formatDateTime(post.doneAt)) + ' 标记为「' + esc(post.statusText) + '」，列表中会置灰并沉到后面。</p>' +
        '<div class="toolbar" style="margin-top:12px;margin-bottom:0">' +
          '<button class="btn" data-act="restore" type="button">恢复为进行中</button>' +
          '<a class="btn" href="publish.html?id=' + encodeURIComponent(post.id) + '">编辑</a>' +
          '<button class="btn btn-danger" data-act="remove" type="button">删除</button>' +
        '</div></div>';
    }
    return '<div class="panel"><h3>发布者管理</h3>' +
      '<p class="hint">只有你能看到这里的按钮：别人打开这条信息时只会看到「联系发布者」。</p>' +
      '<div class="toolbar" style="margin-top:12px;margin-bottom:0">' +
        '<button class="btn btn-ok btn-lg" data-act="done" type="button">标记' +
          (post.type === 'lost' ? '已找到' : '已归还') + '</button>' +
        '<a class="btn" href="publish.html?id=' + encodeURIComponent(post.id) + '">编辑</a>' +
        '<button class="btn btn-danger" data-act="remove" type="button">删除</button>' +
      '</div>' +
      (post.needsVerify
        ? '<div class="note" style="margin-top:14px">收到的认领尝试：<b>' + post.claimCount + '</b> 次。' +
          '逐条明细与人工审核在「我的发布」里处理。</div>'
        : '') +
      '</div>';
  }

  /* ---------- 可能相关的信息 ---------- */

  function matchPanel(post) {
    var raw = store.debugState().posts.filter(function (p) { return p.id === post.id; })[0];
    var matches = store.findMatches(raw, 3);
    if (!matches.length) return '';
    return '<section><div class="section-title">🔗 可能相关的信息' +
      '<span class="count">类型相反、分类相同、标题有两字重合</span></div>'
      + UI.listHtml(matches, { from: 'detail' }) + '</section>';
  }

  /* ---------- 事件 ---------- */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act');

    if (act === 'done') {
      UI.confirm({
        title: '标记为' + (store.getPost(id).type === 'lost' ? '已找到' : '已归还') + '？',
        text: '标记后这条信息会在列表里置灰并沉到后面，详情页不再显示联系入口。如果标错了，可以再恢复为进行中。',
        okText: '确认标记'
      }).then(function (yes) {
        if (!yes) return;
        var res = store.markDone(id);
        if (!res.ok) { UI.toast(res.message, 'error'); return; }
        UI.toast('已标记为「' + res.post.statusText + '」', 'ok');
        render();
      });
      return;
    }

    if (act === 'restore') {
      var res2 = store.restorePost(id);
      if (!res2.ok) { UI.toast(res2.message, 'error'); return; }
      UI.toast('已恢复为进行中', 'ok');
      render();
      return;
    }

    if (act === 'remove') {
      UI.confirm({
        title: '删除这条信息？',
        text: '删除后无法恢复，已经收到的认领记录和申诉也会一起消失。',
        okText: '确认删除'
      }).then(function (yes) {
        if (!yes) return;
        var res3 = store.removePost(id);
        if (!res3.ok) { UI.toast(res3.message, 'error'); return; }
        UI.toast('已删除', 'ok');
        setTimeout(function () { UI.go('mine.html'); }, 500);
      });
    }
  });

  render();
})();
