/*!
 * page-publish.js —— 发布 / 编辑页控制器
 *
 * 这一页里有两件事值得单独说：
 *
 * ① **题目编辑器不整块重绘。**
 *    题干和选项都是输入框，如果每敲一个字就把整个表单重建一遍，
 *    焦点会丢，表现为"打一个字就跳出输入框"。
 *    所以分成两条路：改文字 → 只更新内存里的模型；改结构（加题/删题/换题型/加删选项）
 *    → 才重绘那一道题。
 *
 * ② **草稿自动保存，但"回来时"要问一句。**
 *    填了一半误关页面是真会发生的。草稿有 400ms 防抖，照片不入草稿（体积太大）。
 *    再次打开时弹一条恢复提示，而不是替用户默默填回去或默默丢掉。
 */
(function () {
  'use strict';

  var UI = LF.UI;
  var esc = UI.esc;
  var store = UI.boot({ active: 'publish' });

  var el = {
    form: document.getElementById('publishForm'),
    pageTitle: document.getElementById('pageTitle'),
    pageSub: document.getElementById('pageSub'),
    errorBox: document.getElementById('errorBox'),
    typePicker: document.getElementById('typePicker'),
    title: document.getElementById('fTitle'),
    cTitle: document.getElementById('c-title'),
    categoryPicker: document.getElementById('categoryPicker'),
    location: document.getElementById('fLocation'),
    locationList: document.getElementById('locationList'),
    happenedAt: document.getElementById('fHappenedAt'),
    description: document.getElementById('fDescription'),
    cDescription: document.getElementById('c-description'),
    photo: document.getElementById('fPhoto'),
    photoPreview: document.getElementById('photoPreview'),
    removePhoto: document.getElementById('removePhoto'),
    contactName: document.getElementById('fContactName'),
    contactWay: document.getElementById('fContactWay'),
    contactHint: document.getElementById('contactHint'),
    quizFieldset: document.getElementById('quizFieldset'),
    quizLegend: document.getElementById('quizLegend'),
    quizHelp: document.getElementById('quizHelp'),
    questionList: document.getElementById('questionList'),
    quizTools: document.getElementById('quizTools'),
    templateSelect: document.getElementById('templateSelect'),
    addJudge: document.getElementById('addJudge'),
    addChoice: document.getElementById('addChoice'),
    submitBtn: document.getElementById('submitBtn'),
    saveDraftBtn: document.getElementById('saveDraftBtn'),
    clearDraftBtn: document.getElementById('clearDraftBtn'),
    draftTip: document.getElementById('draftTip'),
    editTip: document.getElementById('editTip')
  };

  var state = {
    mode: 'create',   // create | edit
    editId: '',
    type: 'lost',
    category: '',
    questions: [],
    // 临时存放被"当前类型/分类不需要出题"挤掉的那批题目。
    // 发布者写三道题花了心思，如果只是切一下分类就被清空、切回来还得重写，
    // 那是我们在惩罚他的误操作——所以先收起来，切回来再还给他。
    stashedQuestions: [],
    photo: '',
    dirty: false
  };

  var qSeq = 0;
  function newQuestion(type) {
    qSeq += 1;
    return {
      key: 'k' + qSeq,
      type: type === 'judge' ? 'judge' : 'choice',
      stem: '',
      options: type === 'judge' ? LF.VERIFY.JUDGE_OPTIONS.slice() : ['', '', ''],
      answer: type === 'judge' ? -1 : -1
    };
  }

  /* ============================================================
   * 初始化页面零件
   * ============================================================ */

  function renderCategoryPicker() {
    el.categoryPicker.innerHTML = LF.CATEGORIES.map(function (c) {
      return '<button type="button" class="chip' + (state.category === c.key ? ' active' : '') + '" data-cat="' + c.key + '">'
        + c.icon + ' ' + esc(c.name) + '</button>';
    }).join('');
  }

  function renderTypePicker() {
    Array.prototype.forEach.call(el.typePicker.querySelectorAll('.type-option'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-type') === state.type);
    });
  }

  function renderLocations() {
    el.locationList.innerHTML = LF.LOCATIONS.map(function (l) {
      return '<option value="' + esc(l) + '"></option>';
    }).join('');
  }

  function renderTemplates() {
    var cat = LF.categoryOf(state.category);
    var list = (cat && cat.templates) ? cat.templates : [];
    el.templateSelect.innerHTML = '<option value="">— 选择模板 —</option>'
      + list.map(function (t, i) {
        return '<option value="' + i + '">' + esc((t.type === 'judge' ? '【判断】' : '【选择】') + t.stem) + '</option>';
      }).join('');
    el.templateSelect.disabled = !list.length;
  }

  /* ============================================================
   * 题目编辑器
   * ============================================================ */

  function optionsBlock(q) {
    if (q.type === 'judge') {
      // 判断题的选项是固定的「正确 / 错误」，不让发布者改——
      // 改了就变成自由文本，判定方式也就退回到字符串比对了
      return '<div class="q-options">' + LF.VERIFY.JUDGE_OPTIONS.map(function (label, i) {
        return '<label class="q-option">'
          + '<input type="radio" name="ans_' + q.key + '" data-role="answer" value="' + i + '"'
          + (q.answer === i ? ' checked' : '') + '>'
          + '<span class="opt-mark">' + (q.answer === i ? '✔ 正确' : '　') + '</span>'
          + '<span>' + esc(label) + '</span></label>';
      }).join('') + '</div>';
    }
    return '<div class="q-options">' + q.options.map(function (opt, i) {
      return '<div class="q-option">'
        + '<input type="radio" name="ans_' + q.key + '" data-role="answer" value="' + i + '"'
        + (q.answer === i ? ' checked' : '') + ' title="把这一项标为正确答案">'
        + '<input class="input" data-role="opt" data-index="' + i + '" maxlength="24"'
        + ' placeholder="选项 ' + (i + 1) + '" value="' + esc(opt) + '">'
        + '<button class="opt-del" type="button" data-act="del-opt" data-index="' + i + '" title="删除这个选项">×</button>'
        + '</div>';
    }).join('') + '</div>'
      + (q.options.length < LF.VERIFY.MAX_OPTIONS
        ? '<button class="btn btn-sm" type="button" data-act="add-opt" style="margin-top:8px">＋ 加一个选项</button>'
        : '');
  }

  function questionHtml(q, index) {
    var typeName = q.type === 'judge' ? '判断题' : '选择题';
    var switchLabel = q.type === 'judge' ? '切换为选择题' : '切换为判断题';
    return '' +
      '<div class="q-item" data-key="' + q.key + '">' +
        '<div class="q-head">' +
          '<span class="q-no">第 ' + (index + 1) + ' 题 · ' + typeName + '</span>' +
          '<div class="q-tools">' +
            '<button class="btn-mini" type="button" data-act="switch">' + switchLabel + '</button>' +
            '<button class="btn-mini btn-mini-danger" type="button" data-act="del-q">删除</button>' +
          '</div>' +
        '</div>' +
        '<div class="q-stem"><input class="input" data-role="stem" maxlength="70"' +
          ' placeholder="题干，例如：伞柄的材质是" value="' + esc(q.stem) + '"></div>' +
        optionsBlock(q) +
        '<div class="q-warn" hidden></div>' +
      '</div>';
  }

  function renderQuestions() {
    if (!el.questionList) return;
    el.questionList.innerHTML = state.questions.length
      ? state.questions.map(questionHtml).join('')
      : '<div class="q-empty">还没有题目。点下面的「＋ 判断题 / ＋ 选择题」开始出题，' +
        '或从上方下拉框插入一个分类模板再改。</div>';
    state.questions.forEach(function (q, i) { updateClarityWarning(i); });
  }

  /** 选项清晰度提示：只提示、不拦截。
   *  这条规则一旦误报，发布者的第一反应不是改选项，而是把提示当噪音忽略掉。 */
  function updateClarityWarning(index) {
    var q = state.questions[index];
    if (!q || !el.questionList) return;
    var node = el.questionList.querySelector('[data-key="' + q.key + '"] .q-warn');
    if (!node) return;
    var warnings = LF.checkOptionClarity(q.options);
    if (q.type === 'choice' && q.answer < 0) {
      warnings.unshift('还没有指定正确答案：点一下选项左边的圆圈。');
    }
    if (warnings.length) {
      node.hidden = false;
      node.innerHTML = warnings.map(function (w) { return '⚠️ ' + esc(w); }).join('<br>');
    } else {
      node.hidden = true;
      node.innerHTML = '';
    }
  }

  function reRenderQuestion(index) {
    var q = state.questions[index];
    var node = el.questionList.querySelector('[data-key="' + q.key + '"]');
    if (!node) { renderQuestions(); return; }
    var wrap = document.createElement('div');
    wrap.innerHTML = questionHtml(q, index);
    node.parentNode.replaceChild(wrap.firstChild, node);
    updateClarityWarning(index);
  }

  /* ============================================================
   * 验证题区块：出不出题由「类型 + 分类」一起决定
   * ============================================================ */

  /** 当前「类型 + 分类」到底要不要出题。true / false / null（null = 分类不在字典里，无从判断）。 */
  function currentVerifyNeed() {
    if (!state.category) return null;
    if (state.type === 'lost') return false;
    return LF.allowVerifyFor(state.category);
  }

  /** 让题目数组与当前上下文对齐：不需要出题时收起、需要时还原。
   *  收起来而不是丢掉——用户写三道题是花了心思的，
   *  只因为切错一下分类就被清空、切回来还得重写，那是我们在惩罚他的误操作。 */
  function syncQuestionsForContext() {
    var need = currentVerifyNeed();
    var restored = false;
    if (need !== true) {
      if (state.questions.length) {
        state.stashedQuestions = state.questions;
        state.questions = [];
      }
    } else if (!state.questions.length && state.stashedQuestions.length) {
      state.questions = state.stashedQuestions;
      state.stashedQuestions = [];
      restored = true;
    }
    return { need: need, restored: restored };
  }

  function renderQuizSection() {
    var cat = LF.categoryOf(state.category);
    var need = cat ? LF.allowVerifyFor(cat.key) : null;

    if (!state.category) {
      el.quizFieldset.hidden = true;
      return;
    }
    el.quizFieldset.hidden = false;

    // 寻物信息不出题：寻物的人本来就希望别人联系他，给他设门槛是反的
    if (state.type === 'lost') {
      el.quizTools.hidden = true;
      el.templateSelect.hidden = true;
      el.questionList.style.display = 'none';
      el.questionList.innerHTML = '';   // 收起时把上一批题的 DOM 一起清掉，不留"看不见但还在"的节点
      el.quizLegend.textContent = '认领验证题（本条不需要）';
      el.quizHelp.innerHTML = '<div class="note">寻物启事不出验证题：你希望别人捡到后主动联系你，'
        + '给别人设门槛只会让线索变少。验证题用在<strong>招领</strong>信息上，用来挡住冒领的人。</div>';
      return;
    }

    // 「其他」类没有能锁死的特征，硬出题只会逼人把描述抄一遍 → 走信任模式
    if (need === false) {
      el.quizTools.hidden = true;
      el.templateSelect.hidden = true;
      el.questionList.style.display = 'none';
      el.questionList.innerHTML = '';
      el.quizLegend.textContent = '认领验证题（本条不设）';
      el.quizHelp.innerHTML =
        '<div class="trust-box">' +
          '<h4>📦 「' + esc(cat.name) + '」不设认领验证题，改走信任模式</h4>' +
          '<p>这一类物品没有客观、能锁死的特征（一本书、一串钥匙、一个说不清型号的充电器），' +
          '硬要出题，出题人只能把描述里的细节再抄一遍，而冒领者照着公开描述就能选对。</p>' +
          '<ul>' +
            '<li>描述和照片会<strong>直接公开</strong>；</li>' +
            '<li>联系方式对所有人<strong>直接可见</strong>；</li>' +
            '<li>想认领的人会直接联系你核对。</li>' +
          '</ul>' +
          '<p style="margin-top:8px"><span class="cost">代价：</span>这一类没有防冒领闸门，' +
          '理论上谁先看到都能联系你。所以<strong>别把唯一凭据写进公开描述</strong>' +
          '（比如"书里夹着一张写名字的借书凭条"——这句话本身就是答案）。</p>' +
        '</div>';
      return;
    }

    if (need === null) {
      el.quizFieldset.hidden = true;
      return;
    }

    // 需要出题
    el.quizTools.hidden = false;
    el.templateSelect.hidden = false;
    el.questionList.style.display = '';
    el.quizLegend.textContent = '认领验证题';
    el.quizHelp.innerHTML = '<div class="note">'
      + '招领信息建议出 ' + LF.VERIFY.SUGGEST_QUESTIONS + ' 道题（' + LF.VERIFY.MIN_QUESTIONS + '~'
      + LF.VERIFY.MAX_QUESTIONS + ' 道，每题 ' + LF.VERIFY.MIN_OPTIONS + '~' + LF.VERIFY.MAX_OPTIONS + ' 个选项）。'
      + '认领人要<strong>一次答完全部题目</strong>，<strong>全部答对</strong>才能看到你的联系方式，'
      + '最多答 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次；'
      + '答满 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次仍未通过会转入人工审核，由你判断是否交还。'
      + '<br>出题要点：问<strong>只有物主才知道</strong>的客观事实（序列号、颜色、数量、有无标记），'
      + '不要问主观感受，也不要把答案写进公开描述里。'
      + '</div>';
    renderQuestions();
  }

  /* ============================================================
   * 表单 <-> 模型
   * ============================================================ */

  function collect() {
    return {
      type: state.type,
      title: el.title.value,
      category: state.category,
      location: el.location.value,
      happenedAt: el.happenedAt.value,
      description: el.description.value,
      contactName: el.contactName.value,
      contactWay: el.contactWay.value,
      photo: state.photo,
      questions: state.questions.map(function (q) {
        return { type: q.type, stem: q.stem, options: q.options.slice(), answer: q.answer };
      })
    };
  }

  function applyData(data) {
    state.type = data.type || 'lost';
    state.category = data.category || '';
    state.photo = data.photo || '';
    el.title.value = data.title || '';
    el.location.value = data.location || '';
    el.happenedAt.value = data.happenedAt || LF.today();
    el.description.value = data.description || '';
    el.contactName.value = data.contactName || '';
    el.contactWay.value = data.contactWay || '';

    state.questions = (data.questions || []).map(function (q) {
      var nq = newQuestion(q.type);
      nq.stem = q.stem || '';
      if (q.type === 'judge') {
        nq.options = LF.VERIFY.JUDGE_OPTIONS.slice();
        nq.answer = (q.answer === 1) ? 1 : 0;
      } else {
        nq.options = (q.options && q.options.length ? q.options.slice() : ['', '', '']);
        while (nq.options.length < LF.VERIFY.MIN_OPTIONS) nq.options.push('');
        nq.answer = typeof q.answer === 'number' ? q.answer : -1;
      }
      return nq;
    });

    renderTypePicker();
    renderCategoryPicker();
    renderQuizSection();
    renderTemplates();
    renderPhoto();
    updateCounters();
  }

  function updateCounters() {
    el.cTitle.textContent = el.title.value.trim().length + ' / ' + LF.LIMITS.TITLE_MAX;
    el.cTitle.classList.toggle('over', el.title.value.trim().length > LF.LIMITS.TITLE_MAX);
    el.cDescription.textContent = el.description.value.trim().length + ' / ' + LF.LIMITS.DESC_MAX;
    el.cDescription.classList.toggle('over', el.description.value.trim().length > LF.LIMITS.DESC_MAX);
  }

  /* ============================================================
   * 错误展示
   * ============================================================ */

  var FIELD_LABEL = {
    type: '信息类型', title: '物品名称', category: '物品分类', location: '地点',
    happenedAt: '日期', description: '详细描述', contactName: '称呼', contactWay: '联系方式',
    photo: '照片', questions: '验证题'
  };

  function clearErrors() {
    el.errorBox.innerHTML = '';
    Array.prototype.forEach.call(document.querySelectorAll('.field.is-error'), function (n) {
      n.classList.remove('is-error');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.field-error'), function (n) {
      n.hidden = true;
      n.textContent = '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('.q-item.is-error'), function (n) {
      n.classList.remove('is-error');
    });
  }

  function showErrors(errors) {
    clearErrors();
    var messages = [];
    Object.keys(errors).forEach(function (field) {
      var msg = errors[field];
      // 题目字段是 q0.stem 这种形式，归到第几题上
      var qMatch = /^q(\d+)\./.exec(field);
      if (qMatch) {
        var qIndex = Number(qMatch[1]);
        var q = state.questions[qIndex];
        if (q) {
          var node = el.questionList.querySelector('[data-key="' + q.key + '"]');
          if (node) node.classList.add('is-error');
        }
        messages.push(msg);
        return;
      }
      var label = FIELD_LABEL[field];
      messages.push(label ? (label + '：' + msg) : msg);
      var fieldNode = document.getElementById('f-' + field);
      if (fieldNode) fieldNode.classList.add('is-error');
      var errNode = document.getElementById('err-' + field);
      if (errNode) { errNode.hidden = false; errNode.textContent = '⚠️ ' + msg; }
    });

    el.errorBox.innerHTML = '<div class="error-box"><b>还有 ' + messages.length + ' 处需要修改：</b>'
      + '<ul>' + messages.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>';
    el.errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ============================================================
   * 照片
   * ============================================================ */

  function renderPhoto() {
    if (state.photo) {
      el.photoPreview.outerHTML = '<img class="photo-preview" id="photoPreview" src="' + esc(state.photo) + '" alt="物品照片预览">';
    } else {
      var img = document.getElementById('photoPreview');
      if (img && img.tagName === 'IMG') {
        img.outerHTML = '<div id="photoPreview" class="photo-empty">暂无照片</div>';
      } else if (img) {
        img.textContent = '暂无照片';
      }
    }
    el.photoPreview = document.getElementById('photoPreview');
  }

  el.photo.addEventListener('change', function () {
    var file = el.photo.files && el.photo.files[0];
    if (!file) return;
    el.photoPreview.textContent = '压缩中…';
    LF.compressImage(file, LF.LIMITS.PHOTO_MAX_EDGE, LF.LIMITS.PHOTO_QUALITY).then(function (dataUrl) {
      state.photo = dataUrl;
      renderPhoto();
      UI.toast('照片已压缩到 ' + Math.round(dataUrl.length / 1024) + ' KB');
      scheduleDraft();
    }).catch(function (err) {
      renderPhoto();
      UI.toast(err.message || '照片处理失败', 'error');
    });
  });

  el.removePhoto.addEventListener('click', function () {
    state.photo = '';
    el.photo.value = '';
    renderPhoto();
    scheduleDraft();
  });

  /* ============================================================
   * 草稿
   * ============================================================ */

  var scheduleDraft = LF.debounce(function () {
    if (state.mode === 'edit') return;
    var data = collect();
    delete data.photo;   // 照片体积大，不进草稿
    data.savedAt = LF.formatDateTime(Date.now());
    store.saveDraft(data);
    el.draftTip.textContent = '草稿已于 ' + data.savedAt + ' 自动保存';
  }, 400);

  function maybeRestoreDraft() {
    if (state.mode === 'edit') return;
    var draft = store.getDraft();
    if (!draft || (!draft.title && !draft.description && !(draft.questions || []).length)) return;

    var modal = UI.openModal({
      html:
        '<h3>发现一份未完成的草稿</h3>' +
        '<p>上次保存于 ' + esc(draft.savedAt || '未知时间') + '。要接着填吗？</p>' +
        '<div class="dialog-actions">' +
          '<button class="btn" data-act="discard" type="button">丢弃草稿</button>' +
          '<button class="btn btn-primary" data-act="restore" type="button">恢复填写</button>' +
        '</div>'
    });
    modal.el.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'restore') {
        applyData(draft);
        state.photo = '';
        modal.close();
        UI.toast('草稿已恢复，照片需要重新选择');
      } else if (act === 'discard') {
        store.clearDraft();
        modal.close();
        el.draftTip.textContent = '';
      }
    });
  }

  el.saveDraftBtn.addEventListener('click', function () {
    scheduleDraft();
    UI.toast('草稿已保存');
  });

  el.clearDraftBtn.addEventListener('click', function () {
    store.clearDraft();
    el.draftTip.textContent = '';
    UI.toast('草稿已清除');
  });

  /* ============================================================
   * 事件绑定
   * ============================================================ */

  el.typePicker.addEventListener('click', function (e) {
    var btn = e.target.closest('.type-option');
    if (!btn) return;
    state.type = btn.getAttribute('data-type');
    renderTypePicker();
    var sync = syncQuestionsForContext();
    renderQuizSection();
    if (sync.restored) UI.toast('已把你之前写的验证题放回来');
    scheduleDraft();
  });

  el.categoryPicker.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cat]');
    if (!btn) return;
    var next = btn.getAttribute('data-cat');
    var changed = next !== state.category;
    state.category = next;
    renderCategoryPicker();
    renderTemplates();
    if (changed) {
      // 换分类会连带改变"要不要出题"，所以必须重算这一块
      var sync = syncQuestionsForContext();
      renderQuizSection();
      if (sync.need === true && !state.questions.length) {
        UI.toast('这一类需要出验证题，可从「插入分类模板」快速开始');
      } else if (sync.restored) {
        UI.toast('已把你之前写的验证题放回来');
      }
    }
    scheduleDraft();
  });

  el.title.addEventListener('input', function () { updateCounters(); scheduleDraft(); });
  el.description.addEventListener('input', function () { updateCounters(); scheduleDraft(); });
  el.location.addEventListener('input', scheduleDraft);
  el.happenedAt.addEventListener('change', scheduleDraft);
  el.contactName.addEventListener('input', scheduleDraft);
  el.contactWay.addEventListener('input', scheduleDraft);

  el.addJudge.addEventListener('click', function () {
    if (state.questions.length >= LF.VERIFY.MAX_QUESTIONS) {
      UI.toast('最多 ' + LF.VERIFY.MAX_QUESTIONS + ' 道题', 'error');
      return;
    }
    // 不预选正确答案：默认勾上"正确"会让发布者少点一下，但也可能就这么发出去了——
    // 而一个错的答案是直接把真失主锁在门外，代价比多点一下大得多。
    state.questions.push(newQuestion('judge'));
    renderQuestions();
    scheduleDraft();
  });

  el.addChoice.addEventListener('click', function () {
    if (state.questions.length >= LF.VERIFY.MAX_QUESTIONS) {
      UI.toast('最多 ' + LF.VERIFY.MAX_QUESTIONS + ' 道题', 'error');
      return;
    }
    state.questions.push(newQuestion('choice'));
    renderQuestions();
    scheduleDraft();
  });

  el.templateSelect.addEventListener('change', function () {
    var cat = LF.categoryOf(state.category);
    var idx = Number(el.templateSelect.value);
    var list = (cat && cat.templates) ? cat.templates : [];
    var tpl = list[idx];
    el.templateSelect.value = '';
    if (!tpl) return;
    if (state.questions.length >= LF.VERIFY.MAX_QUESTIONS) {
      UI.toast('最多 ' + LF.VERIFY.MAX_QUESTIONS + ' 道题，请先删掉一道', 'error');
      return;
    }
    var q = newQuestion(tpl.type);
    q.stem = tpl.stem;
    if (tpl.type === 'judge') {
      q.options = LF.VERIFY.JUDGE_OPTIONS.slice();
    } else {
      q.options = (tpl.options || ['', '', '']).slice();
      while (q.options.length < LF.VERIFY.MIN_OPTIONS) q.options.push('');
    }
    q.answer = -1;   // 模板只给题面和选项，正确答案一律由发布者自己指
    state.questions.push(q);
    renderQuestions();
    scheduleDraft();
  });

  // 题目区全部用事件委托：题目节点会被反复重建，逐个绑事件一定会失效
  el.questionList.addEventListener('input', function (e) {
    var qNode = e.target.closest('.q-item');
    if (!qNode) return;
    var index = state.questions.findIndex(function (q) { return q.key === qNode.getAttribute('data-key'); });
    if (index === -1) return;
    var q = state.questions[index];
    var role = e.target.getAttribute('data-role');

    if (role === 'stem') {
      q.stem = e.target.value;          // 只改模型，不重绘，保住焦点
      scheduleDraft();
    } else if (role === 'opt') {
      var oi = Number(e.target.getAttribute('data-index'));
      q.options[oi] = e.target.value;
      updateClarityWarning(index);      // 选项变了，易混词提示跟着变
      scheduleDraft();
    }
  });

  el.questionList.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-role') !== 'answer') return;
    var qNode = e.target.closest('.q-item');
    var index = state.questions.findIndex(function (q) { return q.key === qNode.getAttribute('data-key'); });
    if (index === -1) return;
    state.questions[index].answer = Number(e.target.value);
    updateClarityWarning(index);
    for (var i = index + 1; i < state.questions.length; i++) updateClarityWarning(i);
    var marks = qNode.querySelectorAll('.opt-mark');
    Array.prototype.forEach.call(marks, function (m, i) {
      m.textContent = (i === state.questions[index].answer) ? '✔ 正确' : '　';
    });
    scheduleDraft();
  });

  el.questionList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var qNode = btn.closest('.q-item');
    var index = state.questions.findIndex(function (q) { return q.key === qNode.getAttribute('data-key'); });
    if (index === -1) return;
    var q = state.questions[index];
    var act = btn.getAttribute('data-act');

    if (act === 'del-q') {
      state.questions.splice(index, 1);
      renderQuestions();
    } else if (act === 'switch') {
      if (q.type === 'judge') {
        q.type = 'choice';
        q.options = ['', '', ''];
        q.answer = -1;
      } else {
        q.type = 'judge';
        q.options = LF.VERIFY.JUDGE_OPTIONS.slice();
        q.answer = -1;
      }
      reRenderQuestion(index);
    } else if (act === 'add-opt') {
      if (q.options.length >= LF.VERIFY.MAX_OPTIONS) {
        UI.toast('每题最多 ' + LF.VERIFY.MAX_OPTIONS + ' 个选项', 'error');
        return;
      }
      q.options.push('');
      reRenderQuestion(index);
    } else if (act === 'del-opt') {
      if (q.options.length <= LF.VERIFY.MIN_OPTIONS) {
        UI.toast('每题至少 ' + LF.VERIFY.MIN_OPTIONS + ' 个选项', 'error');
        return;
      }
      var oi = Number(btn.getAttribute('data-index'));
      q.options.splice(oi, 1);
      // 正确答案下标跟着重排——界面删了一行，答案不能还指着老位置
      if (q.answer === oi) q.answer = -1;
      else if (q.answer > oi) q.answer -= 1;
      reRenderQuestion(index);
    }
    scheduleDraft();
  });

  /* ============================================================
   * 提交
   * ============================================================ */

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    var data = collect();
    var result = state.mode === 'edit'
      ? store.updatePost(state.editId, data)
      : store.createPost(data);

    if (!result.ok) {
      showErrors(result.errors);
      UI.toast('还有内容需要修改', 'error');
      return;
    }

    store.clearDraft();
    el.submitBtn.disabled = true;
    el.submitBtn.textContent = '处理中…';

    if (state.mode === 'edit') {
      UI.toast('已保存修改');
      setTimeout(function () { UI.go(UI.detailUrl(result.post.id, 'mine')); }, 400);
    } else {
      setTimeout(function () { UI.go('success.html?id=' + encodeURIComponent(result.post.id)); }, 300);
    }
  });

  /* ============================================================
   * 启动
   * ============================================================ */

  renderLocations();
  el.contactHint.textContent = LF.CONTACT_HINT;

  var editId = UI.param('id');
  if (editId) {
    var post = store.getPost(editId);
    if (!post) {
      el.errorBox.innerHTML = '<div class="error-box">这条信息不存在或已被删除，无法编辑。</div>';
      el.form.style.display = 'none';
      return;
    }
    if (!post.isOwner) {
      el.errorBox.innerHTML = '<div class="error-box">只有发布者本人可以编辑这条信息。</div>';
      el.form.style.display = 'none';
      return;
    }
    state.mode = 'edit';
    state.editId = post.id;
    el.pageTitle.textContent = '编辑信息';
    el.pageSub.textContent = '改动会立即生效。如果改了验证题，认领人的作答次数会重置为 ' + LF.VERIFY.MAX_ATTEMPTS + ' 次。';
    el.editTip.hidden = false;
    el.submitBtn.textContent = '保存修改';
    var raw = store.debugState().posts.filter(function (p) { return p.id === post.id; })[0];
    applyData({
      type: raw.type, title: raw.title, category: raw.category, location: raw.location,
      happenedAt: raw.happenedAt, description: raw.description, contactName: raw.contactName,
      contactWay: raw.contactWay, photo: raw.photo, questions: raw.questions
    });
  } else {
    var profile = store.getProfile();
    applyData({
      type: 'lost',
      category: '',
      happenedAt: LF.today(),
      contactName: profile.name || '',
      contactWay: profile.contact || ''
    });
    maybeRestoreDraft();
  }

  updateCounters();
})();
