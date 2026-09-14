'use strict';
/**
 * 公開デモからスクリーンショット 6 枚を撮る。
 *
 *   必要なもの: npm install（puppeteer-core。ブラウザは落とさず、入っている Google Chrome を使う）
 *   使い方:     node tools/shoot.js
 *   出力:       assets/screenshots/01-home.png … 05-tournament.png（375×812・2倍）
 *               assets/screenshots/06-settings.png（1200 幅・2倍）
 *   Chrome の場所は CHROME で上書きできる。
 *
 * 画面の状態は demo/index.html の ?shot=… が作る（tools/build-demo.js の末尾）。
 * 撮る前に必ずデモを作り直す（古い画面を撮らない）。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'screenshots');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e) {
  console.log('puppeteer-core が入っていません。npm install を実行してください。');
  process.exit(1);
}
if (!fs.existsSync(CHROME)) { console.log('Chrome が見つかりません: ' + CHROME); process.exit(1); }

execFileSync(process.execPath, [path.join(__dirname, 'build-demo.js')], { stdio: 'inherit', env: process.env });
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { file: '01-home.png',            shot: 'home',     w: 375,  h: 812 },
  { file: '02-plan-attendance.png', shot: 'plan-att', w: 375,  h: 812 },
  { file: '03-record.png',          shot: 'record',   w: 375,  h: 812 },
  { file: '04-dues.png',            shot: 'dues',     w: 375,  h: 812 },
  { file: '05-tournament.png',      shot: 'match',    w: 375,  h: 812 },
  { file: '06-settings.png',        shot: 'settings', w: 1200, h: 1000 }
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
  const problems = [];
  try {
    for (const s of SHOTS) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => problems.push(s.shot + ': 画面のエラー ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(s.shot + ': console ' + m.text()); });
      page.on('dialog', async (d) => { problems.push(s.shot + ': ダイアログ ' + d.message()); await d.dismiss(); });
      await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 2, isMobile: s.w < 600, hasTouch: s.w < 600 });
      await page.goto('file://' + path.join(ROOT, 'demo', 'index.html') + '?shot=' + s.shot, { waitUntil: 'load' });
      await page.waitForFunction(() => window.state && window.state.data && document.getElementById('app').style.display !== 'none', { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 1500));   // ?shot= の画面づくり（タブ切替・読み直し・スクロール）を待つ
      await page.screenshot({ path: path.join(OUT, s.file) });
      console.log('  ' + path.relative(ROOT, path.join(OUT, s.file)));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.log('\n■ 気づいた問題');
    problems.forEach((p) => console.log('  - ' + p));
    process.exit(1);
  }
  console.log('撮りました（画面のエラーはありません）');
})();
