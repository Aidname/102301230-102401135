/*!
 * config.js —— 业务字典层
 *
 * 这一层只放「数据」，不放逻辑：物品分类、校园地点、状态文案、校验阈值、出题模板。
 * 页面和 store.js 都从这里取值，所以改一处就全局生效，不用去找散落各处的硬编码。
 *
 * 加载方式：普通 <script>（浏览器 file:// 直接可用），同时也兼容 Node 的 require，
 * 这样同一份代码既能在 Chrome 里跑，也能被单元测试直接引用。
 */
(function (global) {
  'use strict';

  var LF = global.LF || (global.LF = {});

  /* ============================================================
   * 一、信息类型
   * ------------------------------------------------------------
   * lost  = 寻物启事（我丢了东西，请你联系我）
   * found = 招领启事（我捡到东西，请你来认领）
   * ============================================================ */
  LF.TYPES = [
    { key: 'lost', name: '寻物', fullName: '寻物启事', icon: '🔍', tone: 'lost' },
    { key: 'found', name: '招领', fullName: '招领启事', icon: '🙋', tone: 'found' }
  ];

  LF.typeOf = function (key) {
    for (var i = 0; i < LF.TYPES.length; i++) {
      if (LF.TYPES[i].key === key) return LF.TYPES[i];
    }
    return null;
  };

  /* ============================================================
   * 二、物品分类
   * ------------------------------------------------------------
   * allowVerify 决定「这一类要不要出认领验证题」：
   *   true  = 这一类有客观、锁得死的特征，可以出判断题/选择题；
   *   false = 这一类没有能锁死的特征（"其他"），硬出题只会逼人把描述抄一遍，
   *           所以改走「信任模式」——描述与联系方式直接公开。
   * searchHint 是给失主看的搜法引导：光说"请搜 X"不够，还得说清"Y 搜不到"，
   *   否则用户搜不到时会以为"没人捡到"，而不是"我搜错了"。
   * templates 是出题模板，降低拾得者的出题门槛。
   * ============================================================ */
  LF.CATEGORIES = [
    {
      key: 'card', name: '证件卡片', icon: '🪪', allowVerify: true,
      searchHint: '本类按证件名称或卡号搜索（如"校园卡""身份证"）。姓名、院系等信息不公开。',
      templates: [
        { type: 'choice', stem: '卡面上写的姓名是', options: ['', '', ''] },
        { type: 'choice', stem: '卡号后四位是', options: ['', '', ''] },
        { type: 'judge', stem: '卡面上贴有照片' },
        { type: 'judge', stem: '卡套/卡贴上有明显标记' }
      ]
    },
    {
      key: 'digital', name: '数码电子', icon: '🎧', allowVerify: true,
      searchHint: '本类按品牌、型号或颜色搜索（如"华为""AirPods"）。外观磨损、保护壳这类细节不公开。',
      templates: [
        { type: 'choice', stem: '物品的品牌是', options: ['', '', ''] },
        { type: 'choice', stem: '物品的颜色是', options: ['', '', ''] },
        { type: 'judge', stem: '机身/耳机盒上有明显的磕碰或划痕' },
        { type: 'judge', stem: '带保护壳或保护套' }
      ]
    },
    {
      key: 'daily', name: '生活用品', icon: '🧴', allowVerify: true,
      searchHint: '本类按物品名称和颜色搜索（如"水杯""保温杯"）。杯身上的贴纸、刻字等细节不公开。',
      templates: [
        { type: 'choice', stem: '物品的主色调是', options: ['', '', ''] },
        { type: 'choice', stem: '物品的大致容量/尺寸是', options: ['', '', ''] },
        { type: 'judge', stem: '物品上有贴纸或挂饰' },
        { type: 'judge', stem: '物品上有明显的使用痕迹' }
      ]
    },
    {
      key: 'rain', name: '雨伞雨具', icon: '☂️', allowVerify: true,
      searchHint: '本类按伞面颜色和柄型搜索（如"长柄""折叠"）。图案、划痕这类细节不公开。',
      templates: [
        { type: 'choice', stem: '伞面颜色是', options: ['', '', ''] },
        { type: 'choice', stem: '伞的款式是', options: ['长柄直杆伞', '三折伞', '五折迷你伞'] },
        { type: 'judge', stem: '伞面有图案或印花' },
        { type: 'judge', stem: '伞骨有损坏或修补痕迹' }
      ]
    },
    {
      key: 'book', name: '图书资料', icon: '📚', allowVerify: true,
      searchHint: '本类按书名或科目搜索（如"高等数学""英语"）。扉页上的姓名、笔记内容不公开。',
      templates: [
        { type: 'choice', stem: '这本书的科目/类别是', options: ['', '', ''] },
        { type: 'choice', stem: '书的封面主色是', options: ['', '', ''] },
        { type: 'judge', stem: '扉页或书脊上写有名字' },
        { type: 'judge', stem: '书内有较多笔记或划线' }
      ]
    },
    {
      key: 'bag', name: '包袋', icon: '🎒', allowVerify: true,
      searchHint: '本类按包的类型和颜色搜索（如"双肩包""黑色"）。包内物品、挂件这类细节不公开。',
      templates: [
        { type: 'choice', stem: '包的款式是', options: ['双肩包', '单肩包', '手提包', '斜挎包'] },
        { type: 'choice', stem: '包的主色是', options: ['', '', ''] },
        { type: 'judge', stem: '包上挂有挂件或玩偶' },
        { type: 'judge', stem: '包内有明显的夹层或标签' }
      ]
    },
    {
      key: 'key', name: '钥匙', icon: '🔑', allowVerify: true,
      searchHint: '本类按钥匙数量和钥匙扣特征搜索（如"三把""卡通钥匙扣"）。具体齿形不公开。',
      templates: [
        { type: 'choice', stem: '这一串大约有几把钥匙', options: ['1 把', '2-3 把', '4 把及以上'] },
        { type: 'choice', stem: '钥匙扣的样式是', options: ['', '', ''] },
        { type: 'judge', stem: '串上有门禁卡或电梯卡' },
        { type: 'judge', stem: '钥匙扣上有明显磨损' }
      ]
    },
    {
      key: 'other', name: '其他', icon: '📦', allowVerify: false,
      searchHint: '这一类不好指定可公开的特征，因此不设认领验证题：描述和照片会直接公开，请翻列表、或按地点和描述里的词来找，找到后直接联系发布者核对。',
      templates: []
    }
  ];

  LF.categoryOf = function (key) {
    for (var i = 0; i < LF.CATEGORIES.length; i++) {
      if (LF.CATEGORIES[i].key === key) return LF.CATEGORIES[i];
    }
    return null;
  };

  /** 判断某个分类要不要出认领验证题：三态。
   *  true  = 有公开特征定义，必须出题；
   *  false = 明确定义为不出题（"其他"）；
   *  null  = 分类压根不在字典里（脏数据），让校验跳过，不要再叠一条用户改不掉的报错。 */
  LF.allowVerifyFor = function (categoryKey) {
    var c = LF.categoryOf(categoryKey);
    if (!c) return null;
    return !!c.allowVerify;
  };

  /** 搜索引导语。字典里没写就返回空串，页面据此隐藏整块提示，不维护第二份名单。 */
  LF.searchHintFor = function (categoryKey) {
    var c = LF.categoryOf(categoryKey);
    return (c && c.searchHint) ? c.searchHint : '';
  };

  /* ============================================================
   * 三、校园地点
   * ------------------------------------------------------------
   * 地点是自由输入（"图书馆三楼自习区"这种写法很常见），
   * 这里给的是常用值，既做输入建议（datalist），也做首页的一键筛选。
   * ============================================================ */
  LF.LOCATIONS = [
    '图书馆', '第一食堂', '第二食堂', '教学楼', '实验楼',
    '宿舍楼', '体育馆', '操场', '校车站', '校门口', '其他'
  ];

  /* ============================================================
   * 四、状态文案
   * ------------------------------------------------------------
   * 同一套 status，寻物和招领的说法不一样：
   *   lost  + active = 寻找中      lost  + done = 已找到
   *   found + active = 待认领      found + done = 已归还
   * 文案只在这里定义一次，界面层统一调 LF.statusTextOf()。
   * ============================================================ */
  LF.STATUSES = { ACTIVE: 'active', DONE: 'done' };

  LF.STATUS_TEXT = {
    lost: { active: '寻找中', done: '已找到' },
    found: { active: '待认领', done: '已归还' }
  };

  LF.statusTextOf = function (type, status) {
    var row = LF.STATUS_TEXT[type];
    if (!row) return status === LF.STATUSES.DONE ? '已完成' : '进行中';
    return row[status] || row.active;
  };

  /* ============================================================
   * 五、认领验证规则
   * ------------------------------------------------------------
   * 全部阈值集中在这里，界面上写的"3~5 题""最多 3 次"都从这儿取，
   * 不写死数字，改了规则页面提示会跟着变。
   * ============================================================ */
  LF.VERIFY = {
    MIN_QUESTIONS: 3,
    MAX_QUESTIONS: 5,
    SUGGEST_QUESTIONS: 4,
    MIN_OPTIONS: 2,
    MAX_OPTIONS: 4,
    MAX_ATTEMPTS: 3,
    MIN_STEM: 2,
    MAX_STEM: 60,
    MIN_OPTION_LEN: 1,
    MAX_OPTION_LEN: 20,
    JUDGE_OPTIONS: ['正确', '错误']
  };

  /* ============================================================
   * 六、表单校验阈值 & 联系方式格式
   * ============================================================ */
  LF.LIMITS = {
    TITLE_MIN: 2, TITLE_MAX: 40,
    LOCATION_MIN: 1, LOCATION_MAX: 50,
    DESC_MAX: 200,
    NAME_MIN: 1, NAME_MAX: 20,
    CONTACT_MIN: 5, CONTACT_MAX: 50,
    APPEAL_DETAIL_MIN: 10, APPEAL_DETAIL_MAX: 300,
    HISTORY_MAX: 10,
    PHOTO_MAX_EDGE: 480,
    PHOTO_QUALITY: 0.72
  };

  LF.CONTACT_HINT = '支持手机号 / QQ / 微信号 / 邮箱，例如：13800138000、QQ12345678、微信 wx_abc';

  /** 联系方式格式校验：至少命中一种常见形态。
   *  刻意不做"精确到运营商号段"的严格校验——校园场景里留微信号、QQ 号很常见，
   *  校验太严会把真实可用的联系方式拦下来。 */
  LF.CONTACT_PATTERNS = [
    { key: 'phone', label: '手机号', re: /^1[3-9]\d{9}$/ },
    { key: 'qq', label: 'QQ', re: /^(qq)?[1-9]\d{4,11}$/i },
    { key: 'email', label: '邮箱', re: /^[\w.+-]+@[\w-]+\.[\w.-]+$/ },
    { key: 'wechat', label: '微信号', re: /^(wx|wechat|微信|vx|v信)?[a-zA-Z][\w-]{5,19}$/i }
  ];

  LF.matchContact = function (raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    // 允许 "微信：wx_abc" / "QQ 12345678" 这类带前缀的写法：先剥掉分隔符再逐条试
    var compact = s.replace(/[\s:：\-]/g, '');
    for (var i = 0; i < LF.CONTACT_PATTERNS.length; i++) {
      if (LF.CONTACT_PATTERNS[i].re.test(compact)) return LF.CONTACT_PATTERNS[i];
    }
    return null;
  };

  /* ============================================================
   * 七、易混词组表
   * ------------------------------------------------------------
   * 用途：出题时提醒发布者"这两个选项容易被真失主选错"。
   * 组内互斥（同一色系里分不清的深浅），组间放行（"深蓝/浅蓝"能分清，不该拦）。
   * 注意：这只是一个**非阻塞**的提醒。误报多了这条规则就会被当噪音忽略掉，
   * 所以判定结果只用来提示，不参与"能不能发布"。
   * ============================================================ */
  LF.CONFUSABLE_GROUPS = [
    ['深蓝', '深蓝色', '藏青', '藏青色', '藏蓝', '靛蓝', '宝蓝'],
    ['浅蓝', '淡蓝', '天蓝', '湖蓝', '浅蓝色'],
    ['深绿', '墨绿', '军绿', '橄榄绿'],
    ['浅绿', '草绿', '嫩绿', '薄荷绿'],
    ['深灰', '烟灰', '炭灰'],
    ['浅灰', '银灰', '灰白'],
    ['米色', '杏色', '奶油色', '米白'],
    ['咖啡色', '棕色', '褐色', '咖色']
  ];

  /** 找出一个词属于哪一组易混词。取**命中的最长那个词**：
   *  "浅蓝色"同时包含"蓝色"和"浅蓝色"，不比长度就会归错组，把深蓝和浅蓝判成同一色。 */
  LF.confusableGroupOf = function (word) {
    var w = String(word == null ? '' : word).trim();
    if (!w) return -1;
    var best = -1, bestLen = 0;
    for (var i = 0; i < LF.CONFUSABLE_GROUPS.length; i++) {
      for (var j = 0; j < LF.CONFUSABLE_GROUPS[i].length; j++) {
        var term = LF.CONFUSABLE_GROUPS[i][j];
        if (w.indexOf(term) !== -1 && term.length > bestLen) { best = i; bestLen = term.length; }
      }
    }
    return best;
  };

  /* ============================================================
   * 八、数据版本
   * ------------------------------------------------------------
   * 改数据结构时 +1，migrate() 里补一条迁移分支。
   * 老数据必须能就地升级——规则改了、历史数据却按老规则继续跑，
   * 是最难被发现的一类问题（用户看得见现象，却没有任何入口能修）。
   * ============================================================ */
  LF.DATA_VERSION = 1;

  LF.STORAGE_KEY = 'lf_db_v1';
  /** 旧版（第一次结对作业时那份脚手架）用的存储键，用于一次性迁移老数据 */
  LF.LEGACY_STORAGE_KEY = 'lost_found_list';

  if (typeof module === 'object' && module.exports) module.exports = LF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
