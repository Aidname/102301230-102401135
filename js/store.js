/*!
 * store.js —— 数据层（本项目的核心）
 *
 * 设计原则：**业务规则全部收在这一层，页面只负责收集输入和画界面。**
 * 这样做换来两个直接好处：
 *   1. 改一处规则就全局生效，不会出现"详情页改了、搜索结果还漏着"；
 *   2. 这些规则能被单元测试一条条钉住，而且不需要浏览器环境。
 *
 * 有一条规则贯穿全文件：**界面藏起来不算数，数据里没有才算数。**
 * 验证题的正确答案、认领记录、申诉明细、未解锁的联系方式，
 * 都是在 toPublic() 里被真正删掉的，而不是靠前端 display:none。
 * 打开控制台也拿不到——因为对象里压根没有这个字段。
 */
(function (global) {
  'use strict';

  var LF = global.LF;
  if (!LF && typeof require === 'function') {
    require('./config.js');
    require('./utils.js');
    LF = global.LF;
  }
  if (!LF) throw new Error('store.js 需要先加载 config.js 与 utils.js');

  /* ============================================================
   * 一、存储适配器
   * ------------------------------------------------------------
   * 数据层的存储是**注入**进去的：只要求传进来的对象有
   * getItem / setItem / removeItem 三个方法（和 localStorage 一模一样）。
   * 于是浏览器里传 localStorage、测试里传内存实现，业务代码一个字都不用改。
   * ============================================================ */

  function createMemoryAdapter(initial) {
    var map = {};
    if (initial) {
      for (var k in initial) if (Object.prototype.hasOwnProperty.call(initial, k)) map[k] = String(initial[k]);
    }
    var adapter = {
      kind: 'memory',
      getItem: function (key) {
        var k = String(key);
        return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
      },
      setItem: function (key, value) { map[String(key)] = String(value); },
      removeItem: function (key) { delete map[String(key)]; },
      clear: function () { map = {}; }
    };
    return adapter;
  }

  /** 真写一次再删掉来确认可用——无痕模式或企业策略下，连读 localStorage 属性都可能抛异常，
   *  所以"能拿到对象"不等于"能用"。 */
  function probeStorage(storage) {
    if (!storage) return false;
    try {
      var key = '__lf_probe__';
      storage.setItem(key, '1');
      var ok = storage.getItem(key) === '1';
      storage.removeItem(key);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /** 降级链：localStorage → sessionStorage → 内存。
   *
   *  为什么中间要夹一层 sessionStorage：这是个多页应用，每跳一次页面，
   *  内存里的变量全部重置。如果 localStorage 不可用就直接退回内存，
   *  「发布 → 跳成功页」这一步数据就没了，主流程当场断掉。
   *  sessionStorage 至少能让同一标签页内把流程走完——
   *  降级的目标是"功能仍然可用"，不是"程序不崩"这么低的标准。 */
  function createBrowserAdapter() {
    var candidates = [];
    try { if (global.localStorage) candidates.push({ kind: 'local', s: global.localStorage }); } catch (e) { /* 策略禁止 */ }
    try { if (global.sessionStorage) candidates.push({ kind: 'session', s: global.sessionStorage }); } catch (e) { /* 策略禁止 */ }
    for (var i = 0; i < candidates.length; i++) {
      if (probeStorage(candidates[i].s)) {
        var s = candidates[i].s;
        s.kind = candidates[i].kind;
        return s;
      }
    }
    return createMemoryAdapter();
  }

  LF.createMemoryAdapter = createMemoryAdapter;
  LF.createBrowserAdapter = createBrowserAdapter;
  LF.probeStorage = probeStorage;

  /* ============================================================
   * 二、空数据库与老数据迁移
   * ============================================================ */

  function emptyDb(ownerId) {
    return {
      version: LF.DATA_VERSION,
      seq: 0,
      ownerId: ownerId || LF.uid('me'),
      posts: [],
      profile: { name: '', contact: '', college: '', campus: '' },
      history: [],
      draft: null,
      unlocked: [],
      vouchers: {},
      viewedIds: []
    };
  }

  /** 把任意来源的 db 整形成当前版本。
   *  老数据必须能就地升级：规则改了、历史数据却按老规则继续跑，
   *  是最难被发现的一类问题——用户看得见现象，却没有任何入口能修。 */
  function migrate(raw, ownerId) {
    var db = emptyDb(ownerId);
    if (!raw || typeof raw !== 'object') return db;

    var from = Number(raw.version) || 0;
    var posts = LF.isArray(raw.posts) ? raw.posts : [];

    db.ownerId = raw.ownerId || db.ownerId;
    db.seq = Number(raw.seq) || 0;
    db.profile = (raw.profile && typeof raw.profile === 'object') ? raw.profile : db.profile;
    db.history = LF.isArray(raw.history) ? raw.history.slice(0, LF.LIMITS.HISTORY_MAX) : [];
    db.draft = raw.draft && typeof raw.draft === 'object' ? raw.draft : null;
    db.unlocked = LF.isArray(raw.unlocked) ? raw.unlocked.slice() : [];
    db.vouchers = (raw.vouchers && typeof raw.vouchers === 'object') ? raw.vouchers : {};

    db.posts = posts.filter(function (p) { return p && typeof p === 'object' && p.id; })
      .map(function (p) { return normalizeStoredPost(p, from); });

    db.version = LF.DATA_VERSION;
    return db;
  }

  /** 逐字段整形一条历史记录，缺的补、坏的丢、按新规则作废的清理掉。 */
  function normalizeStoredPost(p, fromVersion) {
    var type = (p.type === 'lost' || p.type === 'found') ? p.type : 'lost';
    var post = {
      id: String(p.id),
      code: p.code || 'LF00000000000',
      type: type,
      title: LF.clean(p.title),
      category: LF.categoryOf(p.category) ? p.category : 'other',
      location: LF.clean(p.location),
      happenedAt: LF.clean(p.happenedAt),
      description: LF.cleanMultiline(p.description),
      contactName: LF.clean(p.contactName),
      contactWay: LF.clean(p.contactWay),
      photo: typeof p.photo === 'string' ? p.photo : '',
      status: p.status === LF.STATUSES.DONE ? LF.STATUSES.DONE : LF.STATUSES.ACTIVE,
      doneType: p.doneType || null,
      doneAt: p.doneAt || null,
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Number(p.updatedAt) || Number(p.createdAt) || Date.now(),
      views: Number(p.views) || 0,
      ownerId: p.ownerId || 'legacy',
      questions: [],
      attemptsLeft: LF.VERIFY.MAX_ATTEMPTS,
      claims: LF.isArray(p.claims) ? p.claims : [],
      appeals: LF.isArray(p.appeals) ? p.appeals : []
    };

    // ★ 规则变了，老数据也得跟着走：不需要验证的分类，残留的题目必须就地清掉。
    //   否则发布者会被永久锁在一个"详情页还在要求答题、发布页却已经没有出题入口"的旧流程里。
    var allowed = LF.allowVerifyFor(post.category) === true && post.type === 'found';
    if (allowed) {
      post.questions = normalizeQuestions(p.questions).questions;
    }
    if (!post.questions.length) {
      post.attemptsLeft = LF.VERIFY.MAX_ATTEMPTS;
      post.claims = [];
    } else if (typeof p.attemptsLeft === 'number') {
      post.attemptsLeft = Math.max(0, Math.min(LF.VERIFY.MAX_ATTEMPTS, p.attemptsLeft));
    }
    return post;
  }

  /** 把第一次结对作业那份脚手架（键名 lost_found_list）里的数据搬到新结构。
   *  老格式：{id, type, name, place, desc, contact, createTime, status:'ongoing'|'done'} */
  function migrateLegacyRecords(list, ownerId, now) {
    if (!LF.isArray(list)) return [];
    return list.filter(function (r) { return r && typeof r === 'object'; }).map(function (r, i) {
      var type = r.type === 'found' ? 'found' : 'lost';
      var rawContact = LF.clean(r.contact);
      var created = Date.parse(r.createTime);
      if (isNaN(created)) created = now;
      return {
        id: 'legacy_' + i + '_' + String(r.id || i),
        code: LF.makeCode(i + 1, { now: now }),
        type: type,
        title: LF.clean(r.name) || '（未命名物品）',
        category: 'other',
        location: LF.clean(r.place) || '未填写',
        happenedAt: LF.formatDate(created),
        description: LF.cleanMultiline(r.desc),
        contactName: '原发布者',
        contactWay: rawContact,
        photo: '',
        status: r.status === 'done' ? LF.STATUSES.DONE : LF.STATUSES.ACTIVE,
        doneType: null,
        doneAt: null,
        createdAt: created,
        updatedAt: created,
        views: 0,
        ownerId: ownerId,
        questions: [],
        attemptsLeft: LF.VERIFY.MAX_ATTEMPTS,
        claims: [],
        appeals: [],
        migratedFrom: 'legacy'
      };
    });
  }

  /* ============================================================
   * 三、校验
   * ============================================================ */

  /** 出题结构由数据层兜底：
   *  判断题的选项固定为「正确 / 错误」，发布者传什么都不算数；
   *  选择题里的空选项行会被丢掉、正确答案下标跟着重排。
   *
   *  为什么由数据层重排下标：界面上"删除一个选项""切换题型"都会改动选项数组，
   *  如果直接在页面上算正确答案的下标，很容易出现"看着选的是第 2 项，存进去却指到第 3 项"。
   *  把重排规则放在这里并配单元测试，这类错位就只有一个地方可能出错。 */
  function normalizeQuestions(rawList) {
    var errors = {};
    var list = LF.isArray(rawList) ? rawList : [];
    var questions = [];

    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      var qType = raw.type === 'judge' ? 'judge' : 'choice';
      var stem = LF.clean(raw.stem);
      var key = 'q' + i;

      if (qType === 'judge') {
        var jAnswer = Number(raw.answer) === 1 ? 1 : 0;
        questions.push({
          id: raw.id || LF.uid('q'),
          type: 'judge',
          stem: stem,
          options: LF.VERIFY.JUDGE_OPTIONS.slice(),
          answer: jAnswer
        });
        continue;
      }

      // 选择题：丢掉空选项行，正确答案下标跟着重排
      var rawOptions = LF.isArray(raw.options) ? raw.options : [];
      var options = [];
      var answer = -1;
      var oldAnswer = Number(raw.answer);
      for (var j = 0; j < rawOptions.length; j++) {
        var opt = LF.clean(rawOptions[j]);
        if (!opt) continue;                       // 空行直接丢
        if (j === oldAnswer) answer = options.length;  // 原答案落到新下标上
        options.push(opt);
      }
      questions.push({
        id: raw.id || LF.uid('q'),
        type: 'choice',
        stem: stem,
        options: options,
        answer: answer
      });
    }
    return { questions: questions, errors: errors };
  }

  /** 出题校验：题量、题干长度、选项数量与长度、选项是否重复、正确答案是否指定。 */
  function validateQuestions(rawList, categoryKey, type) {
    var errors = {};
    var need = LF.allowVerifyFor(categoryKey);

    // 只有「招领 + 该分类需要验证」才出题。
    // 寻物信息不出题：寻物的人本来就希望别人联系他，给他设门槛是反的。
    if (type !== 'found' || need !== true) {
      return { ok: true, errors: {}, questions: [] };
    }

    var normalized = normalizeQuestions(rawList);
    var questions = normalized.questions;

    if (questions.length < LF.VERIFY.MIN_QUESTIONS || questions.length > LF.VERIFY.MAX_QUESTIONS) {
      errors.questions = '验证题需要 ' + LF.VERIFY.MIN_QUESTIONS + '~' + LF.VERIFY.MAX_QUESTIONS
        + ' 道（建议 ' + LF.VERIFY.SUGGEST_QUESTIONS + ' 道），当前 ' + questions.length + ' 道';
      return { ok: false, errors: errors, questions: questions };
    }

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var label = '第 ' + (i + 1) + ' 题';
      if (q.stem.length < LF.VERIFY.MIN_STEM || q.stem.length > LF.VERIFY.MAX_STEM) {
        errors['q' + i + '.stem'] = label + '的题干需要 ' + LF.VERIFY.MIN_STEM + '~' + LF.VERIFY.MAX_STEM + ' 字';
        continue;
      }
      if (q.type === 'judge') {
        if (q.answer !== 0 && q.answer !== 1) {
          errors['q' + i + '.answer'] = label + '还没有指定正确答案';
        }
        continue;
      }
      if (q.options.length < LF.VERIFY.MIN_OPTIONS || q.options.length > LF.VERIFY.MAX_OPTIONS) {
        errors['q' + i + '.options'] = label + '需要 ' + LF.VERIFY.MIN_OPTIONS + '~' + LF.VERIFY.MAX_OPTIONS + ' 个选项';
        continue;
      }
      var tooLong = false;
      var normalizedSeen = {};
      var duplicated = false;
      for (var j = 0; j < q.options.length; j++) {
        if (q.options[j].length > LF.VERIFY.MAX_OPTION_LEN) tooLong = true;
        var nk = LF.normalizeText(q.options[j]);
        if (normalizedSeen[nk]) duplicated = true;
        normalizedSeen[nk] = true;
      }
      if (tooLong) {
        errors['q' + i + '.options'] = label + '的选项不能超过 ' + LF.VERIFY.MAX_OPTION_LEN + ' 字';
        continue;
      }
      if (duplicated) {
        errors['q' + i + '.options'] = label + '有重复的选项，认领人无法区分';
        continue;
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        errors['q' + i + '.answer'] = label + '还没有指定正确答案';
      }
    }

    return { ok: Object.keys(errors).length === 0, errors: errors, questions: questions };
  }

  /** 选项清晰度提醒（**只提示、不拦截**）。
   *  两个选项落在同一组易混词里，真失主很可能选错。
   *  但这条规则一旦误报，发布者的第一反应不是改选项，而是把提示当噪音忽略掉——
   *  所以它不参与"能不能发布"的判定，只在页面上提示一句。 */
  function checkOptionClarity(options) {
    var warnings = [];
    if (!LF.isArray(options) || options.length < 2) return warnings;
    for (var i = 0; i < options.length; i++) {
      for (var j = i + 1; j < options.length; j++) {
        var a = LF.clean(options[i]), b = LF.clean(options[j]);
        if (!a || !b) continue;
        var ga = LF.confusableGroupOf(a), gb = LF.confusableGroupOf(b);
        if (ga !== -1 && gb !== -1 && ga === gb) {
          warnings.push('「' + a + '」和「' + b + '」属于同一色系里分不清的深浅，'
            + '真失主可能因为选项太像而选错，建议换成差别更明显的说法');
        }
      }
    }
    return warnings;
  }

  /** 发布/编辑表单校验。返回 {ok, errors, value}：
   *  errors 是「字段名 → 中文提示」，value 是清理过、可直接落库的对象。 */
  function validatePost(raw) {
    raw = raw || {};
    var errors = {};
    var L = LF.LIMITS;

    var type = raw.type === 'found' ? 'found' : (raw.type === 'lost' ? 'lost' : '');
    if (!type) errors.type = '请选择信息类型（寻物 / 招领）';

    var title = LF.clean(raw.title);
    if (!title) errors.title = '请填写物品名称';
    else if (title.length < L.TITLE_MIN || title.length > L.TITLE_MAX) {
      errors.title = '物品名称需要 ' + L.TITLE_MIN + '~' + L.TITLE_MAX + ' 字，当前 ' + title.length + ' 字';
    }

    var category = LF.clean(raw.category);
    if (!category) errors.category = '请选择物品分类';
    else if (!LF.categoryOf(category)) errors.category = '物品分类不在可选范围内';

    var location = LF.clean(raw.location);
    if (!location) errors.location = '请填写丢失/拾取地点';
    else if (location.length > L.LOCATION_MAX) errors.location = '地点不能超过 ' + L.LOCATION_MAX + ' 字';

    var happenedAt = LF.clean(raw.happenedAt);
    if (!happenedAt) errors.happenedAt = '请选择丢失/拾取日期';
    else if (!LF.isValidDateStr(happenedAt)) errors.happenedAt = '日期格式不正确，应为 YYYY-MM-DD';
    else if (LF.isFutureDate(happenedAt, { now: raw.now })) errors.happenedAt = '日期不能晚于今天';

    var description = LF.cleanMultiline(raw.description);
    if (description.length > L.DESC_MAX) {
      errors.description = '详细描述不能超过 ' + L.DESC_MAX + ' 字，当前 ' + description.length + ' 字';
    }

    var contactName = LF.clean(raw.contactName);
    if (!contactName) errors.contactName = '请填写联系人称呼';
    else if (contactName.length > L.NAME_MAX) errors.contactName = '称呼不能超过 ' + L.NAME_MAX + ' 字';

    var contactWay = LF.clean(raw.contactWay);
    if (!contactWay) errors.contactWay = '请填写联系方式';
    else if (contactWay.length < L.CONTACT_MIN || contactWay.length > L.CONTACT_MAX) {
      errors.contactWay = '联系方式需要 ' + L.CONTACT_MIN + '~' + L.CONTACT_MAX + ' 个字符';
    } else if (!LF.matchContact(contactWay)) {
      errors.contactWay = '这不像一个可用的联系方式（' + LF.CONTACT_HINT + '）';
    }

    // 照片体积兜底：压缩后通常 30~60KB，超过 400KB 说明没走压缩流程
    var photo = typeof raw.photo === 'string' ? raw.photo : '';
    if (photo && photo.indexOf('data:image/') !== 0) {
      errors.photo = '照片格式不支持，请重新选择';
    } else if (photo.length > 400 * 1024) {
      errors.photo = '照片体积过大（超过 400KB），请换一张或重新上传';
    }

    var qResult = validateQuestions(raw.questions, category, type);
    for (var k in qResult.errors) {
      if (Object.prototype.hasOwnProperty.call(qResult.errors, k)) errors[k] = qResult.errors[k];
    }

    return {
      ok: Object.keys(errors).length === 0,
      errors: errors,
      value: {
        type: type,
        title: title,
        category: category,
        location: location,
        happenedAt: happenedAt,
        description: description,
        contactName: contactName,
        contactWay: contactWay,
        photo: photo,
        questions: qResult.questions
      }
    };
  }

  /* ============================================================
   * 四、搜索与筛选
   * ============================================================ */

  /** 关键词匹配：多词按「与」，命中范围包含标题/描述/地点/分类名/类型名/打码称呼。
   *
   *  用 indexOf 而不是 new RegExp：用户输入什么就搜什么，
   *  如果拼进正则解析，输入一个 "(" 就会让整个页面崩掉。 */
  function matchKeyword(post, keyword) {
    var terms = LF.normalizeText(keyword).split(' ').filter(Boolean);
    if (!terms.length) return true;
    var cat = LF.categoryOf(post.category);
    var typeInfo = LF.typeOf(post.type);
    var haystack = LF.normalizeText([
      post.title, post.description, post.location,
      cat ? cat.name : '', typeInfo ? typeInfo.name : '', typeInfo ? typeInfo.fullName : '',
      LF.maskName(post.contactName)
    ].join(' '));
    for (var i = 0; i < terms.length; i++) {
      if (haystack.indexOf(terms[i]) === -1) return false;
    }
    return true;
  }

  var FILTER_DIMS = ['type', 'category', 'location', 'status'];

  function matchesFilters(post, opts, ignore) {
    ignore = ignore || {};
    if (!ignore.keyword && !matchKeyword(post, opts.keyword)) return false;
    if (!ignore.type && opts.type && opts.type !== 'all' && post.type !== opts.type) return false;
    if (!ignore.category && opts.category && opts.category !== 'all' && post.category !== opts.category) return false;
    // 地点用「子串包含」：点"图书馆"要能命中"图书馆三楼自习区"
    if (!ignore.location && opts.location && opts.location !== 'all'
      && LF.normalizeText(post.location).indexOf(LF.normalizeText(opts.location)) === -1) return false;
    if (!ignore.status && opts.status && opts.status !== 'all' && post.status !== opts.status) return false;
    if (opts.onlyActive && post.status !== LF.STATUSES.ACTIVE) return false;
    if (opts.excludeStatus && post.status === opts.excludeStatus) return false;
    return true;
  }

  /** 排序。三条规则，两条是刻意的取舍：
   *  ①「已完成」一律沉底 —— 让活跃信息不被已完结信息淹没；
   *  ② 同状态内按所选规则排（最新 / 最早 / 最热）；
   *  ③ 非法 sort 值统一回退到 newest，前端传了怪值也不会崩。 */
  function sortPosts(list, sort) {
    var key = (sort === 'oldest' || sort === 'hot') ? sort : 'newest';
    return list.slice().sort(function (a, b) {
      var ra = a.status === LF.STATUSES.DONE ? 1 : 0;
      var rb = b.status === LF.STATUSES.DONE ? 1 : 0;
      if (ra !== rb) return ra - rb;
      if (key === 'hot') {
        if ((b.views || 0) !== (a.views || 0)) return (b.views || 0) - (a.views || 0);
        return b.createdAt - a.createdAt;
      }
      if (key === 'oldest') return a.createdAt - b.createdAt;
      return b.createdAt - a.createdAt;
    });
  }

  /* ============================================================
   * 五、store 工厂
   * ============================================================ */

  function createStore(storage, options) {
    options = options || {};
    var adapter = storage || createMemoryAdapter();
    var loaded = false;
    var db = null;
    var viewedThisSession = {};

    function now() { return LF.nowMs(options); }

    /* ---------- 读写 ---------- */

    function load() {
      if (loaded) return db;
      var raw = LF.safeJsonParse(adapter.getItem(LF.STORAGE_KEY), null);
      db = migrate(raw, options.ownerId);
      loaded = true;
      return db;
    }

    function save() {
      try {
        adapter.setItem(LF.STORAGE_KEY, JSON.stringify(db));
        return { ok: true };
      } catch (e) {
        // 配额写满不能抛给用户看，要给一句能操作的中文提示
        var quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
        return {
          ok: false,
          message: quota
            ? '浏览器本地存储已写满，请到「我的 → 本地数据」清理历史记录，或删掉带大图的信息后重试'
            : '数据保存失败：' + (e && e.message ? e.message : '未知错误')
        };
      }
    }

    function findIndex(id) {
      for (var i = 0; i < db.posts.length; i++) {
        if (db.posts[i].id === String(id)) return i;
      }
      return -1;
    }

    function find(id) {
      var i = findIndex(id);
      return i === -1 ? null : db.posts[i];
    }

    function actorOf(actor) { return actor || load().ownerId; }

    /* ---------- 视图（对外唯一出口） ---------- */

    function needsVerify(post) {
      if (!post || post.type !== 'found') return false;
      if (!post.questions || !post.questions.length) return false;   // 没题就没有门槛
      return LF.allowVerifyFor(post.category) === true;
    }

    /** 联系方式对当前访问者处于什么状态 */
    function lockStateOf(post, actor) {
      if (post.ownerId === actor) return 'owner';
      if (!needsVerify(post)) return 'open';       // 寻物信息、以及"其他"类的信任模式
      if (db.unlocked.indexOf(post.id) !== -1) return 'unlocked';
      return 'locked';
    }

    function hasPendingAppeal(post) {
      for (var i = 0; i < post.appeals.length; i++) {
        if (post.appeals[i].decision === 'pending') return true;
      }
      return false;
    }

    function canAppeal(post, actor) {
      if (post.ownerId === actor) return false;
      if (!needsVerify(post)) return false;
      if (db.unlocked.indexOf(post.id) !== -1) return false;
      if (hasPendingAppeal(post)) return false;
      return post.attemptsLeft <= 0;
    }

    /** 题目对外只给题干和选项，`answer` 在这一步被剥掉。
     *  注意这不是"藏起来"——下发的对象里根本没有 answer 这个属性。 */
    function publicQuestion(q) {
      return {
        id: q.id,
        type: q.type,
        typeName: q.type === 'judge' ? '判断题' : '选择题',
        stem: q.stem,
        options: q.options.slice()
      };
    }

    function toPublic(post, actor) {
      var cat = LF.categoryOf(post.category);
      var typeInfo = LF.typeOf(post.type);
      var isOwner = post.ownerId === actor;
      var state = lockStateOf(post, actor);
      var locked = state === 'locked';

      var out = {
        id: post.id,
        code: post.code,
        type: post.type,
        typeName: typeInfo ? typeInfo.name : post.type,
        typeFullName: typeInfo ? typeInfo.fullName : post.type,
        typeIcon: typeInfo ? typeInfo.icon : '',
        title: post.title,
        category: post.category,
        categoryName: cat ? cat.name : post.category,
        categoryIcon: cat ? cat.icon : '',
        location: post.location,
        happenedAt: post.happenedAt,
        description: post.description,
        photo: post.photo,
        status: post.status,
        statusText: LF.statusTextOf(post.type, post.status),
        doneType: post.doneType,
        doneAt: post.doneAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        createdAtText: LF.formatDateTime(post.createdAt),
        timeAgoText: LF.timeAgo(post.createdAt, { now: options.now }),
        views: post.views,
        isOwner: isOwner,
        // —— 认领验证 ——
        needsVerify: needsVerify(post),
        questionCount: post.questions.length,
        attemptsLeft: post.attemptsLeft,
        canAppeal: canAppeal(post, actor),
        appealPending: hasPendingAppeal(post),
        // 认领/申诉的**明细**只给发布者（走 listClaims / listAppeals），这里只给发布者一个条数，
        // 非发布者拿到的是 0——连"有多少人试过"都不透露。
        claimCount: isOwner ? post.claims.length : 0,
        appealCount: isOwner ? post.appeals.length : 0,
        lockState: state,
        contactLocked: locked,
        // 姓名对非发布者打码；联系方式未解锁时"根本不进页面"
        contactName: isOwner ? post.contactName : LF.maskName(post.contactName),
        contactWay: locked ? '' : post.contactWay,
        voucher: db.vouchers[post.id] || ''
      };
      // claims / appeals 一个字都不带出去：认领记录、申诉人的姓名与联系方式只给发布者，
      // 而那条路径走的是 listClaims / listAppeals（带发布者校验）。
      return out;
    }

    /* ---------- 查询 ---------- */

    function queryPosts(opts) {
      opts = opts || {};
      load();
      var actor = actorOf(opts.actor);
      var pool = db.posts.filter(function (p) { return matchesFilters(p, opts); });
      var sorted = sortPosts(pool, opts.sort);
      var start = Math.max(0, Number(opts.offset) || 0);
      var sliced = sorted.slice(start, opts.limit ? start + Number(opts.limit) : undefined);
      return sliced.map(function (p) { return toPublic(p, actor); });
    }

    function countPosts(opts) {
      opts = opts || {};
      load();
      return db.posts.filter(function (p) { return matchesFilters(p, opts); }).length;
    }

    /** 分面统计：每个筛选维度下各选项的条数。
     *  统计某一维时**忽略该维自身的筛选**，否则选中"图书馆"之后其他地点的条数全变 0，
     *  用户就没法从"图书馆"直接切到"食堂"了。 */
    function facets(opts) {
      opts = opts || {};
      load();
      var out = {};
      for (var d = 0; d < FILTER_DIMS.length; d++) {
        var dim = FILTER_DIMS[d];
        var ignore = {};
        ignore[dim] = true;
        var counts = {};
        for (var i = 0; i < db.posts.length; i++) {
          var p = db.posts[i];
          if (!matchesFilters(p, opts, ignore)) continue;
          var val = p[dim];
          if (dim === 'location') {
            // 地点是自由文本，按字典里的常用地点归并；归不上的记到"其他"
            val = matchLocationBucket(p.location);
          }
          counts[val] = (counts[val] || 0) + 1;
        }
        out[dim] = counts;
      }
      return out;
    }

    function matchLocationBucket(location) {
      var loc = LF.normalizeText(location);
      for (var i = 0; i < LF.LOCATIONS.length; i++) {
        if (loc.indexOf(LF.normalizeText(LF.LOCATIONS[i])) !== -1) return LF.LOCATIONS[i];
      }
      return '其他';
    }

    function getPost(id, actor) {
      load();
      var post = find(id);
      return post ? toPublic(post, actorOf(actor)) : null;
    }

    function getMyPosts(actor) {
      load();
      var me = actorOf(actor);
      return sortPosts(db.posts.filter(function (p) { return p.ownerId === me; }), 'newest')
        .map(function (p) { return toPublic(p, me); });
    }

    function getStats(actor) {
      load();
      var me = actorOf(actor);
      var mine = db.posts.filter(function (p) { return p.ownerId === me; });
      var stats = { total: mine.length, active: 0, done: 0, views: 0, pendingAppeals: 0, claims: 0 };
      for (var i = 0; i < mine.length; i++) {
        var p = mine[i];
        if (p.status === LF.STATUSES.DONE) stats.done++; else stats.active++;
        stats.views += p.views || 0;
        stats.claims += p.claims.length;
        for (var j = 0; j < p.appeals.length; j++) {
          if (p.appeals[j].decision === 'pending') stats.pendingAppeals++;
        }
      }
      return stats;
    }

    /** 热门搜索词：不写死，由真实数据统计得出。
     *  候选来自「常用地点 + 分类名 + 常见物品名词」，
     *  再按"有多少条信息能被这个词搜到"排序，搜不到的自然沉底。 */
    var COMMON_ITEMS = ['校园卡', '耳机', '水杯', '雨伞', '钥匙', '充电宝', '书包', '身份证', 'U盘', '眼镜', '手表', '课本'];
    function getHotKeywords(limit) {
      load();
      var candidates = LF.uniq(LF.LOCATIONS.concat(COMMON_ITEMS).concat(
        LF.CATEGORIES.map(function (c) { return c.name; })
      ));
      var scored = candidates.map(function (word) {
        var hits = 0;
        for (var i = 0; i < db.posts.length; i++) {
          if (matchKeyword(db.posts[i], word)) hits++;
        }
        return { word: word, hits: hits };
      }).filter(function (row) { return row.hits > 0; });
      scored.sort(function (a, b) { return b.hits - a.hits || a.word.localeCompare(b.word); });
      return scored.slice(0, limit || 8).map(function (row) { return row.word; });
    }

    /** 智能配对：类型相反 + 分类相同 + 仍在进行中 + 标题有两字重合，最多 3 条。 */
    function titleOverlap(a, b) {
      a = LF.normalizeText(a);
      b = LF.normalizeText(b);
      for (var i = 0; i < a.length - 1; i++) {
        if (b.indexOf(a.substr(i, 2)) !== -1) return true;
      }
      return false;
    }

    function findMatches(post, limit) {
      load();
      if (!post) return [];
      var opposite = post.type === 'lost' ? 'found' : 'lost';
      var actor = actorOf(null);
      var out = [];
      for (var i = 0; i < db.posts.length && out.length < (limit || 3); i++) {
        var p = db.posts[i];
        if (p.id === post.id) continue;
        if (p.type !== opposite) continue;
        if (p.status !== LF.STATUSES.ACTIVE) continue;
        if (p.category !== post.category) continue;
        if (!titleOverlap(post.title, p.title)) continue;
        out.push(toPublic(p, actor));
      }
      return out;
    }

    /* ---------- 写入 ---------- */

    function createPost(raw, actor) {
      load();
      // 把注入的时间一并交给校验：否则"日期不能晚于今天"这条规则在测试里
      // 会用真实的 Date.now()，固定时间的用例就会随运行时刻漂移。
      var input = {};
      for (var kk in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, kk)) input[kk] = raw[kk];
      }
      input.now = now();
      var result = validatePost(input);
      if (!result.ok) return { ok: false, errors: result.errors, post: null };

      var me = actorOf(actor);
      var v = result.value;
      db.seq = (db.seq || 0) + 1;
      var ts = now();
      var post = {
        id: LF.uid('p'),
        code: LF.makeCode(db.seq, { now: ts }),
        type: v.type,
        title: v.title,
        category: v.category,
        location: v.location,
        happenedAt: v.happenedAt,
        description: v.description,
        contactName: v.contactName,
        contactWay: v.contactWay,
        photo: v.photo,
        status: LF.STATUSES.ACTIVE,
        doneType: null,
        doneAt: null,
        createdAt: ts,
        updatedAt: ts,
        views: 0,
        ownerId: me,
        questions: v.questions,
        attemptsLeft: LF.VERIFY.MAX_ATTEMPTS,
        claims: [],
        appeals: []
      };
      db.posts.unshift(post);
      var saved = save();
      if (!saved.ok) {
        db.posts.shift();       // 落盘失败就回滚，别在内存里留一条存不进去的记录
        return { ok: false, errors: { _: saved.message }, post: null };
      }
      return { ok: true, errors: {}, post: toPublic(post, me), raw: post };
    }

    var PROTECTED_FIELDS = ['id', 'code', 'ownerId', 'createdAt', 'views', 'status', 'claims', 'appeals', 'attemptsLeft'];

    function updatePost(id, patch, actor) {
      load();
      var post = find(id);
      if (!post) return { ok: false, errors: { _: '这条信息不存在或已被删除' }, post: null };
      var me = actorOf(actor);
      if (post.ownerId !== me) {
        return { ok: false, errors: { _: '只能修改自己发布的信息' }, post: null };
      }

      // 把受保护字段从补丁里剔掉：即使有人绕过界面直接调数据层，
      // 也改不了 id / 编号 / 浏览量 / 归属，更伪造不出认领记录。
      var safe = {};
      for (var k in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
        if (PROTECTED_FIELDS.indexOf(k) !== -1) continue;
        safe[k] = patch[k];
      }

      var merged = {
        type: safe.type === undefined ? post.type : safe.type,
        title: safe.title === undefined ? post.title : safe.title,
        category: safe.category === undefined ? post.category : safe.category,
        location: safe.location === undefined ? post.location : safe.location,
        happenedAt: safe.happenedAt === undefined ? post.happenedAt : safe.happenedAt,
        description: safe.description === undefined ? post.description : safe.description,
        contactName: safe.contactName === undefined ? post.contactName : safe.contactName,
        contactWay: safe.contactWay === undefined ? post.contactWay : safe.contactWay,
        photo: safe.photo === undefined ? post.photo : safe.photo,
        questions: safe.questions === undefined ? post.questions : safe.questions,
        now: now()
      };

      var result = validatePost(merged);
      if (!result.ok) return { ok: false, errors: result.errors, post: null };
      var v = result.value;

      var questionsChanged = JSON.stringify(post.questions) !== JSON.stringify(v.questions);
      post.type = v.type;
      post.title = v.title;
      post.category = v.category;
      post.location = v.location;
      post.happenedAt = v.happenedAt;
      post.description = v.description;
      post.contactName = v.contactName;
      post.contactWay = v.contactWay;
      post.photo = v.photo;
      post.questions = v.questions;
      // 发布者换了题目 → 重新给满 3 次机会，否则老认领人会被上一版题目的失败记录卡住
      if (questionsChanged) {
        post.attemptsLeft = LF.VERIFY.MAX_ATTEMPTS;
        post.claims = [];
      }
      post.updatedAt = now();

      var saved = save();
      if (!saved.ok) return { ok: false, errors: { _: saved.message }, post: null };
      return { ok: true, errors: {}, post: toPublic(post, me) };
    }

    function removePost(id, actor) {
      load();
      var idx = findIndex(id);
      if (idx === -1) return { ok: false, message: '这条信息不存在或已被删除' };
      var me = actorOf(actor);
      if (db.posts[idx].ownerId !== me) return { ok: false, message: '只能删除自己发布的信息' };
      db.posts.splice(idx, 1);
      var pos = db.unlocked.indexOf(String(id));
      if (pos !== -1) db.unlocked.splice(pos, 1);
      delete db.vouchers[String(id)];
      save();
      return { ok: true };
    }

    /** 标记为「已找到 / 已归还」。
     *  幂等：第二次调用返回 unchanged:true，并且**不改动原有的完成时间**——
     *  否则"已归还于昨天"会变成"已归还于刚才"，记录就不准了。 */
    function markDone(id, actor) {
      load();
      var post = find(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      var me = actorOf(actor);
      if (post.ownerId !== me) return { ok: false, message: '只有发布者本人可以修改状态' };
      if (post.status === LF.STATUSES.DONE) {
        return { ok: true, unchanged: true, post: toPublic(post, me) };
      }
      post.status = LF.STATUSES.DONE;
      post.doneType = post.type === 'lost' ? 'found' : 'returned';
      post.doneAt = now();
      post.updatedAt = post.doneAt;
      save();
      return { ok: true, unchanged: false, post: toPublic(post, me) };
    }

    function restorePost(id, actor) {
      load();
      var post = find(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      var me = actorOf(actor);
      if (post.ownerId !== me) return { ok: false, message: '只有发布者本人可以修改状态' };
      post.status = LF.STATUSES.ACTIVE;
      post.doneType = null;
      post.doneAt = null;
      post.updatedAt = now();
      save();
      return { ok: true, post: toPublic(post, me) };
    }

    function addView(id) {
      load();
      var key = String(id);
      var post = find(key);
      if (!post) return 0;
      if (viewedThisSession[key]) return post.views;   // 同一次打开里刷新多次不重复计数
      viewedThisSession[key] = true;
      post.views = (post.views || 0) + 1;
      save();
      return post.views;
    }

    /* ---------- 认领验证 ---------- */

    /** 取题：只给题干和选项。
     *  刻意一次性给全部题目，不做"上一题/下一题"分页——
     *  分页会让人以为可以回头改，也让人误以为系统在逐题判定。 */
    function startClaim(id, actor) {
      load();
      var post = find(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      var me = actorOf(actor);
      if (!needsVerify(post)) {
        return { ok: false, message: '这条信息不需要认领验证，可以直接联系发布者' };
      }
      if (db.unlocked.indexOf(post.id) !== -1) {
        return { ok: false, message: '你已经通过验证了，直接看联系方式即可' };
      }
      return {
        ok: true,
        postId: post.id,
        title: post.title,
        categoryName: (LF.categoryOf(post.category) || {}).name || '',
        contactName: LF.maskName(post.contactName),
        attemptsLeft: post.attemptsLeft,
        maxAttempts: LF.VERIFY.MAX_ATTEMPTS,
        questions: post.questions.map(publicQuestion)
      };
    }

    /** 提交答案。answers 是与题目顺序对齐的下标数组，null/undefined 表示未作答。
     *
     *  两条关键规则都在这里：
     *  ① 没答完 → 只提示"还差几题"，**不消耗次数**；
     *  ② 判定完只回「通过 / 不通过」，**绝不回传"哪一题错了"**。
     *     第一版为了"让失主知道错在哪"必须回传错题下标，结果每答错一次就排除一个选项，
     *     3 次机会足够把答案试出来——限制次数形同虚设。
     *     现在统一的失败结果里连题号都不出现，前端改也造不出这个信息。 */
    function submitClaim(id, answers, actor) {
      load();
      var post = find(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      var me = actorOf(actor);
      if (post.ownerId === me) return { ok: false, message: '这是你自己发布的信息，无需认领验证' };
      if (!needsVerify(post)) return { ok: false, message: '这条信息不需要认领验证' };
      if (db.unlocked.indexOf(post.id) !== -1) {
        return { ok: false, message: '你已经通过验证了' };
      }
      if (post.attemptsLeft <= 0) {
        return {
          ok: false, locked: true, canAppeal: canAppeal(post, me), remaining: 0,
          message: '作答次数已用完，请通过「提交申诉」联系发布者人工核对'
        };
      }

      var list = LF.isArray(answers) ? answers : [];
      var missing = 0;
      for (var i = 0; i < post.questions.length; i++) {
        if (list[i] === null || list[i] === undefined || list[i] === '') missing++;
      }
      if (missing > 0) {
        return {
          ok: false, remaining: post.attemptsLeft,
          message: '还有 ' + missing + ' 道题没有作答，请全部选完再提交（本次不计入作答次数）'
        };
      }

      var passed = true;
      for (var j = 0; j < post.questions.length; j++) {
        if (Number(list[j]) !== post.questions[j].answer) { passed = false; break; }
      }

      if (passed) {
        var voucher = LF.makeVoucher({ now: options.now });
        db.unlocked.push(post.id);
        db.vouchers[post.id] = voucher;
        post.claims.unshift({ at: now(), passed: true, voucher: voucher });
        if (post.claims.length > 50) post.claims.length = 50;
        post.updatedAt = now();
        save();
        return {
          ok: true, passed: true, remaining: post.attemptsLeft, voucher: voucher,
          canAppeal: false,
          message: '验证通过，联系方式已解锁'
        };
      }

      var left = post.attemptsLeft - 1;
      post.attemptsLeft = left;
      post.claims.unshift({ at: now(), passed: false, voucher: '' });
      if (post.claims.length > 50) post.claims.length = 50;
      save();
      return {
        ok: true, passed: false, remaining: left, locked: left <= 0,
        canAppeal: left <= 0,
        message: '回答的细节与描述不符'
      };
    }

    function isUnlocked(id, actor) {
      load();
      var post = find(id);
      if (!post) return false;
      return lockStateOf(post, actorOf(actor)) !== 'locked';
    }

    /* ---------- 申诉（人工审核） ---------- */

    function canAppealById(id, actor) {
      load();
      var post = find(id);
      if (!post) return false;
      return canAppeal(post, actorOf(actor));
    }

    /** 申诉是一次落库的表单，不是一句弹窗文案。
     *  只做一个"请线下联系发布者"的弹窗最省事，但发布者就没有可判断的凭据了。 */
    function submitAppeal(id, form, actor) {
      load();
      var post = find(id);
      if (!post) return { ok: false, errors: { _: '这条信息不存在或已被删除' }, message: '这条信息不存在或已被删除' };
      var me = actorOf(actor);
      if (!canAppeal(post, me)) {
        return {
          ok: false, errors: { _: '现在还不能申诉' },
          message: post.attemptsLeft > 0
            ? '作答次数还没用完（还剩 ' + post.attemptsLeft + ' 次），请先尝试作答'
            : '已经提交过申诉或已解锁，无需重复提交'
        };
      }

      form = form || {};
      var errors = {};
      var name = LF.clean(form.claimantName);
      var contact = LF.clean(form.contact);
      var detail = LF.cleanMultiline(form.detail);
      if (!name) errors.claimantName = '请填写你的称呼';
      else if (name.length > LF.LIMITS.NAME_MAX) errors.claimantName = '称呼不能超过 ' + LF.LIMITS.NAME_MAX + ' 字';
      if (!contact) errors.contact = '请填写联系方式，否则发布者无法联系你';
      else if (!LF.matchContact(contact)) errors.contact = '这不像一个可用的联系方式（' + LF.CONTACT_HINT + '）';
      if (!detail) errors.detail = '请描述只有物主才知道的细节';
      else if (detail.length < LF.LIMITS.APPEAL_DETAIL_MIN || detail.length > LF.LIMITS.APPEAL_DETAIL_MAX) {
        errors.detail = '细节描述需要 ' + LF.LIMITS.APPEAL_DETAIL_MIN + '~' + LF.LIMITS.APPEAL_DETAIL_MAX + ' 字';
      }
      if (Object.keys(errors).length) return { ok: false, errors: errors, message: '请检查表单填写' };

      var appeal = {
        id: LF.uid('appeal'),
        claimantName: name,
        contact: contact,
        detail: detail,
        decision: 'pending',
        note: '',
        voucher: '',
        createdAt: now(),
        decidedAt: null
      };
      post.appeals.unshift(appeal);
      post.updatedAt = now();
      save();
      return { ok: true, errors: {}, appeal: appeal, message: '申诉已提交，等待发布者人工核对' };
    }

    /** 申诉明细只给发布者。这里做的是发布者校验，不是界面隐藏。 */
    function listAppeals(id, actor) {
      load();
      var post = find(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除', appeals: [] };
      var me = actorOf(actor);
      if (post.ownerId !== me) return { ok: false, message: '只有发布者本人可以查看申诉明细', appeals: [] };
      return { ok: true, appeals: post.appeals.map(function (a) { return LF.clone(a); }) };
    }

    /** 发布者处理申诉。同意交还则解锁联系方式并生成线下交接编号。 */
    function resolveAppeal(id, appealId, decision, note, actor) {
      load();
      var post = find(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      var me = actorOf(actor);
      if (post.ownerId !== me) return { ok: false, message: '只有发布者本人可以处理申诉' };
      if (decision !== 'accepted' && decision !== 'rejected') {
        return { ok: false, message: '处理结果只能是"同意交还"或"驳回"' };
      }
      var appeal = null;
      for (var i = 0; i < post.appeals.length; i++) {
        if (post.appeals[i].id === appealId) { appeal = post.appeals[i]; break; }
      }
      if (!appeal) return { ok: false, message: '这条申诉不存在' };
      if (appeal.decision !== 'pending') return { ok: false, message: '这条申诉已经处理过了' };

      appeal.decision = decision;
      appeal.note = LF.clean(note);
      appeal.decidedAt = now();
      if (decision === 'accepted') {
        appeal.voucher = LF.makeVoucher({ now: options.now });
        db.unlocked.push(post.id);
        db.vouchers[post.id] = appeal.voucher;
      }
      post.updatedAt = now();
      save();
      return { ok: true, appeal: LF.clone(appeal) };
    }

    /* ---------- 搜索历史 / 草稿 / 个人资料 ---------- */

    function getSearchHistory() { load(); return db.history.slice(); }

    function addSearchHistory(keyword) {
      load();
      var kw = LF.clean(keyword);
      if (!kw) return db.history.slice();
      db.history = db.history.filter(function (h) { return h !== kw; });
      db.history.unshift(kw);
      // 去重之后按上限截断：第 11 条进来，最旧的一条被挤掉
      if (db.history.length > LF.LIMITS.HISTORY_MAX) db.history.length = LF.LIMITS.HISTORY_MAX;
      save();
      return db.history.slice();
    }

    function removeSearchHistory(keyword) {
      load();
      db.history = db.history.filter(function (h) { return h !== keyword; });
      save();
      return db.history.slice();
    }

    function clearSearchHistory() { load(); db.history = []; save(); return []; }

    function getDraft() { load(); return db.draft ? LF.clone(db.draft) : null; }
    function saveDraft(draft) { load(); db.draft = draft ? LF.clone(draft) : null; save(); return getDraft(); }
    function clearDraft() { load(); db.draft = null; save(); }

    function getProfile() { load(); return LF.clone(db.profile) || {}; }
    function saveProfile(patch) {
      load();
      var p = patch || {};
      db.profile = {
        name: LF.clean(p.name !== undefined ? p.name : db.profile.name),
        contact: LF.clean(p.contact !== undefined ? p.contact : db.profile.contact),
        college: LF.clean(p.college !== undefined ? p.college : db.profile.college),
        campus: LF.clean(p.campus !== undefined ? p.campus : db.profile.campus)
      };
      save();
      return LF.clone(db.profile);
    }

    /* ---------- 数据管理 ---------- */

    function exportData() {
      load();
      return JSON.stringify({
        app: 'campus-lost-found', version: db.version,
        exportedAt: LF.formatDateTime(now()),
        posts: db.posts, profile: db.profile
      }, null, 2);
    }

    function importData(json) {
      load();
      var parsed = LF.safeJsonParse(json, null);
      if (!parsed || !LF.isArray(parsed.posts)) {
        return { ok: false, message: '文件格式不正确：需要是本系统导出的 JSON（缺少 posts 字段）' };
      }
      var incoming = parsed.posts.filter(function (p) { return p && p.id; })
        .map(function (p) { return normalizeStoredPost(p, Number(parsed.version) || LF.DATA_VERSION); });
      if (!incoming.length) return { ok: false, message: '文件里没有可导入的信息' };

      var existing = {};
      for (var i = 0; i < db.posts.length; i++) existing[db.posts[i].id] = i;
      var added = 0, updated = 0;
      for (var j = 0; j < incoming.length; j++) {
        var p = incoming[j];
        if (existing[p.id] === undefined) { db.posts.push(p); added++; }
        else { db.posts[existing[p.id]] = p; updated++; }
      }
      db.seq = Math.max(db.seq || 0, db.posts.length);
      if (parsed.profile && typeof parsed.profile === 'object') db.profile = parsed.profile;
      var saved = save();
      if (!saved.ok) return { ok: false, message: saved.message };
      return { ok: true, added: added, updated: updated, message: '导入完成：新增 ' + added + ' 条，覆盖 ' + updated + ' 条' };
    }

    function replaceAllPosts(posts) {
      load();
      db.posts = posts;
      db.seq = posts.length;
      db.unlocked = [];
      db.vouchers = {};
      save();
      return db.posts.length;
    }

    function clearAll() {
      load();
      db.posts = [];
      db.history = [];
      db.draft = null;
      db.unlocked = [];
      db.vouchers = {};
      db.seq = 0;
      save();
      return true;
    }

    function boot() {
      load();
      var legacy = null;
      try { legacy = adapter.getItem(LF.LEGACY_STORAGE_KEY); } catch (e) { /* 忽略 */ }
      if (legacy && !db.posts.length) {
        var list = LF.safeJsonParse(legacy, []);
        var migrated = migrateLegacyRecords(list, db.ownerId, now());
        if (migrated.length) {
          db.posts = migrated;
          db.seq = migrated.length;
          save();
          return { seeded: false, migrated: migrated.length };
        }
      }
      // 只在一条数据都没有时灌演示数据，绝不覆盖用户已有的内容
      if (!db.posts.length && options.seed !== false) {
        var seed = LF.buildSeedPosts(now(), db.ownerId);
        db.posts = seed;
        db.seq = seed.length;
        save();
        return { seeded: true, migrated: 0 };
      }
      return { seeded: false, migrated: 0 };
    }

    function seedDemo() {
      load();
      var seed = LF.buildSeedPosts(now(), db.ownerId);
      return replaceAllPosts(seed);
    }

    /** 测试用：清空并重新从存储加载 */
    function reset() { loaded = false; db = null; viewedThisSession = {}; return load(); }

    return {
      // 基础
      kind: adapter.kind || 'custom',
      ownerId: function () { return load().ownerId; },
      boot: boot, reset: reset,
      debugState: function () { return LF.clone(load()); },

      // 查询
      queryPosts: queryPosts, countPosts: countPosts, facets: facets,
      getPost: getPost, getMyPosts: getMyPosts, getStats: getStats,
      getHotKeywords: getHotKeywords, findMatches: findMatches,
      locationBucket: matchLocationBucket,

      // 写入
      validatePost: validatePost,
      createPost: createPost, updatePost: updatePost, removePost: removePost,
      markDone: markDone, restorePost: restorePost, addView: addView,

      // 认领验证
      needsVerify: needsVerify, canAppeal: canAppealById, isUnlocked: isUnlocked,
      startClaim: startClaim, submitClaim: submitClaim,

      // 申诉
      submitAppeal: submitAppeal, listAppeals: listAppeals, resolveAppeal: resolveAppeal,

      // 历史 / 草稿 / 资料
      getSearchHistory: getSearchHistory, addSearchHistory: addSearchHistory,
      removeSearchHistory: removeSearchHistory, clearSearchHistory: clearSearchHistory,
      getDraft: getDraft, saveDraft: saveDraft, clearDraft: clearDraft,
      getProfile: getProfile, saveProfile: saveProfile,

      // 数据管理
      exportData: exportData, importData: importData, seedDemo: seedDemo, clearAll: clearAll
    };
  }

  /** 页面入口用的一步到位版本：建适配器 → 建 store → 迁移 + 首次灌数据 */
  function bootStore(options) {
    options = options || {};
    var storage = options.storage || createBrowserAdapter();
    var store = createStore(storage, options);
    store.boot();
    return store;
  }

  LF.createStore = createStore;
  LF.bootStore = bootStore;
  LF.migrate = migrate;
  LF.migrateLegacyRecords = migrateLegacyRecords;
  LF.normalizeQuestions = normalizeQuestions;
  LF.validateQuestions = validateQuestions;
  LF.validatePost = validatePost;
  LF.checkOptionClarity = checkOptionClarity;
  LF.matchKeyword = matchKeyword;
  LF.sortPosts = sortPosts;
  LF.createMemoryAdapter = createMemoryAdapter;

  if (typeof module === 'object' && module.exports) module.exports = LF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
