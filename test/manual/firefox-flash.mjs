// Firefox 侧栏闪烁验证 —— 隔离 fixture，不碰运行中的 DSH。
//
// 作用：在真 Firefox 里加载一个最小布局（会话滚动区 + composer + 滑入式侧栏），
// 让插件自己跑 minimap，然后在「开侧栏 → 稳 → 关 → 稳 → 再开」过程中按 16ms
// 采样，把序列 POST 回本地 server。判定重点不是「有没有像素在动」，而是：
//   1) display 是否反复翻转（老实现的症状：遮挡就隐藏）
//   2) right / width 是否出现方向反转（A→B→A 的振荡）
//   3) 稳定窗口内是否仍有位置漂移
//   4) ResizeObserver 回调数是否随 inset 变化爆炸（自反馈回路假设）
//
// 启动：node verify-firefox-flash.mjs
// 打开：http://127.0.0.1:3099/

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLIENT = fileURLToPath(new URL('../../lib/client.js', import.meta.url));
const CLIENT_V15 = process.env.DSHOME_V15
  || fileURLToPath(new URL('./client-v15-before-sidebar-reflow.js', import.meta.url));
const OUT = process.env.REPORT_OUT
  || join(tmpdir(), 'dshome-firefox-flash-report.json');
const PORT = Number(process.env.PORT || 3099);

