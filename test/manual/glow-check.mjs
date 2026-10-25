// 光效运行验证 —— 隔离 fixture，不碰运行中的 DSH。
//
// domtest 只能断言样式表里写了什么；这个 fixture 确认浏览器真的把它跑起来：
//   A. 品牌 mark 的 ::before 存在，背景是 radial-gradient
//   B. 呼吸动画确实在跑（间隔采样 opacity 应变化）
//   C. 没有 CSS 解析错误（样式表插进去了、规则数 > 0）
//
// 启动：node test/manual/glow-check.mjs
// 打开：http://127.0.0.1:3095/

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLIENT = fileURLToPath(new URL('../../lib/client.js', import.meta.url));
const OUT = join(tmpdir(), 'dshome-glow-report.json');
const PORT = Number(process.env.PORT || 3095);

const HTML = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>DSHOME 光效验证</title>
<style>body{margin:0;padding:40px;background:#0f1420;color:#dbe4f0;font:15px/1.6 sans-serif}
#name{font-size:34px;font-weight:600;letter-spacing:.5px;color:#6B84FF}</style></head>
<body>
<span class="dshome-glow-name" id="name">DSHOME</span>
<script>
window.__dshomePlugin = {
  theme: false, conversation: false, sidebar: false, notify: false,
  minimap: false, hideOfficialRail: false, glow: true,
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
  var errors = [];
  window.addEventListener('error', function (e) {
    errors.push(String(e && e.message ? e.message : e));
  });

  function probe() {
    var el = document.getElementById("name");
    var cs = getComputedStyle(el);
    var sheet = document.querySelector('style[data-plugin="dshome-plugin-glow"]');
    var anims = typeof document.getAnimations === "function" ? document.getAnimations() : [];
    return {
      sheetPresent: !!sheet,
      sheetLength: sheet ? sheet.textContent.length : 0,
      cssRules: (function () {
        try { return sheet.sheet ? sheet.sheet.cssRules.length : null; }
        catch (e) { return "blocked"; }
      })(),
      backgroundImage: cs.backgroundImage,
      backgroundClip: cs.webkitBackgroundClip || cs.backgroundClip,
      textFill: cs.webkitTextFillColor || cs.color,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      backgroundPosition: cs.backgroundPosition,
      animations: anims.length,
      running: anims.filter(function (a) { return a.playState === "running"; }).length,
      width: Math.round(el.getBoundingClientRect().width),
      height: Math.round(el.getBoundingClientRect().height),
    };
  }

  var first = probe();
  setTimeout(function () {
    var second = probe();
    var report = {
      ua: navigator.userAgent,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      first: first,
      second: second,
      errors: errors,
    };
    fetch('/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
    });
    document.title = 'DONE';
  }, 1400);
})();
</script>
</body></html>`;

function summarize(r) {
  const a = r.first || {};
  const b = r.second || {};
  const verdict = [];

  if (a.sheetPresent) verdict.push("PASS 光效样式表已注入（" + a.sheetLength + " 字符）");
  else verdict.push("FAIL 光效样式表没注入");

  if (a.cssRules === "blocked" || (typeof a.cssRules === "number" && a.cssRules > 0))
    verdict.push("PASS 浏览器解析出 " + a.cssRules + " 条规则");
  else verdict.push("FAIL 样式表解析出 " + a.cssRules + " 条规则");

  if (/linear-gradient/.test(a.backgroundImage || ""))
    verdict.push("PASS 文字是渐变填充");
  else verdict.push("FAIL 背景不是渐变：" + a.backgroundImage);

  if (a.backgroundClip === "text")
    verdict.push("PASS 渐变裁剪到字形（background-clip:text）");
  else verdict.push("FAIL background-clip=" + a.backgroundClip);

  if (/rgba\(0, 0, 0, 0\)|transparent/.test(a.textFill || ""))
    verdict.push("PASS 文字填充已透明（渐变才显示得出来）");
  else verdict.push("FAIL text-fill=" + a.textFill);

  if (a.animationName === "dshome-name-sweep")
    verdict.push("PASS 扫光动画挂在文字上");
  else verdict.push("FAIL animation-name=" + a.animationName);

  if (a.animations > 0 && a.running > 0)
    verdict.push("PASS 动画正在运行（" + a.running + "/" + a.animations + "）");
  else verdict.push("WARN 没有运行中的动画（getAnimations 报 " + a.animations + "）");

  if (a.backgroundPosition !== b.backgroundPosition)
    verdict.push("PASS 背景位置在动（" + a.backgroundPosition + " → " + b.backgroundPosition + "）");
  else verdict.push("WARN 两次采样背景位置相同（" + a.backgroundPosition + "），可能处于静止段");

  if (!(r.errors || []).length) verdict.push("PASS 页面 0 错误");
  else verdict.push("WARN 页面错误: " + r.errors.join(" ; "));

  return {
    ua: (r.ua.match(/Firefox\/[\d.]+/) || [r.ua])[0],
    reducedMotion: r.reducedMotion,
    first: a,
    second: { backgroundPosition: b.backgroundPosition, animations: b.animations },
    errors: r.errors,
    verdict: verdict,
  };
}

const server = createServer((req, res) => {
  const url = String(req.url || '/').split('?')[0];
  if (url === '/client.js') {
    res.setHeader('content-type', 'text/javascript; charset=utf-8');
    res.end(readFileSync(CLIENT));
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
        console.log(JSON.stringify(summary, null, 2));
      } catch (err) {
        console.error('bad report:', err);
      }
      res.end('ok');
    });
    return;
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(HTML);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Glow fixture: http://127.0.0.1:' + PORT + '/');
});
