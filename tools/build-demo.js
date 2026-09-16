'use strict';
/**
 * 公開デモ demo/index.html を作る。
 *
 *   本体リポジトリ（読むだけ）の指定コミットから Dashboard.html を取り出し、
 *   tools/demo-data.json（完全な架空データ）と「ブラウザ内だけで動く偽サーバー」を埋め込む。
 *   本体の .git・Code.gs・test.js は一切コピーしない。取り出した画面コードは
 *   sanitize.py で検査してから使う。
 *
 * 使い方:  node tools/build-demo.js [本体リポジトリのパス] [コミット]
 *
 * ★日付は「開いた日」に合わせてブラウザ側でずらす（ビルド時に焼き込まない）。
 *   そのため作り直さなくてもデモが古くならない。詳しくは buildStub の中の shiftForToday。
 *   基準日を変えて確かめたいときは、開くときに ?today=YYYY-MM-DD を付ける（例: demo/index.html?today=2026-12-24）。
 *
 * 出力: demo/index.html（自己完結。外部通信なし）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPO = process.argv[2] || path.join(os.homedir(), 'One-Step');
const COMMIT = process.argv[3] || '88e191b';
const OUT = path.join(ROOT, 'demo', 'index.html');

// 1. 本体から画面コードを「読むだけ」で取り出す
let html = execFileSync('git', ['-C', REPO, 'show', COMMIT + ':Dashboard.html'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
// 本体の画面には、入力例・説明文・コメントに実在の会場名などが残っている。公開用に架空の値へ置き換える。
// ★置き換え表は「置き換え元＝実在情報」を含むので、Git 管理外の tools/local-replacements.json に置く（形は
//   tools/local-replacements.example.json）。表が無いと置き換えられず、下の sanitize で止まる（公開物は作らない）。
//   会場の色分け（venueTone）の照合語もこの表で架空会場に合わせる。挙動が変わるのはそこだけ。
const REPL_PATH = path.join(__dirname, 'local-replacements.json');
if (!fs.existsSync(REPL_PATH)) {
  console.error('tools/local-replacements.json がありません（Git 管理外の置き換え表）。example を見本に作ってください。');
  process.exit(1);
}
const REPLACEMENTS = JSON.parse(fs.readFileSync(REPL_PATH, 'utf8')).replacements;
REPLACEMENTS.forEach(([from, to]) => { html = html.split(from).join(to); });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onestep-demo-'));
const srcPath = path.join(tmp, 'Dashboard.src.html');
fs.writeFileSync(srcPath, html);
sanitize(srcPath, '取り出した Dashboard.html');

// 2. 架空データを読む（日付はここでは動かさない。開いた日に合わせてブラウザ側でずらす）
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-data.json'), 'utf8'));
const deleted = data.demoDeleted || [];
delete data.demoDeleted;
delete data._dates;

// 3. 偽サーバーと注意書きを差し込む
const stub = buildStub(data, deleted);
if (html.indexOf('<body>') < 0) throw new Error('Dashboard.html に <body> が見つかりません');
if (html.indexOf('</head>') < 0) throw new Error('Dashboard.html に </head> が見つかりません');
let out = html.replace('<body>', '<body>' + stub);
out = out.replace(/<title>[^<]*<\/title>/, '<title>OneStep 公開デモ（架空データ）</title>');
// ★アイコンを指定しないと、ブラウザが配信元の一番上（/favicon.ico）を取りに行って 404 になる。
//   リポジトリ直下の favicon.ico を相対で指す（外部への通信は増えない）。
out = out.replace('</head>', '<link rel="icon" href="../favicon.ico" sizes="any">\n<link rel="apple-touch-icon" href="../favicon.png">\n</head>');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
sanitize(OUT, '出力 demo/index.html');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('作りました: ' + OUT + ' (' + Math.round(out.length / 1024) + ' KB, 日付は開いた日に合わせて可変, 元 ' + COMMIT + ')');

// ---------------------------------------------------------------------------

function sanitize(file, label) {
  const r = require('child_process').spawnSync('python3', [path.join(__dirname, 'sanitize.py'), 'check', file], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.status !== 0) {
    console.error(label + ' に公開できない内容が含まれています。中止します。');
    process.exit(1);
  }
}

function buildStub(data, deleted) {
  return `
<style>
  .demo-banner { background: #0f2a4a; color: #fff; font-size: 12px; line-height: 1.5; padding: 8px 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .demo-banner b { background: #f2b33d; color: #0f2a4a; border-radius: 4px; padding: 1px 6px; font-size: 11px; letter-spacing: .04em; }
  .demo-banner a { color: #cfe3ff; margin-left: auto; white-space: nowrap; }
  .demo-banner button { background: transparent; color: #cfe3ff; border: 1px solid rgba(255,255,255,.4); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
  body.shot .demo-banner { display: none; }
</style>
<div class="demo-banner" id="demoBanner">
  <b>公開デモ</b>
  <span>架空のクラブ・架空のメンバーのデータです。保存はこのページの中だけに反映され、再読み込みで元に戻ります。</span>
  <button type="button" onclick="location.reload()">初期状態に戻す</button>
  <a href="../index.html">← 事例紹介へ</a>
</div>
<script>
/* ====== ここから下は公開デモ用の偽サーバー。本番には含まれない。通信は一切しない ====== */
window.__FAKE__ = ${JSON.stringify(data)};
window.__DEMO_DELETED__ = ${JSON.stringify(deleted)};

