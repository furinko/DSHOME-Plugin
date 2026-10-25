// 长会话缩略图验证 —— 隔离 fixture，不碰运行中的 DSH。
//
// installation.json 的 limits 里记着「long-conversation minimap was not
// exercised on a new real turn」。这条补的是代码路径，不是真实新回合：
//   A. 自然长会话（默认 600 回合，scrollHeight 约 8 万 CSS px）：
//      画布是否画出来、每块还分不分得清、点击顶部/中部/底部是否落对位置。
//   B. 封顶路径（?zoom=32 强制 zoom，模拟 2026-10-14 审查 P2-27 的超限）：
//      content 是否被 clamp 到 CONTENT_MAX_PX，canvas 设备像素是否低于
//      Chrome 的 32767 上限，且画布不是空白。
//
// 启动：node test/manual/long-session-minimap.mjs
// 打开：http://127.0.0.1:3097/?turns=600        自然长会话
//       http://127.0.0.1:3097/?turns=600&zoom=32 强制封顶
//
// 需要前台浏览器窗口（后台标签页的 rAF 会被节流，绘制时间不可信）。

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLIENT = fileURLToPath(new URL('../../lib/client.js', import.meta.url));
const OUT = process.env.REPORT_OUT || join(tmpdir(), 'dshome-long-session-report.json');
const PORT = Number(process.env.PORT || 3097);

