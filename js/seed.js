/*!
 * seed.js —— 演示数据
 *
 * 首次打开时灌入的一批数据，目的是让助教"下载完双击打开就有东西可点"，
 * 而不是面对一片空白先自己录数据。
 *
 * 三条刻意的安排：
 *  ① 其中 3 条归属于**使用者本人**（ownerId 用本机标识），
 *     这样点进「我的发布」不是空的，可以立刻演示"标记已归还""处理申诉"这类
 *     需要发布者身份才用得上的功能；
 *  ② 至少留一条**可答题**的招领、一条**已答满 3 次**的招领、一条**不出题**的
 *     「其他」类招领，让认领验证的三种状态都能被走到；
 *  ③ 时间都是相对 now 生成的，不会出现"演示数据发布于 2020 年"这种穿帮。
 */
(function (global) {
  'use strict';

  var LF = global.LF;
  if (!LF && typeof require === 'function') {
    require('./config.js');
    require('./utils.js');
    LF = global.LF;
  }
  if (!LF) throw new Error('seed.js 需要先加载 config.js');

  var HOUR = 3600 * 1000;
  var DAY = 24 * HOUR;

  function q(id, type, stem, options, answer) {
    return { id: id, type: type, stem: stem, options: options, answer: answer };
  }

  /**
   * 生成一份全新的演示数据。
   * @param {number} now 当前时间戳（注入以便测试固定）
   * @param {string} ownerId 本机发布者标识
   */
  function buildSeedPosts(now, ownerId) {
    var me = ownerId || 'me_demo';
    var n = Number(now) || Date.now();

    function at(hoursAgo) { return n - hoursAgo * HOUR; }
    function dateStr(hoursAgo) { return LF.formatDate(new Date(at(hoursAgo))); }

    /** 造一条记录的公共骨架，减少重复 */
    function post(cfg) {
      return {
        id: cfg.id,
        code: cfg.code,
        type: cfg.type,
        title: cfg.title,
        category: cfg.category,
        location: cfg.location,
        happenedAt: cfg.happenedAt,
        description: cfg.description,
        contactName: cfg.contactName,
        contactWay: cfg.contactWay,
        photo: '',
        status: cfg.status || LF.STATUSES.ACTIVE,
        doneType: cfg.doneType || null,
        doneAt: cfg.doneAt || null,
        createdAt: cfg.createdAt,
        updatedAt: cfg.updatedAt || cfg.createdAt,
        views: cfg.views || 0,
        ownerId: cfg.ownerId || 'seed_other',
        questions: cfg.questions || [],
        attemptsLeft: typeof cfg.attemptsLeft === 'number' ? cfg.attemptsLeft : LF.VERIFY.MAX_ATTEMPTS,
        claims: cfg.claims || [],
        appeals: cfg.appeals || []
      };
    }

    var posts = [];

    /* ---- ① 本机发布：招领耳机，已答满 3 次并收到一条待处理申诉 ---- */
    posts.push(post({
      id: 'seed_mine_earphone', code: 'LF20261009001', type: 'found', category: 'digital',
      title: '白色 AirPods Pro（第二代）', location: '图书馆三楼自习区',
      happenedAt: dateStr(6 * 24), createdAt: at(5 * 24), views: 86,
      description: '在图书馆三楼靠窗那排自习位捡到的，耳机盒有点脏，我先擦了一下。放我这儿不安全，失主尽快联系我。',
      contactName: '林同学', contactWay: '微信 linfeng_2023', ownerId: me,
      questions: [
        q('q1', 'judge', '耳机盒的外壳有明显的划痕或磕碰', LF.VERIFY.JUDGE_OPTIONS, 1),
        q('q2', 'choice', '右耳耳机上的序列号末位是', ['7', '3', '9', '1'], 0),
        q('q3', 'choice', '耳机盒的充电口类型是', ['Lightning', 'Type-C', 'Micro-USB'], 0),
        q('q4', 'judge', '耳机盒背面刻有自定义文字或贴有贴纸', LF.VERIFY.JUDGE_OPTIONS, 1)
      ],
      attemptsLeft: 0,
      claims: [
        { at: at(4 * 24), passed: false, voucher: '' },
        { at: at(3 * 24 + 2), passed: false, voucher: '' },
        { at: at(2 * 24), passed: false, voucher: '' }
      ],
      appeals: [{
        id: 'appeal_seed_1',
        claimantName: '陈雨桐',
        contact: 'QQ 8845123',
        detail: '耳机盒左下角有一道两三毫米的划痕，是我摔的；序列号末位是 7；我用的是 iPhone，所以是 Lightning 口。盒子里原来还夹着一张图书馆的座位预约小票。',
        decision: 'pending', note: '', voucher: '',
        createdAt: at(1 * 24), decidedAt: null
      }]
    }));

    /* ---- ② 本机发布：寻物《数据结构》 ---- */
    posts.push(post({
      id: 'seed_mine_book', code: 'LF20261009002', type: 'lost', category: 'book',
      title: '《数据结构与算法分析》C 语言版', location: '教学楼 B 区 305',
      happenedAt: dateStr(3 * 24), createdAt: at(3 * 24), views: 34,
      description: '上周四下午上完数据结构课落在教室了，书里夹着我做的实验报告和几张草稿纸，扉页写了名字。如果有同学捡到，麻烦联系我，谢谢！',
      contactName: '林同学', contactWay: '13800138000', ownerId: me
    }));

    /* ---- ③ 本机发布：招领保温杯，已归还（用来演示"已完成"和"恢复为进行中"） ---- */
    posts.push(post({
      id: 'seed_mine_cup', code: 'LF20261009003', type: 'found', category: 'daily',
      title: '灰色保温杯（约 500ml）', location: '第一食堂二楼',
      happenedAt: dateStr(9 * 24), createdAt: at(9 * 24), views: 52,
      description: '吃完饭在餐桌上捡到的，杯身有轻微掉漆，杯底贴了一张写字的胶带。已交还给失主。',
      contactName: '林同学', contactWay: '微信 linfeng_2023', ownerId: me,
      status: LF.STATUSES.DONE, doneType: 'returned', doneAt: at(7 * 24),
      questions: [
        q('q1', 'judge', '杯底贴有写字的胶带', LF.VERIFY.JUDGE_OPTIONS, 0),
        q('q2', 'choice', '杯盖的颜色是', ['黑色', '白色', '灰色'], 0),
        q('q3', 'judge', '杯身上有明显的凹痕', LF.VERIFY.JUDGE_OPTIONS, 1)
      ],
      claims: [{ at: at(8 * 24), passed: true, voucher: 'CL-2026-6120' }]
    }));

    /* ---- ④ 他人发布：招领校园卡，可答题（演示认领验证主流程） ---- */
    posts.push(post({
      id: 'seed_found_card', code: 'LF20261009004', type: 'found', category: 'card',
      title: '校园卡一张（姓名已打码）', location: '教学楼 A 区一层大厅',
      happenedAt: dateStr(2 * 24), createdAt: at(2 * 24 + 3), views: 128,
      description: '在教学楼 A 区一楼大厅的自助打印机旁边发现的，怕被人冒领，先放我这里。答对下面的问题我就把联系方式给你。',
      contactName: '周同学', contactWay: 'QQ 5123678',
      questions: [
        q('q1', 'choice', '卡面姓名是几个字', ['2 个字', '3 个字', '4 个字'], 1),
        q('q2', 'choice', '学号最后一位是', ['4', '6', '8', '2'], 2),
        q('q3', 'judge', '卡面上贴有一张卡通卡贴', LF.VERIFY.JUDGE_OPTIONS, 0),
        q('q4', 'choice', '这张卡所属的学院是', ['计算机与大数据学院', '土木工程学院', '外国语学院'], 0)
      ]
    }));

    /* ---- ⑤ 他人发布：招领雨伞，已答满 3 次（演示"提交申诉"入口） ---- */
    posts.push(post({
      id: 'seed_found_umbrella', code: 'LF20261009005', type: 'found', category: 'rain',
      title: '藏蓝色三折雨伞', location: '第二食堂门口伞架',
      happenedAt: dateStr(4 * 24), createdAt: at(4 * 24), views: 61,
      description: '雨天过后一直挂在食堂门口伞架上没人拿，先收起来了。伞骨有一处修补痕迹，伞柄有轻微松动。',
      contactName: '黄同学', contactWay: '微信 huang_2024',
      questions: [
        q('q1', 'choice', '伞柄的材质是', ['木质', '塑料', '橡胶'], 0),
        q('q2', 'judge', '伞面上有卡通图案', LF.VERIFY.JUDGE_OPTIONS, 1),
        q('q3', 'choice', '伞骨有几根', ['6 根', '8 根', '10 根'], 1)
      ],
      attemptsLeft: 0,
      claims: [
        { at: at(2 * 24), passed: false, voucher: '' },
        { at: at(1 * 24 + 5), passed: false, voucher: '' },
        { at: at(20), passed: false, voucher: '' }
      ]
    }));

    /* ---- ⑥ 他人发布：招领《高等数学》，「其他」类 → 信任模式，不出题 ---- */
    posts.push(post({
      id: 'seed_found_math', code: 'LF20261009006', type: 'found', category: 'other',
      title: '《高等数学》上册（同济第七版）', location: '图书馆二楼阅览室',
      happenedAt: dateStr(1 * 24), createdAt: at(1 * 24 + 6), views: 27,
      description: '阅览室桌上落下的，扉页有名字和班级，书里还夹着几张手写的公式卡片。这类书没法出验证题，我就直接把书的样子写出来了，认识这本书的同学直接联系我核对。',
      contactName: '吴同学', contactWay: 'QQ 3378901'
    }));

    /* ---- ⑦ 他人发布：寻物充电宝 ---- */
    posts.push(post({
      id: 'seed_lost_powerbank', code: 'LF20261009007', type: 'lost', category: 'digital',
      title: '黑色充电宝 20000mAh', location: '实验楼 4 楼走廊',
      happenedAt: dateStr(5 * 24), createdAt: at(5 * 24 + 2), views: 43,
      description: '做完实验出来就找不到了，可能是落在实验台旁边的插座上。充电宝背面贴了一张白色标签，上面写着寝室号。',
      contactName: '郑同学', contactWay: '15912345678'
    }));

    /* ---- ⑧ 他人发布：寻物钥匙 ---- */
    posts.push(post({
      id: 'seed_lost_key', code: 'LF20261009008', type: 'lost', category: 'key',
      title: '一串钥匙（带小熊钥匙扣）', location: '体育馆羽毛球场 3 号场',
      happenedAt: dateStr(8 * 24), createdAt: at(8 * 24), views: 39,
      description: '三把钥匙加一个门禁卡，挂着一个棕色小熊钥匙扣。打完球发现不见了，可能在场地边的长椅上。',
      contactName: '许同学', contactWay: '微信 xu_yi_2024'
    }));

    /* ---- ⑨ 他人发布：招领双肩包，已归还 ---- */
    posts.push(post({
      id: 'seed_found_bag', code: 'LF20261009009', type: 'found', category: 'bag',
      title: '黑色双肩包', location: '操场看台',
      happenedAt: dateStr(12 * 24), createdAt: at(12 * 24), views: 95,
      description: '看台上放了一晚上没人拿，里面是几本课本和一个空的笔袋，没有证件。已经联系上失主并交还了。',
      contactName: '孙同学', contactWay: 'QQ 6602341',
      status: LF.STATUSES.DONE, doneType: 'returned', doneAt: at(11 * 24),
      questions: [
        q('q1', 'judge', '包内有笔记本电脑', LF.VERIFY.JUDGE_OPTIONS, 1),
        q('q2', 'choice', '包的拉链头颜色是', ['银色', '黑色', '古铜色'], 0),
        q('q3', 'judge', '包侧兜里有一个空的笔袋', LF.VERIFY.JUDGE_OPTIONS, 0)
      ],
      claims: [{ at: at(11 * 24 + 3), passed: true, voucher: 'CL-2026-4471' }]
    }));

    /* ---- ⑩ 他人发布：寻物校园卡，已找到 ---- */
    posts.push(post({
      id: 'seed_lost_card2', code: 'LF20261009010', type: 'lost', category: 'card',
      title: '校园卡（学号 2023****）', location: '第一食堂',
      happenedAt: dateStr(15 * 24), createdAt: at(15 * 24), views: 71,
      description: '在食堂刷完卡就忘了拿，后来有好心同学联系我还给我了，谢谢！这条留在这里给同样丢卡的同学做个参考：先去食堂服务台问一下。',
      contactName: '刘同学', contactWay: 'QQ 2298471',
      status: LF.STATUSES.DONE, doneType: 'found', doneAt: at(14 * 24)
    }));

    /* ---- ⑪ 他人发布：寻物水杯（时间较新，保证首页"最新"有内容） ---- */
    posts.push(post({
      id: 'seed_lost_bottle', code: 'LF20261009011', type: 'lost', category: 'daily',
      title: '透明运动水壶（带刻度）', location: '校车站',
      happenedAt: dateStr(0), createdAt: at(3), views: 12,
      description: '早上等校车的时候放在站牌旁边的台阶上，上车就忘了。壶身是透明的，侧面有刻度，壶盖是按压式的蓝色盖。',
      contactName: '何同学', contactWay: '微信 he_hy_2024'
    }));

    return posts;
  }

  LF.buildSeedPosts = buildSeedPosts;

  if (typeof module === 'object' && module.exports) module.exports = LF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
