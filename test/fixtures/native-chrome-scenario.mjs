import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
export async function runNativeChromeScenario({ page, baseline, metrics }) {
  const variant = baseline ? 'baseline' : 'current', failures = [], probes = [];
  const check = (value, label) => { if (!value) failures.push(label); };
  const styles = async selector => page.locator(selector).first().evaluate(element => {
    const pixel = css => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const c = canvas.getContext('2d'); c.fillStyle = css; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v); };
    const over = (a, b) => [...a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])), 1];
    const background = node => { if (!node) return [255, 255, 255, 1]; const color = pixel(getComputedStyle(node).backgroundColor); return color[3] === 1 ? color : over(color, background(node.parentElement)); };
    const s = getComputedStyle(element), bg = background(element), fg = over(pixel(s.color), bg);
    const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0);
    const a = luminance(fg), b = luminance(bg), rect = element.getBoundingClientRect();
    return { text: element.textContent.slice(0, 80), color: s.color, background: s.backgroundColor, effectiveBackground: bg, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), radius: s.borderTopLeftRadius, font: s.fontFamily, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } };
  });
  const modes = page.getByRole('group', { name: '界面模式', exact: true }); await modes.waitFor();
  const header = await styles('.dshome-wb-switch button'); check(parseFloat(header.radius) >= 6, 'header mode controls are unstyled'); probes.push({ phase: 'nonblank-header', header });
  await modes.getByRole('button', { name: '原版', exact: true }).focus(); await page.keyboard.press('Tab');
  const keyboard = await page.evaluate(() => { const b = document.activeElement, s = getComputedStyle(b); return { label: b.textContent, outline: s.outlineStyle, width: parseFloat(s.outlineWidth) }; }); check(keyboard.label === '工作台' && keyboard.outline === 'solid' && keyboard.width >= 2, 'mode control keyboard focus is not explicit');
  await page.keyboard.press('Enter'); await page.locator('.dshome-v2:visible').waitFor(); await modes.getByRole('button', { name: '原版', exact: true }).click(); await page.waitForFunction(() => !window.testNative.ctx.sidebarRight.isExpanded());
  await page.getByRole('button', { name: '会话 B', exact: true }).click(); await page.waitForFunction(() => window.testNative.ctx.sidebarRight.mounted.getSnapshot() === 'B' && window.testNative.ctx.sessions.binding('B').session.getSnapshot().blank);
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  const blankModeGroups = await modes.count(), floating = await page.locator('.dshome-v2-entry').count(); check(blankModeGroups === 1, 'blank Session has no in-flow mode entry'); check(floating === 0, 'floating entry remains over native composer/shell');
  await page.screenshot({ path: 'test-output/workspace-chrome-blank-' + variant + '.png', fullPage: true });
  if (blankModeGroups) await modes.getByRole('button', { name: '工作台', exact: true }).click(); else await page.getByRole('button', { name: '进入工作台 ↗', exact: true }).click();
  await page.locator('.dshome-v2:visible').waitFor();
  const input = page.locator('[contenteditable=true][data-lexical-editor=true]:visible'); await input.fill('空会话输入草稿仍保留');
  await page.locator('[data-wb-content="TERM-01"]:visible').getByRole('button', { name: '启动终端', exact: true }).click();
  const retry = page.getByRole('button', { name: '重试启动', exact: true }); await retry.waitFor();
  // B deliberately lacks a Host Agent lookup in this fixture. This is a real
  // SDK/Typert failed-start projection, not a constructed fake terminal state.
  const themeInput = await input.elementHandle();
  for (const step of [{ preference: 'light', scheme: 'light' }, { preference: 'dark', scheme: 'dark' }, { preference: 'system', scheme: 'light' }, { preference: 'system', scheme: 'dark' }]) {
    const theme = step.preference + '-' + step.scheme; await page.emulateMedia({ colorScheme: step.scheme });
    await page.evaluate(preference => window.testNative.ctx.theme.setTheme(preference), step.preference);
    await page.waitForFunction(step => document.documentElement.getAttribute('data-ds-theme-source') === step.preference && document.body.hasAttribute('data-ds-dark-theme') === (step.scheme === 'dark'), step);
    const panel = await styles('.dshome-v2:visible .wb-panel'), projects = await styles('.wb-project-host:visible nav button'), termRetry = await styles('.dshome-v2:visible .wb-terminal button');
    check(panel.contrast >= 4.5, theme + ' panel contrast <4.5'); check(projects.contrast >= 4.5, theme + ' project control contrast <4.5'); check(parseFloat(projects.radius) >= 6, theme + ' project controls are unstyled'); check(termRetry.contrast >= 4.5, theme + ' terminal retry contrast <4.5');
    const mode = blankModeGroups ? await styles('.dshome-wb-switch button[aria-pressed=false]') : undefined; if (mode) check(mode.contrast >= 4.5, theme + ' inactive mode contrast <4.5');
    check(await themeInput.evaluate(el => el.isConnected), theme + ' rebound native input during theme change');
    probes.push({ phase: theme, panel, projects, termRetry, mode }); await page.screenshot({ path: 'test-output/workspace-chrome-' + theme + '-' + variant + '.png', fullPage: true });
  }
  await page.setViewportSize({ width: 900, height: 1080 });
  await page.evaluate(async () => { let previous, stable = 0; for (let i = 0; i < 180; i++) { await new Promise(requestAnimationFrame); const r = document.querySelector('.dshome-v2').getBoundingClientRect(), text = document.querySelector('[data-composer-input=true]').getBoundingClientRect(), next = JSON.stringify([r.x, r.width, text.x, text.width]); stable = next === previous ? stable + 1 : 0; previous = next; if (stable >= 3) return; } throw Error('Native narrow geometry never stabilised'); });
  const geometry = await page.evaluate(() => { const input = document.querySelector('[data-composer-input=true]'), r = input.getBoundingClientRect(), hostElement = [...document.querySelectorAll('.wb-project-host')].find(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility === 'visible'), host = hostElement.getBoundingClientRect(), controls = [...hostElement.querySelector('nav[aria-label="会话项目"]').querySelectorAll('input,select,button')].map(el => { const b = el.getBoundingClientRect(); return { x: b.x, right: b.right }; }); return { inputHit: input.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), hostX: host.x, inputRight: r.right, viewport: innerWidth, outerWidth: document.documentElement.scrollWidth, controls }; });
  check(geometry.inputHit && geometry.hostX >= geometry.inputRight && geometry.outerWidth <= geometry.viewport + 1, 'narrow native input is covered or page overflows'); check(geometry.controls.every(r => r.x >= geometry.hostX && r.right <= geometry.viewport + 1), 'project controls overflow their own panel');
  assert.equal(await page.evaluate(() => window.testNative.reference.input('B').state.getSnapshot().draft), '空会话输入草稿仍保留'); assert.equal(metrics.spawn, 0);
  await page.screenshot({ path: 'test-output/workspace-chrome-narrow-' + variant + '.png', fullPage: true });
  const evidence = { failures, blankModeGroups, floating, keyboard, probes, geometry, theme: await page.evaluate(() => ({ snapshot: window.testNative.ctx.theme.getTheme(), settings: window.testNative.themeSettings.writes, directory: window.testNative.ctx.theme.exportInspectTokens() })), exclusions: ['settings persistence, left navigation, locale/access answers and Host Session/journal/auth/policy are fixtures', 'actual ThemeRuntime/token styles/AppFrame presenter are used; not installed or production GUI', 'tested-widget contrast only, not a full WCAG or approved-design certification'] };
  await writeFile('test-output/workspace-chrome-' + variant + '-observed.json', JSON.stringify(evidence, null, 2)); assert.deepEqual(failures, []); return evidence;
}