/* ------------------------------------------------------------------
 * 開いた日に合わせて日付をずらす（デモが古くならないように）。
 *
 * ★ずらす量は必ず 7 日単位。曜日を保つので、練習会は土曜・水曜のままになる。
 * ★次の条件を同時に満たす量を選ぶ。
 *     ・練習の記録（いちばん新しいもの）は今日より前
 *     ・大会の申込締切と次の練習会は今日より後
 *   データ側で「記録の最終日」と「最も早い締切」の間を 8 日以上あけてあるので、
 *   条件を満たす 7 の倍数が必ず1つ以上ある（tools/demo-data.json の _dates を参照）。
 * ★確かめるときは ?today=YYYY-MM-DD を付ける（例: ?today=2026-12-24）。
 * ------------------------------------------------------------------ */
(function () {
  var F = window.__FAKE__, DEL = window.__DEMO_DELETED__;
  var q = /[?&]today=(\\d{4}-\\d{2}-\\d{2})/.exec(location.search);
  var today = q ? q[1] : tokyoToday();
  // ★?today= を付けたときは画面の時計も同じ日にする（確かめるときに、データだけ動いて画面の判定が今日のまま、
  //   という食い違いを起こさないため）。付けていない通常の表示では何も置き換えない。
  if (q) {
    var fixed = new Date(today + 'T12:00:00+09:00').getTime();
    var RealDate = Date;
    var FakeDate = function () {
      if (arguments.length === 0) return new RealDate(fixed);
      return new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))();
    };
    FakeDate.now = function () { return fixed; };
    FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse; FakeDate.prototype = RealDate.prototype;
    window.Date = FakeDate;
  }
  var day = function (s) { return Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000); };
  var plans = {};
  (F.plans || []).forEach(function (p) { plans[p.id] = p; });
  // 過去でいてほしい日のうち、いちばん新しいもの
  var last = (F.events || []).map(function (e) { return e.date; }).sort().pop();
  // 未来でいてほしい日のうち、いちばん早いもの（申込締切と、出欠が入っている練習会）
  var firsts = (F.tournaments || []).filter(function (t) { return t.status === '予定' && t.deadline; }).map(function (t) { return t.deadline; })
    .concat((F.attendance || []).map(function (a) { return plans[a.planId] ? plans[a.planId].date : null; }).filter(Boolean));
  var first = firsts.sort()[0];
  var t0 = day(today);
  var lo = t0 + 1 - day(first);           // これ以上ずらせば「締切・次の練習会」が未来になる
  var hi = t0 - 1 - day(last);            // これ以下なら「練習の記録」が過去のままになる
  var shift = Math.ceil(lo / 7) * 7;
  if (shift > hi) shift = Math.floor(hi / 7) * 7;   // 念のため（データの間隔が足りないとき）
  if (shift) {
    var move = function (v) {
      if (typeof v === 'string') {
        return v.replace(/\\d{4}-\\d{2}-\\d{2}/g, function (m) {
          var d = new Date((day(m) + shift) * 86400000);
          return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
        });
      }
      if (Array.isArray(v)) return v.map(move);
      if (v && typeof v === 'object') { Object.keys(v).forEach(function (k) { v[k] = move(v[k]); }); return v; }
      return v;
    };
    move(F); move(DEL);
  }
  // 会費の年度は「今日」から決める（4月はじまり）
  var start = (F.settings && F.settings.fiscalStartMonth) || 4;
  var fy = (+today.slice(5, 7) >= start) ? +today.slice(0, 4) : +today.slice(0, 4) - 1;
  (F.dues || []).forEach(function (d) { d.fiscalYear = fy; });
  F.generatedAt = today + ' 09:00';
  function tokyoToday() {
    var s = '';
    try { s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 10); } catch (e) { s = ''; }
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) return s;
    var d = new Date(Date.now() + 9 * 60 * 60 * 1000);   // 日本は夏時間が無いので UTC+9
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
})();

