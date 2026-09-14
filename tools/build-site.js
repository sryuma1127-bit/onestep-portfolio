'use strict';
/**
 * content/*.json から index.html と README.md を作る。
 *
 *   使い方: node tools/build-site.js
 *   入力:   templates/index.template.html, templates/README.template.md, content/*.json, assets/architecture/architecture.svg
 *   出力:   index.html, README.md
 *
 * テンプレートの中の <!-- gen:NAME --> を生成した HTML/Markdown に、{{key}} を content/meta.json の値に置き換える。
 * R19/R20 で機能が増えたら content/*.json を直してこのスクリプトを実行するだけでよい（index.html と README.md は手で直さない）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const meta = json('content/meta.json');
const features = json('content/features.json').items;
const ba = json('content/before-after.json');
const timeline = json('content/timeline.json');
const svg = read('assets/architecture/architecture.svg').replace(/^<\?xml[^>]*>\s*/, '');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- HTML 断片 ----
const html = {
  features: features.filter((f) => f.status === '実装済み').map((f) =>
    `<li class="feat"><div class="feat-head"><span class="feat-name">${esc(f.name)}</span><span class="feat-since">${esc(f.since)}</span></div>`
    + `<div class="feat-biz">${esc(f.business)}</div><p>${esc(f.summary)}</p></li>`).join('\n'),
  'before-after': `<table class="ba"><thead><tr><th>業務</th><th>Before</th><th>After</th></tr></thead><tbody>`
    + ba.items.map((r) => `<tr><th>${esc(r.area)}</th><td>${esc(r.before)}</td><td>${esc(r.after)}${r.metric ? `<div class="metric">${esc(r.metric)}</div>` : ''}</td></tr>`).join('\n')
    + `</tbody></table>`
    + (ba.hoursSavedPerMonth ? `<p class="note">月あたりの削減時間（実測）: 約 ${esc(ba.hoursSavedPerMonth)} 時間</p>` : `<p class="note">削減時間は実測してから掲載します（未計測のため数字は出していません）。</p>`),
  timeline: `<ol class="tl">` + timeline.releases.map((r) =>
    `<li><span class="tl-date">${esc(r.date)}</span><span class="tl-rel">${esc(r.release)}</span><span class="tl-sum">${esc(r.summary)}</span></li>`).join('\n') + `</ol>`,
  upcoming: `<ul class="up">` + timeline.upcoming.map((u) =>
    `<li><span class="tl-rel">${esc(u.release)}</span><span class="badge muted">${esc(u.status)}</span> ${esc(u.summary)}</li>`).join('\n') + `</ul>`,
  architecture: svg
};

// ---- Markdown 断片 ----
const md = {
  features: `| 機能 | 対応する業務 | 内容 | 導入 |\n|---|---|---|---|\n`
    + features.filter((f) => f.status === '実装済み').map((f) => `| **${f.name}** | ${f.business} | ${f.summary} | ${f.since} |`).join('\n'),
  'before-after': `| 業務 | Before | After |\n|---|---|---|\n`
    + ba.items.map((r) => `| ${r.area} | ${r.before} | ${r.after}${r.metric ? `（${r.metric}）` : ''} |`).join('\n')
    + (ba.hoursSavedPerMonth ? `\n\n月あたりの削減時間（実測）: 約 ${ba.hoursSavedPerMonth} 時間` : `\n\n削減時間は実測してから掲載します（未計測のため数字は出していません）。`),
  timeline: timeline.releases.map((r) => `- ${r.date} **${r.release}** — ${r.summary}`).join('\n'),
  upcoming: timeline.upcoming.map((u) => `- **${u.release}**（${u.status}）— ${u.summary}`).join('\n')
};

function render(template, frags) {
  let out = template.replace(/<!-- gen:([a-z-]+) -->/g, (m, name) => {
    if (!(name in frags)) throw new Error('未定義の断片: ' + name);
    return frags[name];
  });
  out = out.replace(/\{\{([a-zA-Z]+)\}\}/g, (m, key) => {
    if (!(key in meta)) throw new Error('meta.json に無いキー: ' + key);
    return esc(meta[key]);
  });
  return out;
}

fs.writeFileSync(path.join(ROOT, 'index.html'), render(read('templates/index.template.html'), html));
fs.writeFileSync(path.join(ROOT, 'README.md'), render(read('templates/README.template.md'), md));
console.log('作りました: index.html, README.md（機能 ' + features.length + '・Before/After ' + ba.items.length + '・リリース ' + timeline.releases.length + '・今後 ' + timeline.upcoming.length + '）');