const HTML = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>DSHOME Firefox 侧栏闪烁验证</title>
<style>
*{box-sizing:border-box}
body{margin:0;font:16px/1.7 sans-serif;background:#f7f9fc;color:#263447}
header{height:76px;padding:16px 20px;display:flex;gap:24px;align-items:center}
.session_scrollBody{position:fixed;top:76px;bottom:20px;left:20px;
  width:calc(100vw - 40px);overflow:auto;border:1px solid #dce3ec;
  --dsh-composer-height:100px;--dsh-chat-content-width:720px;
  --dsh-composer-side-clearance:0px;
  --dsw-alias-brand-primary:#4d6bfe;--dsw-alias-label-tertiary:#76849b}
.message{margin:18px 24px;padding:16px;background:#fff;border-radius:8px;overflow-wrap:anywhere}
.composer{height:100px;position:sticky;bottom:0;padding:20px;background:#edf2fa}
.panel{position:fixed;z-index:10;top:76px;right:0;bottom:20px;width:min(420px,42vw);
  background:#e0e7f3;padding:24px;border-left:1px solid #bac8df;
  transform:translateX(100%);transition:transform 250ms ease}
.panel.is-open{transform:translateX(0)}
</style></head>
<body>
<header><strong>DSHOME Firefox 验证</strong><span id="phase">init</span></header>
<section class="session_scrollBody" data-conversation-scroll>
  <div id="messages"></div>
  <div class="composer">输入框预留区</div>
</section>
<aside class="panel" id="panel" data-dockkit-host="dock"><strong>工具侧栏</strong>
  <p>导航应留在本栏左侧，正文与输入框相应收窄。</p></aside>
<script>
/* ── 采样器：必须在 client.js 之前装好 ─────────────────────────────── */
(function () {
  window.__fixtureImpl = 0;
  var log = { errors: [], warns: [], ro: 0, roBurst: 0 };
  window.addEventListener('error', function (e) {
    log.errors.push('error: ' + (e && e.message ? e.message : String(e)));
  });
  window.addEventListener('unhandledrejection', function (e) {
    log.errors.push('rejection: ' + String(e.reason));
  });
  var ce = console.error, cw = console.warn;
  console.error = function () {
    log.errors.push('console.error: ' + Array.prototype.join.call(arguments, ' '));
    return ce.apply(console, arguments);
  };
  console.warn = function () {
    log.warns.push(Array.prototype.join.call(arguments, ' '));
    return cw.apply(console, arguments);
  };
  var RO = window.ResizeObserver;
  if (RO) {
    window.ResizeObserver = class extends RO {
      constructor(cb) {
        super(function () {
          log.ro += 1;
          return cb.apply(this, arguments);
        });
      }
    };
  }
  window.__probe = log;
})();

for (var i = 1; i <= 24; i += 1) {
  var row = document.createElement('div');
  row.className = 'message';
  row.setAttribute('data-chat-turn', String(i));
  row.setAttribute('data-chat-flow-key', String(i));
  row.setAttribute('data-chat-flow-kind', i % 3 ? 'assistant-step' : 'user');
  row.textContent = '第 ' + i + ' 条消息：用来检查缩略导航与侧栏是否重叠的示例正文。'.repeat(5);
  document.getElementById('messages').appendChild(row);
}

window.__dshomePlugin = {
  theme: false, conversation: false, sidebar: false, notify: false,
  minimap: true, hideOfficialRail: false,
};
window.__ModuleLoader__ = {
  load: function (spec) {
    var plugin = spec.factory(function (id) {
      return id === 'react/jsx-runtime' ? { jsx: function () { return null; } } : {};
    });
    plugin.apply({ get: function () {} });
  },
};
</script>
<script src="/client.js"></script>
<script>
(function () {
  var log = window.__probe;
  var panel = document.getElementById('panel');
  var phaseEl = document.getElementById('phase');

  function snap(tag) {
    var shell = document.querySelector('.dshome-plugin-minimap');
    var scroller = document.querySelector('[data-conversation-scroll]');
    var rec = {
      t: Math.round(performance.now()), tag: tag,
      vis: document.visibilityState, ro: log.ro,
    };
    if (!shell) { rec.missing = true; return rec; }
    var r = shell.getBoundingClientRect();
    var cs = getComputedStyle(shell);
    rec.display = cs.display;
    rec.w = Math.round(r.width * 10) / 10;
    rec.h = Math.round(r.height * 10) / 10;
    rec.right = Math.round((window.innerWidth - r.right) * 10) / 10;
    rec.opacity = cs.opacity;
    if (scroller) {
      rec.inset = scroller.style.getPropertyValue('--dshome-minimap-inset') || '';
      rec.insetAttr = scroller.hasAttribute('data-dshome-minimap-inset');
      rec.padRight = getComputedStyle(scroller).paddingRight;
      rec.clientW = scroller.clientWidth;
      rec.scrollH = scroller.scrollHeight;
    }
    var c = shell.querySelector('canvas');
    rec.canvasW = c ? c.width : null;
    rec.visible = r.width > 0 && r.height > 0 && cs.display !== 'none';
    // 诊断：这一次 tick 插件到底「看见」了哪些侧栏面
    rec.diag = {
      panelOpen: panel.classList.contains('is-open'),
      panelAttr: panel.hasAttribute('data-sidebar-right-open'),
      bodyAttr: document.body.hasAttribute('data-sidebar-right-open'),
      surfaces: (function () {
        var n = document.querySelectorAll(
          '[data-sidebar-right-open], [data-dockkit-host=dock], [data-dockkit-float]');
        var out = [];
        for (var j = 0; j < n.length; j += 1) {
          var q = n[j].getBoundingClientRect();
          out.push({ tag: n[j].tagName, left: Math.round(q.left),
            right: Math.round(q.right), w: Math.round(q.width) });
        }
        return out;
      })(),
      scrollerRight: scroller ? Math.round(scroller.getBoundingClientRect().right) : null,
      shellDisplay: shell.style.display || '(inline default)',
    };
    return rec;
  }

  function sampleFor(ms, tag) {
    return new Promise(function (resolve) {
      var out = [];
      var start = performance.now();
      var last = 0;
      (function step() {
        var now = performance.now();
        if (now - last >= 15) { out.push(snap(tag)); last = now; }
        if (now - start < ms) setTimeout(step, 16);
        else resolve(out);
      })();
    });
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function setOpen(open) {
    panel.classList.toggle('is-open', open);
    // 真实宿主把 open 标记挂在一个局部容器上，不是 body——body 的 rect 是整个
    // 视口，挂上去会让「侧栏盒」变成全屏，overlay 计算必然失真。
    if (open) panel.setAttribute('data-sidebar-right-open', '');
    else panel.removeAttribute('data-sidebar-right-open');
  }

  function mark(name) {
    phaseEl.textContent = name;
    log.marks = log.marks || [];
    log.marks.push({ phase: name, t: Math.round(performance.now()) });
  }

  (async function run() {
    try {
      mark('settle');
      await sleep(2600);                       // minimap 初始化 + retry 窗口
      var phases = {};

      mark('baseline');
      phases.baseline = await sampleFor(500, 'baseline');

      mark('opening');
      setOpen(true);
      phases.opening = await sampleFor(1200, 'opening');

      mark('opened');
      phases.opened = await sampleFor(900, 'opened');

      mark('closing');
      setOpen(false);
      phases.closing = await sampleFor(1200, 'closing');

      mark('closed');
      phases.closed = await sampleFor(900, 'closed');

      mark('reopening');
      setOpen(true);
      phases.reopening = await sampleFor(1200, 'reopening');

      mark('reopened');
      phases.reopened = await sampleFor(800, 'reopened');

      mark('reporting');
      var report = {
        impl: window.__fixtureImpl,
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        inner: [window.innerWidth, window.innerHeight],
        phases: phases,
        errors: log.errors,
        warns: log.warns,
        roTotal: log.ro,
        marks: log.marks,
      };
      await fetch('/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      });
      phaseEl.textContent = '已回传 ' + (log.errors.length ? '(有错误)' : '(干净)');
      document.title = 'DONE';
    } catch (err) {
      mark('failed: ' + err);
    }
  })();
})();
</script>
</body></html>`;

function reversals(values, tol) {
  const seq = [];
  for (const v of values) {
    if (typeof v !== 'number') continue;
    if (seq.length === 0 || Math.abs(v - seq[seq.length - 1]) > tol) seq.push(v);
  }
  let rev = 0;
  let dir = 0;
  for (let i = 1; i < seq.length; i += 1) {
    const d = Math.sign(seq[i] - seq[i - 1]);
    if (d !== 0 && dir !== 0 && d !== dir) rev += 1;
    if (d !== 0) dir = d;
  }
  return { changes: seq.length, reversals: rev, head: seq.slice(0, 10) };
}

function uniq(values) {
  const out = [];
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function analyze(samples) {
  const valid = samples.filter((s) => !s.missing);
  const vis = valid.filter((s) => s.visible);
  const dts = [];
  for (let i = 1; i < samples.length; i += 1) dts.push(samples[i].t - samples[i - 1].t);
  dts.sort((a, b) => a - b);
  const tail = valid.slice(Math.floor(valid.length * 0.7));
  const tailRight = tail.map((s) => s.right);
  const tailMean = tailRight.reduce((a, b) => a + b, 0) / Math.max(1, tailRight.length);
  const tailSpread = Math.max(...tailRight.map((v) => Math.abs(v - tailMean)), 0);
  const displays = uniq(valid.map((s) => s.display));
  let displayFlips = 0;
  for (let i = 1; i < valid.length; i += 1) {
    if (valid[i].display !== valid[i - 1].display) displayFlips += 1;
  }
  return {
    samples: samples.length,
    missing: samples.length - valid.length,
    visibleFrac: valid.length ? +(vis.length / valid.length).toFixed(3) : null,
    displayValues: displays,
    displayFlips,
    shellDisplayStyle: uniq(valid.map((s) => s.diag && s.diag.shellDisplay)),
    panelOpen: uniq(valid.map((s) => s.diag && s.diag.panelOpen)),
    surfaces: uniq(valid.map((s) => s.diag && JSON.stringify(s.diag.surfaces))),
    scrollerRight: uniq(valid.map((s) => s.diag && s.diag.scrollerRight)),
    width: uniq(valid.map((s) => s.w)),
    right: reversals(valid.map((s) => s.right), 0.6),
    widthMoves: reversals(valid.map((s) => s.w), 0.6),
    inset: uniq(valid.map((s) => s.inset)),
    padRight: uniq(valid.map((s) => s.padRight)),
    roCallbacks: (valid[valid.length - 1] || {}).ro,
    medianDt: dts.length ? dts[Math.floor(dts.length / 2)] : null,
    maxDt: dts.length ? dts[dts.length - 1] : null,
    tailRightSpread: +(tailSpread || 0).toFixed(2),
    tailRightValues: uniq(tailRight).slice(0, 6),
  };
}

function summarize(r) {
  const out = {
    impl: r.impl,
    ua: r.ua,
    versionish: (r.ua.match(/Firefox\/[\d.]+/) || ['?'])[0],
    dpr: r.dpr,
    inner: r.inner,
    roTotal: r.roTotal,
    errors: r.errors,
    warns: r.warns,
    marks: r.marks,
    phases: {},
  };
  let prevRo = null;
  for (const [name, samples] of Object.entries(r.phases)) {
    const a = analyze(samples);
    if (prevRo === null) a.roFromStart = a.roCallbacks;
    else a.roFromStart = (a.roCallbacks || 0) - prevRo;
    prevRo = a.roCallbacks;
    out.phases[name] = a;
  }
  // 判定
  const verdict = [];
  const base = out.phases.baseline || {};
  const op = out.phases.opening || {};
  const opened = out.phases.opened || {};
  const closed = out.phases.closed || {};
  const baseRight = (base.tailRightValues || [])[0];
  const openRight = (opened.tailRightValues || [])[0];
  const closeRight = (closed.tailRightValues || [])[0];

  if (op.displayFlips > 0) verdict.push('FAIL opening: display 翻转 ' + op.displayFlips + ' 次');
  else if (op.displayValues && op.displayValues.length === 1 && op.displayValues[0] === 'block')
    verdict.push('PASS opening: display 恒 block（不靠隐藏躲侧栏）');
  if (op.right && op.right.reversals > 0) verdict.push('FAIL opening: right 方向反转 ' + op.right.reversals + ' 次（振荡）');
  else if (op.right) verdict.push('PASS opening: right 无反转到 ' + op.right.changes + ' 个位置');

  const laneOn = (op.inset || []).some((v) => v && v !== '');
  if (laneOn) verdict.push('PASS opening: 车道 inset 生效 ' + (op.inset || []).filter(Boolean).join(' | '));
  else verdict.push('WARN opening: inset 未设置——插件没把这块侧栏当成覆盖');

  if (typeof baseRight === 'number' && typeof openRight === 'number') {
    if (openRight > baseRight + 100) verdict.push('PASS: 侧栏打开后缩略图让开 ' + Math.round(openRight - baseRight) + 'px');
    else verdict.push('FAIL: 侧栏打开后缩略图只移动 ' + Math.round(openRight - baseRight) + 'px');
    if (typeof closeRight === 'number' && Math.abs(closeRight - baseRight) <= 1)
      verdict.push('PASS: 关闭后位置回到基线（' + closeRight + 'px）');
    else verdict.push('FAIL: 关闭后未回到基线（' + closeRight + ' vs ' + baseRight + '）');
  }

  if (opened.tailRightSpread > 1) verdict.push('FAIL opened: 稳定期右偏移漂移 ' + opened.tailRightSpread + 'px');
  else verdict.push('PASS opened: 稳定期右偏移 ' + opened.tailRightSpread + 'px');
  if (closed.tailRightSpread > 1) verdict.push('FAIL closed: 关闭后仍漂移 ' + closed.tailRightSpread + 'px');
  if (out.errors.length) verdict.push('WARN 页面有 ' + out.errors.length + ' 条错误: ' + out.errors.slice(0, 3).join(' ; '));
  else verdict.push('PASS: 页面 0 错误 0 警告');
  out.verdict = verdict;
  return out;
}

const server = createServer((req, res) => {
  const url = String(req.url || '/').split('?')[0];
  if (url === '/client.js') {
    res.setHeader('content-type', 'text/javascript; charset=utf-8');
    res.end(readFileSync(CLIENT));
    return;
  }
  if (url === '/client-v15.js') {
    res.setHeader('content-type', 'text/javascript; charset=utf-8');
    if (!existsSync(CLIENT_V15)) {
      res.statusCode = 404;
      res.end('// v15 baseline not found; set DSHOME_V15');
      return;
    }
    res.end(readFileSync(CLIENT_V15));
    return;
  }
  if (req.method === 'POST' && url === '/report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        writeFileSync(OUT, body);
        const summary = summarize(JSON.parse(body));
        writeFileSync(OUT.replace(/\.json$/, '-summary.json'), JSON.stringify(summary, null, 2));
        console.log('REPORT ' + OUT);
        console.log('http://127.0.0.1:' + PORT + '/');
        console.log(JSON.stringify(summary, null, 2));
      } catch (err) {
        console.error('bad report:', err);
      }
      res.end('ok');
      // 保持 server 存活：同一个 fixture 可以反复刷新重测，报告覆盖写。
    });
    return;
  }
  // impl=v15 用旧实现做对照，默认测当前实现
  const query = new URL(String(req.url || '/'), 'http://x').searchParams;
  const impl = query.get('impl') === 'v15' ? 'v15' : 'v16';
  const implSrc = impl === 'v15' ? '/client-v15.js' : '/client.js';
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(
    HTML.replace('src="/client.js"', 'src="' + implSrc + '"')
      .replace('window.__fixtureImpl = 0;', 'window.__fixtureImpl = "' + impl + '";'),
  );
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Firefox flash fixture: http://127.0.0.1:' + PORT + '/');
});
