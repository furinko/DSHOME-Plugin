// 思考块 12 行窗口验证 —— 隔离 fixture，不碰运行中的 DSH。
//
// 2026-10-25 上游把 disclosure 的 DOM 套了一层：`data-disclosure-row` 还在，
// 但外面新包了 `data-disclosure-header`，正文从「row 的下一个兄弟」变成
// 「header 的下一个兄弟」。插件的钳制选择器因此落空，展开后正文不再截断。
//
// 这个 fixture 用与上游一致的嵌套，验证三件事：
//   A. 展开后正文被截到 12 行（12 × 20px = 240px）
//   B. 正文自己能滚（clientHeight 封顶，scrollHeight 更大）
//   C. row 后面那个 accessory 没有被误伤（CSS 只看 header 兄弟）
//
// 启动：node test/manual/think-window.mjs
// 打开：http://127.0.0.1:3096/

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLIENT = fileURLToPath(new URL('../../lib/client.js', import.meta.url));
const OLD_CLIENT = process.env.OLD_CLIENT
  || '/tmp/dshome-client-before-think-fix.js';
const OUT = join(tmpdir(), 'dshome-think-window-report.json');
const PORT = Number(process.env.PORT || 3096);

const HTML = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>DSHOME 思考块窗口验证</title>
<style>
  body{margin:0;padding:20px;font:15px/1.6 sans-serif;background:#fbfcff;color:#223}
  .convo{max-width:820px}
  #body{white-space:pre-wrap;line-height:20px}
</style></head>
<body>
<div class="convo">
  <!-- 2026-10-25 上游结构：row 外面多一层 data-disclosure-header，
       正文是 header 的兄弟；row 后面还跟着一个 accessory。 -->
  <div id="think" data-variant="think" data-state="ok" data-expanded="">
    <div data-disclosure-header="">
      <div data-disclosure-row="">思考过程</div>
      <div id="accessory" style="height:300px;background:#eef2fb">附件占位（300px）</div>
    </div>
    <div id="body"></div>
  </div>
</div>
<script>
  var para = '这是用来把思考正文撑到远超 12 行的示例文字，长度本身不重要，' +
    '重要的是它比 240px 高得多。';
  document.getElementById('body').textContent = para.repeat(60);
</script>
<script>
window.__dshomePlugin = {
  theme: false, conversation: true, sidebar: false, notify: false,
  minimap: false, hideOfficialRail: false,
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

  function measure() {
    var root = document.getElementById('think');
    var body = document.getElementById('body');
    var acc = document.getElementById('accessory');
    var rs = getComputedStyle(root);
    var bs = getComputedStyle(body);
    var as = getComputedStyle(acc);
    return {
      ua: navigator.userAgent,
      styleTag: !!document.querySelector('style[data-plugin="dshome-plugin-conversation"]'),
      root: { height: Math.round(root.getBoundingClientRect().height), padding: rs.padding },
      body: {
        maxHeight: bs.maxHeight,
        overflowY: bs.overflowY,
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
      },
      accessory: {
        maxHeight: as.maxHeight,
        clientHeight: acc.clientHeight,
        height: Math.round(acc.getBoundingClientRect().height),
      },
      errors: errors,
    };
  }

  setTimeout(function () {
    var r = measure();
    fetch('/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(r),
    });
    document.title = 'DONE';
  }, 900);
})();
</script>
</body></html>`;

function summarize(r) {
  const EXPECTED = 12 * 20;
  const body = r.body || {};
  const acc = r.accessory || {};
  const verdict = [];

  if (r.styleTag) verdict.push('PASS 插件样式已注入');
  else verdict.push('FAIL 插件样式没注入——fixture 里插件没跑起来');

  const mh = parseFloat(body.maxHeight);
  if (Math.abs(mh - EXPECTED) <= 1) verdict.push('PASS 正文截到 ' + EXPECTED + 'px（' + body.maxHeight + '）');
  else verdict.push('FAIL 正文 max-height = ' + body.maxHeight + '，期望 ' + EXPECTED + 'px');

  if (body.clientHeight <= EXPECTED + 1 && body.scrollHeight > body.clientHeight)
    verdict.push('PASS 正文内部可滚（可见 ' + body.clientHeight + ' / 全文 ' + body.scrollHeight + '）');
  else verdict.push('FAIL 正文没被截断（可见 ' + body.clientHeight + ' / 全文 ' + body.scrollHeight + '）');

  if (!(parseFloat(acc.maxHeight) > 0))
    verdict.push('PASS 附件未被误伤（max-height=' + acc.maxHeight + '）');
  else verdict.push('FAIL 附件被压到 ' + acc.maxHeight + '，说明旧选择器漏了进来');

  if (acc.clientHeight === 300) verdict.push('PASS 附件保持 300px');
  else verdict.push('WARN 附件 clientHeight=' + acc.clientHeight + '（期望 300）');

  if (!(r.errors || []).length) verdict.push('PASS 页面 0 错误');
  else verdict.push('WARN 页面错误: ' + r.errors.join(' ; '));

  return {
    ua: (r.ua.match(/Firefox\/[\d.]+/) || [r.ua])[0],
    expectedPx: EXPECTED,
    root: r.root,
    body: body,
    accessory: acc,
    errors: r.errors,
    verdict: verdict,
  };
}

const server = createServer((req, res) => {
  const parsed = new URL(String(req.url || '/'), 'http://x');
  const url = parsed.pathname;
  if (url === '/client.js') {
    res.setHeader('content-type', 'text/javascript; charset=utf-8');
    res.end(readFileSync(CLIENT));
    return;
  }
  if (url === '/client-old.js') {
    res.setHeader('content-type', 'text/javascript; charset=utf-8');
    try {
      res.end(readFileSync(OLD_CLIENT));
    } catch (err) {
      res.statusCode = 404;
      res.end('// old bundle missing; set OLD_CLIENT');
    }
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
  // ?old=1 loads the pre-fix bundle, so the same page proves both directions:
  // the fix clamps, and the bundle before it did not.
  const src = parsed.searchParams.get('old') ? '/client-old.js' : '/client.js';
  res.end(HTML.replace('src="/client.js"', 'src="' + src + '"'));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Think-window fixture: http://127.0.0.1:' + PORT + '/');
});