window.__DELAY__ = /[?&]shot=/.test(location.search) ? 30 : 350;
if (/[?&]shot=/.test(location.search)) {
  document.body.className += ' shot';
  // ★ヘッドレス Chrome の仮想時間（--virtual-time-budget）では smooth スクロールが終わらず撮影が止まるので、即時スクロールに置き換える
  var nativeSIV = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (opt) { nativeSIV.call(this, opt && typeof opt === 'object' ? { block: opt.block || 'start' } : opt); };
}
var google = (function () {
  var F = window.__FAKE__;
  var DEL = window.__DEMO_DELETED__;
  var seq = 100;
  function nowKey() { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 16); }
  function today() { return nowKey().slice(0, 10); }
  function nextId(list, prefix) {
    var mx = 0;
    list.forEach(function (x) { var n = Number(String(x.id || '').slice(2)); if (n > mx) mx = n; });
    DEL.forEach(function (x) { var n = Number(String(x.id || '').slice(2)); if (String(x.id).slice(0, 2) === prefix && n > mx) mx = n; });
    return prefix + String(mx + 1).padStart(4, '0');
  }
  function stamp(row) { row.updatedAt = nowKey(); row.version = 'demo-' + (++seq); return row; }
  function find(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }
  function remove(list, id) { var i = list.map(function (x) { return x.id; }).indexOf(id); if (i >= 0) list.splice(i, 1); }
  function num(v) { return Number(v) || 0; }
  function toDeleted(sheet, row, label, who) {
    DEL.push({ sheet: sheet, id: row.id, label: label, deletedAt: nowKey(), deletedBy: who || F.me.name, version: row.version || '', row: row });
  }
  function eventTotals(e) {
    e.income = num(e.memberCount) * num(e.memberFee) + num(e.visitorCount) * num(e.visitorFee) + num(e.otherIncome) + num(e.adjustment);
    e.expense = num(e.courtFee) + num(e.supplyCost) + num(e.otherExpense);
    e.balance = e.income - e.expense;
    e.unpaid = e.unpaid || [];
    e.unpaidCount = e.unpaid.length;
    e.unpaidAmount = e.unpaid.length * num(e.memberFee);
    return e;
  }
  function duesStatus(d) { return d.paid <= 0 ? '未納' : (d.paid >= d.billed ? '完納' : '一部入金'); }
  var H = {
    saveAttendance: function (p) {
      var a = F.attendance.filter(function (x) { return x.planId === p.planId; })[0];
      var mode = a ? 'update' : 'create';
      if (!a) {
        a = { id: nextId(F.attendance, 'AT'), planId: p.planId, confirmedAt: '', confirmedMembers: '', confirmedVisitors: '',
          confirmedVisitorFee: '', confirmedCourtFee: '', announcedFee: '', deleted: false };
        F.attendance.push(a);
      }
      a.present = (p.present || []).slice(); a.absent = (p.absent || []).slice(); a.undecided = (p.undecided || []).slice();
      stamp(a);
      return { id: a.id, mode: mode };
    },
    deleteAttendance: function (p) {
      var a = find(F.attendance, p.id);
      if (!a) return { error: '出欠 ' + p.id + ' が見つかりません' };
      remove(F.attendance, p.id);
      var plan = find(F.plans, a.planId);
      toDeleted('出欠', a, (plan ? plan.date + ' ' + (plan.venue || '') : a.planId) + ' の出欠');
      return { planId: a.planId };
    },
    savePlan: function (p) {
      var row = p.id ? find(F.plans, p.id) : null;
      var mode = row ? 'update' : 'create';
      if (!row) { row = { id: nextId(F.plans, 'PL') }; F.plans.push(row); }
      ['date', 'startTime', 'endTime', 'kind', 'venue', 'title', 'memo'].forEach(function (k) { if (p[k] !== undefined) row[k] = p[k]; });
      if (p.courtCount !== undefined) row.courtCount = p.courtCount === '' ? '' : num(p.courtCount);
      if (p.courtFee !== undefined) row.courtFee = p.courtFee === '' ? '' : num(p.courtFee);
      stamp(row);
      return { id: row.id, mode: mode };
    },
    deletePlan: function (p) {
      var row = find(F.plans, p.id);
      if (!row) return { error: '予定 ' + p.id + ' が見つかりません' };
      if (F.attendance.some(function (a) { return a.planId === p.id; })) return { error: 'この予定には出欠が登録されています。先に出欠を消してください' };
      remove(F.plans, p.id);
      toDeleted('予定', row, row.date + ' ' + (row.title || row.kind) + (row.venue ? ' ' + row.venue : ''));
      return {};
    },
    saveEvent: function (p) {
      var row = p.id ? find(F.events, p.id) : null;
      var mode = row ? 'update' : 'create';
      if (!row) { row = { id: nextId(F.events, 'EV'), shared: '未共有' }; F.events.push(row); }
      ['date', 'kind', 'venue', 'title', 'timeslot', 'owner', 'unpaid', 'visitorNames', 'memberCount', 'visitorCount',
        'memberFee', 'visitorFee', 'otherIncome', 'adjustment', 'courtFee', 'supplyCost', 'otherExpense', 'memo'].forEach(function (k) { if (p[k] !== undefined) row[k] = p[k]; });
      // 画面はキーの配列を送り、サーバーは { key, name, email, unpaid } の配列で返す（本番と同じ形にそろえる）
      if (p.participants !== undefined) {
        var byKey = {};
        F.members.forEach(function (m) { byKey[m.key] = m; });
        var unpaid = {};
        (p.unpaid || []).forEach(function (k) { unpaid[k] = true; });
        row.participants = (p.participants || []).map(function (k) { return { key: k, name: byKey[k] ? byKey[k].name : k, email: '', unpaid: !!unpaid[k] }; });
      }
      if (p.planId) row.planId = p.planId;
      stamp(eventTotals(row));
      return { id: row.id, mode: mode };
    },
    deleteEvent: function (p) {
      var row = find(F.events, p.id);
      if (!row) return { error: '記録 ' + p.id + ' が見つかりません' };
      remove(F.events, p.id);
      toDeleted('イベント', row, row.date + ' ' + (row.title || row.kind) + (row.venue ? ' ' + row.venue : ''));
      return {};
    },
    saveMisc: function (p) {
      var row = p.id ? find(F.misc, p.id) : null;
      var mode = row ? 'update' : 'create';
      if (!row) { row = { id: nextId(F.misc, 'MS') }; F.misc.push(row); }
      ['date', 'direction', 'category', 'title', 'memo'].forEach(function (k) { if (p[k] !== undefined) row[k] = p[k]; });
      row.amount = num(p.amount);
      stamp(row);
      return { id: row.id, mode: mode };
    },
    deleteMisc: function (p) {
      var row = find(F.misc, p.id);
      if (!row) return { error: '記録 ' + p.id + ' が見つかりません' };
      remove(F.misc, p.id);
      toDeleted('その他収支', row, row.date + ' ' + row.title);
      return {};
    },
    payDues: function (p) {
      var d = find(F.dues, p.id);
      if (!d) return { error: '会費 ' + p.id + ' が見つかりません' };
      if (p.amount !== undefined) { d.paid = num(d.paid) + num(p.amount); d.paidDate = p.date || today(); }
      else { d.paid = num(p.paid); d.paidDate = p.paidDate || ''; }
      d.status = duesStatus(d);
      stamp(d);
      return { mode: 'create' };
    },
    saveDues: function (p) {
      var d = p.id ? find(F.dues, p.id) : null;
      var mode = d ? 'update' : 'create';
      if (!d) { d = { id: nextId(F.dues, 'DU'), paid: 0, paidDate: '', flowId: '', memo: '' }; F.dues.push(d); }
      ['fiscalYear', 'memberId', 'key', 'name', 'memo'].forEach(function (k) { if (p[k] !== undefined) d[k] = p[k]; });
      if (p.billed !== undefined) d.billed = num(p.billed);
      d.status = duesStatus(d);
      stamp(d);
      return { id: d.id, mode: mode };
    },
    deleteDues: function (p) {
      var d = find(F.dues, p.id);
      if (!d) return { error: '会費 ' + p.id + ' が見つかりません' };
      remove(F.dues, p.id);
      toDeleted('会費', d, d.fiscalYear + '年度 ' + d.name);
      return {};
    },
    markShared: function (p) { var e = find(F.events, p.id); if (e) { e.shared = p.shared; stamp(e); } return {}; },
    toggleTournamentStep: function (p) {
      var t = find(F.tournaments, p.id);
      if (!t) return { error: '大会 ' + p.id + ' が見つかりません' };
      t.progress = (t.progress || []).filter(function (s) { return s !== p.step; });
      if (p.on) t.progress.push(p.step);
      stamp(t);
      return {};
    },
    saveTournament: function (p) {
      var t = p.id ? find(F.tournaments, p.id) : null;
      var mode = t ? 'update' : 'create';
      if (!t) { t = { id: nextId(F.tournaments, 'TN'), progress: [], players: [], deleted: false, calendarEventId: '' }; F.tournaments.push(t); }
      Object.keys(p).forEach(function (k) { if (['id', 'requestId', 'baseUpdatedAt'].indexOf(k) < 0) t[k] = p[k]; });
      if (typeof t.events === 'string') t.events = t.events.split(/[、,\\n]+/).filter(Boolean);
      if (typeof t.applyMethod === 'string') t.applyMethod = t.applyMethod.split(/[、,]+/).filter(Boolean);
      if (!t.status) t.status = '予定';
      var plan = t.planId ? find(F.plans, t.planId) : null;
      if (!plan) { plan = { id: nextId(F.plans, 'PL'), startTime: '', endTime: '', memo: '', courtCount: '', courtFee: '' }; F.plans.push(plan); t.planId = plan.id; }
      plan.date = t.date || plan.date; plan.kind = '大会'; plan.venue = t.venue || ''; plan.title = t.name || '';
      stamp(plan); stamp(t);
      return { id: t.id, mode: mode, problems: [] };
    },
    deleteTournament: function (p) {
      var t = find(F.tournaments, p.id);
      if (!t) return { error: '大会 ' + p.id + ' が見つかりません' };
      remove(F.tournaments, p.id);
      if (t.planId) remove(F.plans, t.planId);
      toDeleted('大会', t, t.date + ' ' + t.name);
      return {};
    },
    saveTournamentPlayers: function (p) {
      var t = find(F.tournaments, p.id);
      if (!t) return { error: '大会 ' + p.id + ' が見つかりません' };
      t.players = String(p.players || '').split(',').filter(Boolean);
      stamp(t);
      return {};
    },
    saveLoan: function (p) {
      var l = p.id ? find(F.loans, p.id) : null;
      var mode = l ? 'update' : 'create';
      if (!l) { l = { id: nextId(F.loans, 'LN'), settled: 0, settledDate: '', originFlowId: '', settleFlowId: '' }; F.loans.push(l); }
      ['date', 'direction', 'counterparty', 'memo'].forEach(function (k) { if (p[k] !== undefined) l[k] = p[k]; });
      if (p.amount !== undefined) l.amount = num(p.amount);
      l.outstanding = num(l.amount) - num(l.settled);
      l.status = l.outstanding > 0 ? '未精算' : '精算済';
      stamp(l);
      return { id: l.id, mode: mode };
    },
    settleLoan: function (p) {
      var l = find(F.loans, p.id);
      if (!l) return { error: '貸借 ' + p.id + ' が見つかりません' };
      l.settled = num(l.settled) + num(p.amount !== undefined ? p.amount : l.outstanding);
      l.outstanding = Math.max(0, num(l.amount) - num(l.settled));
      l.status = l.outstanding > 0 ? '未精算' : '精算済';
      l.settledDate = l.outstanding > 0 ? '' : (p.date || today());
      stamp(l);
      return {};
    },
    saveMember: function (p) {
      var m = p.id ? find(F.members, p.id) : null;
      var mode = m ? 'update' : 'create';
      if (!m) { var id = nextId(F.members, 'MB'); m = { id: id, key: id, email: '', joinedAt: today() }; F.members.push(m); }
      ['name', 'role', 'status', 'joinedAt'].forEach(function (k) { if (p[k] !== undefined) m[k] = p[k]; });
      stamp(m);
      return { id: m.id, mode: mode };
    },
    saveDirectoryEntry: function (p) {
      var d = F.directory.filter(function (x) { return x.key === (p.key || p.memberId); })[0];
      if (!d) { d = { key: p.key || p.memberId, memberId: p.memberId || p.key, email: '' }; F.directory.push(d); }
      ['nickname', 'realName', 'furigana', 'gender', 'birthday', 'address', 'refereeNo', 'jstaNo', 'memo'].forEach(function (k) { if (p[k] !== undefined) d[k] = p[k]; });
      return {};
    },
    saveSettings: function () { return {}; },
    listDeleted: function (p) {
      return { rows: DEL.filter(function (x) { return x.sheet === p.sheet; }).map(function (x) {
        return { id: x.id, label: x.label, deletedAt: x.deletedAt, deletedBy: x.deletedBy, version: x.version };
      }) };
    },
    restoreRow: function (p) {
      var i = DEL.map(function (x) { return x.id; }).indexOf(p.id);
      if (i < 0) return { error: p.id + ' は削除一覧にありません' };
      var x = DEL.splice(i, 1)[0];
      var target = { 'イベント': F.events, '予定': F.plans, 'その他収支': F.misc, '会費': F.dues, '大会': F.tournaments, '出欠': F.attendance }[x.sheet];
      if (target) target.push(stamp(x.row));
      return { restored: [p.id] };
    },
    checkConsistency: function () { return { checkedAt: nowKey(), mode: 'lines', issues: [], counts: {} }; },
    backupAll: function () {
      var g = nowKey().replace(/[^0-9]/g, '').slice(0, 12);
      return { generation: g, files: [
        { key: '本体', url: '（デモ：複製は作りません）' }, { key: '名簿', url: '（デモ：複製は作りません）' }, { key: '履歴', url: '（デモ：複製は作りません）' }] };
    },
    showVenues: function () {
      var counts = {};
      F.events.forEach(function (e) { if (e.venue) counts[e.venue] = (counts[e.venue] || 0) + 1; });
      return { counts: counts, venues: F.settings.venues };
    },
    markShared_: null
  };
  function respond(action, payload) {
    var h = H[action];
    if (!h) return { success: false, error: 'デモでは「' + action + '」は動きません（本番では Google Apps Script が処理します）' };
    var r;
    try { r = h(payload || {}); } catch (e) { return { success: false, error: 'デモの偽サーバーで失敗: ' + e.message }; }
    if (r && r.error) return { success: false, error: r.error };
    return { success: true, result: r || {} };
  }
  function Runner() { this.ok = null; this.ng = null; }
  Runner.prototype.withSuccessHandler = function (f) { this.ok = f; return this; };
  Runner.prototype.withFailureHandler = function (f) { this.ng = f; return this; };
  Runner.prototype.apiGetData = function () {
    var s = this.ok;
    setTimeout(function () { var d = JSON.parse(JSON.stringify(F)); d.version = seq; s(JSON.stringify(d)); }, window.__DELAY__);
  };
  Runner.prototype.apiPostAction = function (action, payload) {
    var s = this.ok;
    var res = respond(action, payload);
    if (res.success) seq++;
    setTimeout(function () { s(JSON.stringify(res)); }, window.__DELAY__);
  };
  return { script: { get run() { return new Runner(); } } };
})();