function buildHtml(turns, zoom) {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>DSHOME 长会话缩略图验证</title>
<style>
*{box-sizing:border-box}
body{margin:0;font:15px/1.6 sans-serif;background:#f7f9fc;color:#263447}
header{position:fixed;top:0;left:0;right:0;height:60px;padding:10px 20px;
  display:flex;gap:20px;align-items:center;background:#fff;z-index:5;
  border-bottom:1px solid #e3e9f3}
.session_scrollBody{position:fixed;top:60px;bottom:16px;left:16px;
  width:calc(100vw - 32px);overflow:auto;border:1px solid #dce3ec;
  --dsh-composer-height:120px;--dsh-chat-content-width:760px;
  --dsh-composer-side-clearance:0px;
  --dsw-alias-brand-primary:#4d6bfe;--dsw-alias-label-tertiary:#76849b}
.message{margin:10px 20px;padding:14px 18px;background:#fff;border-radius:8px;
  min-height:120px;overflow-wrap:anywhere}
.reply{background:#f2f6fd}
.composer{height:120px;position:sticky;bottom:0;padding:18px;background:#edf2fa}
</style></head>
<body>
<header><strong>DSHOME 长会话验证</strong>
  <span id="phase">init</span><span id="meta"></span></header>
<section class="session_scrollBody" data-conversation-scroll>
  <div id="messages"></div>
  <div class="composer">输入框预留区</div>
</section>
<script>
window.__fixture = { turns: ${turns}, zoom: ${zoom} };
window.__probe = { errors: [], warns: [], t0: performance.now() };
(function () {
  window.addEventListener('error', function (e) {
    window.__probe.errors.push(String(e && e.message ? e.message : e));
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__probe.errors.push('rejection: ' + String(e.reason));
  });
  var ce = console.error, cw = console.warn;
  console.error = function () {
    window.__probe.errors.push('console.error: ' + Array.prototype.join.call(arguments, ' '));
    return ce.apply(console, arguments);
  };
  console.warn = function () {
    window.__probe.warns.push(Array.prototype.join.call(arguments, ' '));
    return cw.apply(console, arguments);
  };
})();

// 造回合：每条一个块，高度大致一致，长文本让排版有真实感。
(function () {
  var box = document.getElementById('messages');
  var fragment = document.createDocumentFragment();
  for (var i = 1; i <= window.__fixture.turns; i += 1) {
    var row = document.createElement('div');
    row.className = 'message' + (i % 3 ? ' reply' : '');
    row.setAttribute('data-chat-turn', String(i));
    row.setAttribute('data-chat-flow-key', String(i));
    row.setAttribute('data-chat-flow-kind', i % 3 ? 'assistant-step' : 'user');
    row.textContent = '第 ' + i + ' 回合：' +
      '这是一条用来把会话拉长到真实规模的示例正文，内容本身不重要，重要的是高度与块数。'.repeat(3);
    fragment.appendChild(row);
  }
  box.appendChild(fragment);
  document.getElementById('meta').textContent =
    window.__fixture.turns + ' 回合' + (window.__fixture.zoom ? ' · 强制 zoom=' + window.__fixture.zoom : '');
})();

if (window.__fixture.zoom) window.__dshomePluginMinimapZoom = window.__fixture.zoom;
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
  var probe = window.__probe;
  var phaseEl = document.getElementById('phase');

  function q(sel) { return document.querySelector(sel); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function mark(name) { phaseEl.textContent = name; }

  /** 画布上按行列采样，判断到底画没画东西。 */
  function paintStats(canvas) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    if (!ctx || !w || !h) return { ok: false, reason: 'no ctx/size', w: w, h: h };
    var rows = [0.02, 0.2, 0.4, 0.6, 0.8, 0.98];
    var painted = 0, scanned = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var y = Math.min(h - 1, Math.max(0, Math.floor(h * rows[i])));
      var data = ctx.getImageData(0, y, w, 1).data;
      for (var x = 0; x < w; x += 1) {
        scanned += 1;
        if (data[x * 4 + 3] > 8) painted += 1;
      }
    }
    return { ok: true, w: w, h: h, painted: painted, scanned: scanned,
      ratio: +(painted / scanned).toFixed(3) };
  }

  function snapshot(tag) {
    var shell = q('.dshome-plugin-minimap');
    var canvas = shell && shell.querySelector('canvas');
    var scroller = q('[data-conversation-scroll]');
    var rec = { tag: tag, t: Math.round(performance.now()) };
    if (!shell) { rec.missing = true; return rec; }
    var r = shell.getBoundingClientRect();
    var cs = getComputedStyle(shell);
    rec.display = cs.display;
    rec.visible = r.width > 0 && r.height > 0 && cs.display !== 'none';
    rec.shell = { w: Math.round(r.width), h: Math.round(r.height) };
    rec.dpr = window.devicePixelRatio;
    if (canvas) {
      rec.canvas = { devW: canvas.width, devH: canvas.height,
        cssH: Math.round(canvas.height / window.devicePixelRatio) };
      rec.paint = paintStats(canvas);
      if (rec.paint.painted > 0 && !probe.firstPaintAt) probe.firstPaintAt = rec.t;
    }
    if (scroller) {
      rec.doc = { scrollH: Math.round(scroller.scrollHeight),
        clientH: Math.round(scroller.clientHeight),
        maxScroll: Math.round(scroller.scrollHeight - scroller.clientHeight) };
    }
    return rec;
  }

  /** 点画布上 ratio 处，返回 scrollTop 与推算的落点。 */
  function clickAt(ratio) {
    var shell = q('.dshome-plugin-minimap');
    var scroller = q('[data-conversation-scroll]');
    var rect = shell.getBoundingClientRect();
    var y = rect.top + rect.height * ratio;
    var x = rect.left + rect.width / 2;
    var base = { bubbles: true, cancelable: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    shell.dispatchEvent(new PointerEvent('pointerdown', base));
    shell.dispatchEvent(new PointerEvent('pointerup',
      Object.assign({}, base, { buttons: 0 })));
    return { at: Math.round(y), scrollTop: Math.round(scroller.scrollTop),
      maxScroll: Math.round(scroller.scrollHeight - scroller.clientHeight) };
  }

  (async function run() {
    var out = { fixture: window.__fixture, ua: navigator.userAgent,
      inner: [window.innerWidth, window.innerHeight], errors: probe.errors, warns: probe.warns };

    mark('settle');
    await sleep(3400);                       // 600 块的首轮测量 + 重测窗口

    out.snapshots = [snapshot('after-settle')];
    mark('settled');

    // 再等一拍，确认不是瞬态
    await sleep(900);
    out.snapshots.push(snapshot('stable-1'));

    // 点击判定：先回到顶部，再打三个位置
    var scroller = q('[data-conversation-scroll]');
    scroller.scrollTop = 0;
    await sleep(150);
    mark('click-5');
    out.click5 = clickAt(0.05);
    await sleep(250);
    mark('click-95');
    out.click95 = clickAt(0.95);
    await sleep(250);
    mark('click-50');
    out.click50 = clickAt(0.5);
    await sleep(250);
    out.snapshots.push(snapshot('after-clicks'));

    // Navigation-thumb light. The thumb lives inside an overflow-hidden + clip
    // view, so the only light that survives is one drawn *inside* it.
    // it. Computed style is the check: an inset shadow proves the rule matched;
    // an outer one proves it will be clipped away (which is what shipped first).
    mark('thumb');
    var shellEl = q('.dshome-plugin-minimap');
    var thumbEl = shellEl && shellEl.querySelector('.dshome-plugin-minimap-thumb');
    if (thumbEl) {
      var idle = getComputedStyle(thumbEl);
      out.thumbIdle = { boxShadow: idle.boxShadow, opacity: idle.opacity };
      shellEl.setAttribute('data-active', '1');
      await sleep(600);
      var live = getComputedStyle(thumbEl);
      out.thumbActive = {
        boxShadow: live.boxShadow,
        opacity: live.opacity,
        background: live.backgroundColor,
      };
      shellEl.removeAttribute('data-active');
      await sleep(600);
      out.thumbAfter = {
        boxShadow: getComputedStyle(thumbEl).boxShadow,
        opacity: getComputedStyle(thumbEl).opacity,
      };
    } else {
      out.thumbActive = { found: false };
    }

    out.firstPaintAt = probe.firstPaintAt || null;
    out.loadToFirstPaintMs = probe.firstPaintAt
      ? Math.round(probe.firstPaintAt - probe.t0) : null;

    mark('reporting');
    await fetch('/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(out),
    });
    document.title = 'DONE';
  })().catch(function (err) { mark('failed: ' + err); });
})();
</script>
</body></html>`;
}

function summarize(r) {
  const snap = (r.snapshots || []).find((s) => s && s.canvas && s.paint && s.paint.ok) || {};
  const paint = snap.paint || {};
  const canvas = snap.canvas || {};
  const doc = snap.doc || {};
  const dpr = snap.dpr || 1;
  const maxScroll = doc.maxScroll || 0;
  const verdict = [];
  const num = (v) => (typeof v === 'number' ? v : null);

  if (snap.visible === true) verdict.push('PASS 缩略图可见 ' + JSON.stringify(snap.shell));
  else verdict.push('FAIL 缩略图不可见 ' + JSON.stringify(snap.shell));

  if (paint.painted > 0) verdict.push('PASS 画布有内容（采样 ' + paint.painted + '/' + paint.scanned + ' 像素，' + paint.ratio + '）');
  else verdict.push('FAIL 画布空白——采样到的像素全透明');

  const devH = num(canvas.devH);
  if (devH !== null && devH <= 32767) verdict.push('PASS canvas 设备像素高 ' + devH + ' ≤ 32767');
  else if (devH !== null) verdict.push('FAIL canvas 设备像素高 ' + devH + ' 超 Chrome 上限 32767');

  const cssH = num(canvas.cssH);
  const forced = r.fixture && r.fixture.zoom;
  if (forced) {
    if (cssH !== null && Math.abs(cssH - 16383) <= 4) verdict.push('PASS 封顶生效：canvas CSS 高 ' + cssH + ' ≈ CONTENT_MAX_PX 16383');
    else verdict.push('FAIL 封顶未生效：canvas CSS 高 ' + cssH + '（期望 ≈16383）');
  }

  if (maxScroll > 0) {
    if (num(r.click5.scrollTop) !== null && r.click5.scrollTop <= 4)
      verdict.push('PASS 点顶部落在 0（' + r.click5.scrollTop + '）');
    else verdict.push('FAIL 点顶部落在 ' + r.click5.scrollTop);
    if (num(r.click95.scrollTop) !== null && r.click95.scrollTop >= maxScroll - 8)
      verdict.push('PASS 点底部落在末端（' + r.click95.scrollTop + ' / ' + maxScroll + '）');
    else verdict.push('FAIL 点底部落在 ' + r.click95.scrollTop + ' / ' + maxScroll);
    if (num(r.click50.scrollTop) !== null && r.click50.scrollTop > 0 && r.click50.scrollTop < maxScroll)
      verdict.push('PASS 点中部落在中间（' + r.click50.scrollTop + '，进度 ' +
        (r.click50.scrollTop / maxScroll).toFixed(2) + '）');
    else verdict.push('FAIL 点中部落在 ' + r.click50.scrollTop);
  }

  if (!(r.errors || []).length) verdict.push('PASS 页面 0 错误');
  else verdict.push('WARN 页面错误: ' + (r.errors || []).slice(0, 3).join(' ; '));

  return {
    fixture: r.fixture,
    ua: (r.ua.match(/Firefox\/[\d.]+/) || [r.ua])[0],
    inner: r.inner,
    dpr,
    doc: doc,
    canvas: { devW: canvas.devW, devH: canvas.devH, cssH: canvas.cssH },
    paint,
    perBlockPx: (canvas.cssH && r.fixture && r.fixture.turns)
      ? +(canvas.cssH / r.fixture.turns).toFixed(2) : null,
    clicks: { top5: r.click5, mid50: r.click50, bottom95: r.click95 },
    loadToFirstPaintMs: r.loadToFirstPaintMs,
    errors: r.errors,
    warns: r.warns,
    verdict,
  };
}

const server = createServer((req, res) => {
  const u = new URL(String(req.url || '/'), 'http://x');
  if (u.pathname === '/client.js') {
    res.setHeader('content-type', 'text/javascript; charset=utf-8');
    res.end(readFileSync(CLIENT));
    return;
  }
  if (req.method === 'POST' && u.pathname === '/report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        writeFileSync(OUT, body);
        const summary = summarize(JSON.parse(body));
        writeFileSync(OUT.replace(/\.json$/, '-summary.json'), JSON.stringify(summary, null, 2));
        console.log('REPORT ' + OUT);
        console.log(JSON.stringify(summary, null, 2));
      } catch (err) {
        console.error('bad report:', err);
      }
      res.end('ok');
    });
    return;
  }
  const turns = Math.max(1, Math.min(3000, Number(u.searchParams.get('turns') || 600)));
  const zoom = Math.max(0, Math.min(32, Number(u.searchParams.get('zoom') || 0)));
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(buildHtml(turns, zoom));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Long-session minimap fixture:');
  console.log('  natural : http://127.0.0.1:' + PORT + '/?turns=600');
  console.log('  capped  : http://127.0.0.1:' + PORT + '/?turns=600&zoom=32');
});
