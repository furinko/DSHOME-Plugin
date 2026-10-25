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
#mark{font-size:40px;color:#6B84FF}</style></head>
<body>
<span class="dshome-glow-mark" id="mark">◈</span>
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
    var mark = document.getElementById('mark');
    var be = getComputedStyle(mark, '::before');
    var sheet = document.querySelector('style[data-plugin="dshome-plugin-glow"]');
    return {
      sheetPresent: !!sheet,
      sheetLength: sheet ? sheet.textContent.length : 0,
      cssRules: (function () {
        try { return sheet.sheet ? sheet.sheet.cssRules.length : null; }
        catch (e) { return 'blocked'; }
      })(),
      content: be.content,
      background: be.backgroundImage,
      animationName: be.animationName,
      animationDuration: be.animationDuration,
      opacity: be.opacity,
      zIndex: be.zIndex,
      markPosition: getComputedStyle(mark).position,
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

  if (a.sheetPresent) verdict.push('PASS 光效样式表已注入（' + a.sheetLength + ' 字符）');
  else verdict.push('FAIL 光效样式表没注入');

  if (a.cssRules === 'blocked' || (typeof a.cssRules === 'number' && a.cssRules > 0))
    verdict.push('PASS 浏览器解析出 ' + a.cssRules + ' 条规则（没有整体解析失败）');
  else verdict.push('FAIL 样式表解析出 ' + a.cssRules + ' 条规则');

  if (a.content && a.content !== 'none' && a.content !== 'normal')
    verdict.push('PASS ::before 存在');
  else verdict.push('FAIL ::before 不存在');
  if (/radial-gradient/.test(a.background || ''))
    verdict.push('PASS 光是 radial-gradient');
  else verdict.push('FAIL 背景不是 radial-gradient：' + a.background);

  const animated = a.animationName && a.animationName !== 'none';
  const changed = a.opacity !== b.opacity;
  if (animated && changed)
    verdict.push('PASS 呼吸在跑（opacity ' + a.opacity + ' → ' + b.opacity + '）');
  else if (animated)
    verdict.push('WARN 动画已挂上但两个采样点 opacity 相同（' + a.opacity + '），可能刚好在波峰');
  else verdict.push('FAIL 动画没挂上（animation-name=' + a.animationName + '）');

  if (a.zIndex === '-1') verdict.push('PASS 光在内容之后（z-index:-1）');
  else verdict.push('WARN z-index=' + a.zIndex);

  if (!(r.errors || []).length) verdict.push('PASS 页面 0 错误');
  else verdict.push('WARN 页面错误: ' + r.errors.join(' ; '));

  return {
    ua: (r.ua.match(/Firefox\/[\d.]+/) || [r.ua])[0],
    reducedMotion: r.reducedMotion,
    first: a,
    second: { opacity: b.opacity, animationName: b.animationName },
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