/* スクリーンショット用: ?shot=home|plan-att|record|dues|match|settings で画面の状態を作る（tools/shoot.sh が使う） */
(function () {
  var m = /[?&]shot=([a-z-]+)/.exec(location.search);
  if (!m) return;
  var shot = m[1];
  var tries = 0;
  var wait = setInterval(function () {
    if (++tries > 200) { clearInterval(wait); return; }
    if (!window.state || !state.data || document.getElementById('app').style.display === 'none') return;
    clearInterval(wait);
    try {
      var F = window.__FAKE__;
      if (shot === 'plan-att') {
        var plan = F.plans.filter(function (p) { return p.kind === '練習会'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
        switchTab('plan');
        state.planMonth = plan.date.slice(0, 7);
        openAttendance(plan.id);
        setTimeout(function () {
          var row = document.querySelector('[data-plan-row="' + plan.id + '"]');
          if (row) window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - 52);
        }, 300);
      } else if (shot === 'record') {
        switchTab('record');
        var ev = F.events.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
        fillEventForm(ev);
        setTimeout(function () {
          var el = document.getElementById('evParticipants');
          if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140);
        }, 300);
      } else if (shot === 'dues') {
        switchTab('money'); setMoneyMode('dues');
      } else if (shot === 'match') {
        switchTab('match');
        state.openTournamentId = F.tournaments[0].id;
        renderMatch();
      } else if (shot === 'settings') {
        switchTab('settings');
        var hc = document.querySelector('[data-maint="checkConsistency"]');
        if (hc) hc.click();
        setTimeout(function () {
          var sel = document.getElementById('restoreSheet');
          if (sel) { sel.value = 'イベント'; document.getElementById('btnListDeleted').click(); }
          setTimeout(function () {
            var maint = document.querySelector('.maint');
            var card = maint && (maint.closest('.card') || maint);
            if (card) window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 72);
          }, 400);
        }, 400);
      } else {
        window.scrollTo(0, 0);
      }
    } catch (e) { console.error('shot setup failed', e); }
  }, 50);
})();
/* ====== ここまで ====== */
</script>
`;
}
