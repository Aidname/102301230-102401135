/*!
 * utils.js —— 纯函数工具层
 *
 * 这层不碰业务状态、不碰 DOM（图片压缩和剪贴板除外，它们本来就是浏览器能力），
 * 所以可以被单元测试直接引用。
 *
 * 有一条边界必须说清楚，它是踩过坑之后才划出来的：
 *   为了「比较」而做的归一化（normalizeText）和为了「保存」而做的清理（clean）
 *   是两件事，不能合成一个函数。
 *   —— 搜索时希望"ＡirPods"和"airpods"能互相命中，所以要比对归一化后的文本；
 *   —— 但保存时如果把用户输入的全角字符、特殊符号改写掉，存进去的就不是他写的东西了。
 *   早先把两者混在一个函数里，结果"存的时候顺手做了全角转半角"，用户回看自己的描述
 *   发现字符被改了。所以这里刻意拆成两个函数，各自只服务一个目的。
 */
(function (global) {
  'use strict';

  var LF = global.LF;
  if (!LF && typeof require === 'function') LF = global.LF = require('./config.js');
  if (!LF) throw new Error('utils.js 需要先加载 config.js');

  /* ============================================================
   * 一、文本安全与归一化
   * ============================================================ */

  var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** HTML 转义。所有用户输入在拼进 innerHTML 之前都必须过这一道。
   *  漏一处就是一个 XSS 入口——而且"列表页转了、悬浮预览忘了转"这种漏法最常见。 */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function (ch) { return HTML_ESCAPES[ch]; });
  }

  /** 搜索/比对用的归一化：全角转半角、去零宽字符、转小写、去首尾空白。
   *  只用于「比较」，绝不用于「保存」。 */
  function normalizeText(str) {
    var t = String(str === null || str === undefined ? '' : str);
    if (typeof t.normalize === 'function') t = t.normalize('NFKC');
    // 从微信/QQ 复制来的文字常夹着零宽字符：人眼看着一样，字符串比较却不相等
    t = t.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return t.toLowerCase().trim();
  }

  /** 保存用的清理：去掉首尾空白、把连续空白压成一个空格、剔除控制字符。
   *  刻意不做全角转半角——用户写什么就存什么。 */
  function clean(str) {
    var t = String(str === null || str === undefined ? '' : str);
    return t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 保留换行的清理，用于描述这种多行文本 */
  function cleanMultiline(str) {
    var t = String(str === null || str === undefined ? '' : str);
    return t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** 姓名打码：张** / 李*。非发布者只能看到打码后的称呼。 */
  function maskName(name) {
    var s = clean(name);
    if (!s) return '';
    if (s.length === 1) return s;
    // new Array(n).join('*') 正好产生 n-1 个星号：张** / 李*
    return s.charAt(0) + new Array(s.length).join('*');
  }

  /** 关键词高亮：先转义，再包 <mark>。
   *  顺序不能反——先包标签再转义会把 <mark> 自己转掉；只包不转义则等于开了 XSS 后门。
   *  注意连命中片段本身也要转义。 */
  function highlight(text, keyword) {
    var s = String(text === null || text === undefined ? '' : text);
    var terms = normalizeText(keyword).split(' ').filter(Boolean);
    if (!terms.length) return escapeHtml(s);

    var lower = normalizeText(s);
    // 标记出所有命中区间（按归一化后的下标定位，原文与归一化文本长度一致时才安全）
    var marks = [];
    if (lower.length === s.toLowerCase().length) {
      for (var i = 0; i < terms.length; i++) {
        var term = terms[i], from = 0, idx;
        while ((idx = lower.indexOf(term, from)) !== -1) {
          marks.push([idx, idx + term.length]);
          from = idx + term.length;
        }
      }
    }
    if (!marks.length) return escapeHtml(s);

    marks.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var merged = [marks[0]];
    for (var k = 1; k < marks.length; k++) {
      var last = merged[merged.length - 1];
      if (marks[k][0] <= last[1]) last[1] = Math.max(last[1], marks[k][1]);
      else merged.push(marks[k]);
    }

    var out = '', cursor = 0;
    for (var m = 0; m < merged.length; m++) {
      out += escapeHtml(s.slice(cursor, merged[m][0]));
      out += '<mark class="hl">' + escapeHtml(s.slice(merged[m][0], merged[m][1])) + '</mark>';
      cursor = merged[m][1];
    }
    return out + escapeHtml(s.slice(cursor));
  }

  /** 截断长文本（用于卡片摘要），不切断转义实体 */
  function truncate(str, max) {
    var s = String(str === null || str === undefined ? '' : str);
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  /* ============================================================
   * 二、时间
   * ------------------------------------------------------------
   * 所有涉及"当前时间"的函数都接受一个可注入的 now，测试里固定成常量，
   * 否则"3 分钟前"这类断言会随运行时刻改变，测试会间歇性地红。
   * ============================================================ */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function toDate(input) {
    if (input instanceof Date) return input;
    if (typeof input === 'number') return new Date(input);
    return new Date(input);
  }

  function nowMs(options) {
    if (options && typeof options.now === 'function') return options.now();
    if (options && typeof options.now === 'number') return options.now;
    return Date.now();
  }

  /** 2026-10-09 */
  function formatDate(input) {
    var d = toDate(input);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 2026-10-09 14:30 */
  function formatDateTime(input) {
    var d = toDate(input);
    if (isNaN(d.getTime())) return '';
    return formatDate(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** 今天的 YYYY-MM-DD */
  function today(options) { return formatDate(nowMs(options)); }

  /** 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 2026-09-28 */
  function timeAgo(input, options) {
    var ts = toDate(input).getTime();
    if (isNaN(ts)) return '';
    var diff = nowMs(options) - ts;
    if (diff < 0) return formatDate(ts) + '（未来）';
    var min = 60 * 1000, hour = 60 * min, day = 24 * hour;
    if (diff < min) return '刚刚';
    if (diff < hour) return Math.floor(diff / min) + ' 分钟前';
    if (diff < day) return Math.floor(diff / hour) + ' 小时前';
    if (diff < 30 * day) return Math.floor(diff / day) + ' 天前';
    return formatDate(ts);
  }

  /** 字符串日期是否晚于今天（发布表单不允许填未来时间） */
  function isFutureDate(dateStr, options) {
    var s = clean(dateStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return s > today(options);
  }

  /** 日期字符串是否合法且真实存在（挡掉 2026-02-30 这种） */
  function isValidDateStr(dateStr) {
    var s = clean(dateStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var parts = s.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.getFullYear() === Number(parts[0])
      && d.getMonth() === Number(parts[1]) - 1
      && d.getDate() === Number(parts[2]);
  }

  /* ============================================================
   * 三、杂项
   * ============================================================ */

  var uidSeq = 0;
  /** 生成局部唯一 id：前缀 + 时间戳 36 进制 + 自增序号。
   *  同一毫秒内连续生成也不会撞——纯时间戳做 id 在批量造数据时会重复。 */
  function uid(prefix) {
    uidSeq = (uidSeq + 1) % 100000;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + uidSeq.toString(36);
  }

  /** 生成展示用编号：LF + YYYYMMDD + 3 位序号 */
  function makeCode(seq, options) {
    var d = toDate(nowMs(options));
    var n = Number(seq) || 0;
    return 'LF' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + ('00' + (n % 1000)).slice(-3);
  }

  /** 认领凭证码：CL-2026-3882 */
  function makeVoucher(options) {
    var d = toDate(nowMs(options));
    var n = Math.floor(Math.random() * 9000) + 1000;
    return 'CL-' + d.getFullYear() + '-' + n;
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(self, args); }, wait);
    };
  }

  function safeJsonParse(str, fallback) {
    if (str === null || str === undefined || str === '') return fallback;
    try {
      var v = JSON.parse(str);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  function clone(v) { return safeJsonParse(JSON.stringify(v), null); }

  function uniq(arr) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = String(arr[i]);
      if (!seen[k]) { seen[k] = true; out.push(arr[i]); }
    }
    return out;
  }

  /* ============================================================
   * 四、浏览器能力（图片压缩、剪贴板）
   * ============================================================ */

  /** 把用户选的照片压到最长边 maxEdge 的 JPEG。
   *  不压缩直接把手机原图转成 base64 塞进 localStorage，几张就会顶到 5MB 配额。 */
  function compressImage(file, maxEdge, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) {
        reject(new Error('请选择图片文件'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('图片读取失败，请重试')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解析失败，请换一张')) };
        img.onload = function () {
          try {
            var w = img.width, h = img.height;
            var scale = Math.min(1, maxEdge / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * scale));
            var ch = Math.max(1, Math.round(h * scale));
            var canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (e) {
            reject(new Error('图片处理失败，请换一张'));
          }
        };
        img.src = reader.result;
      };
      // ★ 必须是 readAsDataURL。写成 readAsText 的话图片会被当文本读，
      //   img.onload 永远不触发，表现为"选完图界面毫无反应"——没有报错，最难查。
      reader.readAsDataURL(file);
    });
  }

  /** 一键复制。file:// 下不是安全上下文，navigator.clipboard 常常拿不到，
   *  所以必须带 execCommand 兜底，否则"点复制没反应"。
   *  返回 Promise<{ok, text}>：失败了也不能只弹一句错误就完事，
   *  调用方要能拿到原文弹出手动复制的输入框，让事情还办得成。 */
  function copyText(text) {
    var value = String(text === null || text === undefined ? '' : text);
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    }
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(value).then(
        function () { return { ok: true, text: value }; },
        function () { return { ok: fallback(), text: value }; }
      );
    }
    return Promise.resolve({ ok: fallback(), text: value });
  }

  LF.escapeHtml = escapeHtml;
  LF.normalizeText = normalizeText;
  LF.clean = clean;
  LF.cleanMultiline = cleanMultiline;
  LF.maskName = maskName;
  LF.highlight = highlight;
  LF.truncate = truncate;
  LF.pad2 = pad2;
  LF.formatDate = formatDate;
  LF.formatDateTime = formatDateTime;
  LF.today = today;
  LF.timeAgo = timeAgo;
  LF.isFutureDate = isFutureDate;
  LF.isValidDateStr = isValidDateStr;
  LF.uid = uid;
  LF.makeCode = makeCode;
  LF.makeVoucher = makeVoucher;
  LF.debounce = debounce;
  LF.safeJsonParse = safeJsonParse;
  LF.isArray = isArray;
  LF.clone = clone;
  LF.uniq = uniq;
  LF.compressImage = compressImage;
  LF.copyText = copyText;
  LF.nowMs = nowMs;

  if (typeof module === 'object' && module.exports) module.exports = LF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
