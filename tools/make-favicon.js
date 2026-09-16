'use strict';
/**
 * クラブのロゴ（assets/logo/logo.png）から favicon を作る。
 *
 *   使い方: node tools/make-favicon.js
 *   出力:   favicon.ico（32×32 の PNG を1枚だけ入れた ICO）と favicon.png（180×180・スマホのホーム画面用）
 *
 * ★ロゴは横長で「ONE STEP」の文字が入っている。16〜32px では文字が読めないので、
 *   左側の階段のしるしだけを切り出して使う。色はロゴのティールと白のまま。
 * ★依存は puppeteer-core（npm install 済み）と手元の Google Chrome だけ。外部への通信はしない。
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'assets', 'logo', 'logo.png');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ロゴの中で階段のしるしが占める範囲（左端から。実測値）
const MARK = { x: 0, y: 0, w: 74, h: 72 };

(async () => {
  if (!fs.existsSync(CHROME)) { console.error('Chrome が見つかりません: ' + CHROME); process.exit(1); }
  const logo = 'data:image/png;base64,' + fs.readFileSync(LOGO).toString('base64');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setContent('<body style="margin:0">');

  const draw = (size, pad, bg) => page.evaluate(async (src, mark, size, pad, bg) => {
    const img = new Image();
    await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = src; });
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, size, size);
    // しるしの縦横比を保ったまま、余白ぶんを残して中央に置く
    const box = size - pad * 2;
    const scale = Math.min(box / mark.w, box / mark.h);
    const w = mark.w * scale, h = mark.h * scale;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, mark.x, mark.y, mark.w, mark.h, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }, logo, MARK, size, pad, bg);

  const png32 = Buffer.from(await draw(32, 2, '#ffffff'), 'base64');
  const png180 = Buffer.from(await draw(180, 22, '#ffffff'), 'base64');
  await browser.close();

  // ICO（PNG をそのまま入れる形式。いまのブラウザはこれを読める）
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  const dir = Buffer.alloc(16);
  dir[0] = 32; dir[1] = 32; dir[2] = 0; dir[3] = 0;
  dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(png32.length, 8); dir.writeUInt32LE(6 + 16, 12);
  fs.writeFileSync(path.join(ROOT, 'favicon.ico'), Buffer.concat([head, dir, png32]));
  fs.writeFileSync(path.join(ROOT, 'favicon.png'), png180);
  console.log('作りました: favicon.ico (' + (6 + 16 + png32.length) + ' bytes, 32x32) / favicon.png (' + png180.length + ' bytes, 180x180)');
})();
