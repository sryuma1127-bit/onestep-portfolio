#!/usr/bin/env python3
"""公開成果物に「出してはいけないもの」が混ざっていないかを機械的に検査する。

使い方:
  sanitize.py check <file...>            指定ファイルを検査。1件でも当たれば終了コード 1
  sanitize.py hash-blocklist             tools/local-blocklist.txt（Git 管理外）から tools/blocklist.sha256 を作る

検査するもの（組み込み）:
  gmail.com / Google の各種 ID（AKfy…・44文字ID）/ 本番 URL（script.google.com など）
  電話番号 / 郵便番号 / LOCAL- / .clasp / secret / password / 合言葉 / API キー

実在の氏名・会場名の照合:
  tools/local-blocklist.txt（1行1語。Git 管理外）があればそれで照合する。
  無ければ tools/blocklist.sha256（語の長さと SHA-256）で照合する。
  ★どちらも Git 管理外。短い姓のハッシュは辞書で総当たりすれば戻せるので、ハッシュ版も公開しない。
  どちらも無ければ「実在名の照合はスキップ」と表示して、組み込み検査だけを行う。

★このファイル自体には実在の氏名・会場名を書かない。
"""
import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLAIN_BLOCKLIST = os.path.join(HERE, 'local-blocklist.txt')
HASHED_BLOCKLIST = os.path.join(HERE, 'blocklist.sha256')

# (名前, 正規表現, 例外とみなす正規表現 or None)
PATTERNS = [
    ('gmail.com', re.compile(r'gmail\.com', re.I), None),
    ('デプロイID', re.compile(r'AKfy[A-Za-z0-9_-]{10,}'), None),
    ('Google の 44 文字 ID', re.compile(r'(?<![A-Za-z0-9_/-])1[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])'), None),
    ('本番 URL (script.google.com)', re.compile(r'script\.google(?:usercontent)?\.com'), None),
    ('スプレッドシート URL (ID つき)', re.compile(r'docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)'),
     re.compile(r'^(DEMO|DUMMY|XXXX+)$')),
    ('電話番号', re.compile(r'(?<![\d-])0\d{1,4}-\d{1,4}-\d{3,4}(?![\d-])'), re.compile(r'^[0-]+$')),
    ('電話番号 (ハイフン無し)', re.compile(r'(?<!\d)0[789]0\d{8}(?!\d)'), None),
    ('郵便番号', re.compile(r'〒\s?\d{3}-?\d{4}'), re.compile(r'^〒\s?0{3}-?0{4}$')),
    ('LOCAL-*.md', re.compile(r'LOCAL-[A-Z]+'), None),
    ('.clasp', re.compile(r'\.clasp(?:rc)?(?:\.[a-z]+)?\.json|\.clasp\b'), None),
    # 「合言葉」「password」は機能名として本文に出る（閲覧用ページの説明など）ので、語そのものではなく
    # 「値が書かれている形」（secret: xxxx / 合言葉は「xxxx」 など）だけを弾く。
    ('secret / password / 合言葉 / API キーの値',
     re.compile(r'(secret|password|passwd|passphrase|api[_ -]?key|合言葉)\s*(?:は\s*(?=["\'「])|[:=：])\s*["\'「]?([^\s"\'」<>]{3,})', re.I),
     re.compile(r'^(viewerKeyGet\(\)|\$\{?[A-Z_]+\}?|<[^>]*>|\{\{.*\}\}|xxx+|\*+|…+|（[^）]*）)$')),
    ('API キーの実値 (AIza…)', re.compile(r'AIza[0-9A-Za-z_-]{30,}'), None),
    ('メールアドレス (example.com 以外)', re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'),
     re.compile(r'@example\.(com|org|net)$|@anthropic\.com$')),
]

TEXT_EXT = {'.html', '.htm', '.md', '.json', '.js', '.mjs', '.py', '.sh', '.svg', '.txt', '.css', '.yml', '.yaml', '.gitignore'}
BASE64_BLOB = re.compile(r'data:[a-z]+/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+')


def is_text(path):
    base = os.path.basename(path)
    ext = os.path.splitext(base)[1].lower()
    return ext in TEXT_EXT or base in ('.gitignore', 'LICENSE')


def load_blocklist():
    """(plain_terms, hashed) を返す。hashed は {長さ: set(sha256)}。"""
    plain, hashed = [], {}
    if os.path.exists(PLAIN_BLOCKLIST):
        with open(PLAIN_BLOCKLIST, encoding='utf-8') as f:
            plain = [ln.strip() for ln in f if ln.strip() and not ln.startswith('#')]
    elif os.path.exists(HASHED_BLOCKLIST):
        with open(HASHED_BLOCKLIST, encoding='utf-8') as f:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith('#'):
                    continue
                n, h = ln.split(':', 1)
                hashed.setdefault(int(n), set()).add(h)
    return plain, hashed


def sha(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


# 検査パターンの定義そのものを持つファイル（「gmail.com」などの語が入っていて当然）。
# ★外すのはパターン検査だけ。実在名の照合はこのファイルにも必ず行う。行単位で検査を外す仕組みは持たない。
SELF_FILES = ('tools/sanitize.py', 'tools/check-public.sh')


def is_self_file(path):
    norm = os.path.abspath(path)
    return any(norm == os.path.join(os.path.dirname(HERE), f) for f in SELF_FILES)


def check_file(path, plain, hashed):
    hits = []
    with open(path, encoding='utf-8', errors='replace') as f:
        raw = f.read()
    text = BASE64_BLOB.sub('data:BASE64_BLOB_REMOVED', raw)
    lines = text.split('\n')
    for name, rx, allow in ([] if is_self_file(path) else PATTERNS):
        for i, ln in enumerate(lines, 1):
            for m in rx.finditer(ln):
                found = m.group(1) if m.groups() else m.group(0)
                if allow and allow.search(found):
                    continue
                hits.append((path, i, name, found[:60]))
    for term in plain:
        for i, ln in enumerate(lines, 1):
            if term in ln:
                hits.append((path, i, '実在名（ブロックリスト）', term[:1] + '＊' * (len(term) - 1)))
    if hashed:
        # 語の長さごとに、その長さの窓を全部ハッシュして照合する（語そのものは持たない）
        for i, ln in enumerate(lines, 1):
            for n, hs in hashed.items():
                if len(ln) < n:
                    continue
                for j in range(len(ln) - n + 1):
                    if sha(ln[j:j + n]) in hs:
                        hits.append((path, i, '実在名（ハッシュ照合）', ln[j] + '＊' * (n - 1)))
    return hits


def cmd_check(paths):
    plain, hashed = load_blocklist()
    if plain:
        print(f'実在名の照合: local-blocklist.txt（{len(plain)} 語）')
    elif hashed:
        print(f'実在名の照合: blocklist.sha256（{sum(len(v) for v in hashed.values())} 語・ハッシュ）')
    else:
        print('実在名の照合はスキップ（tools/local-blocklist.txt も tools/blocklist.sha256 も無い）')
    hits, n = [], 0
    for p in paths:
        if os.path.isdir(p) or not is_text(p):
            continue
        n += 1
        hits += check_file(p, plain, hashed)
    for path, line, name, found in hits:
        print(f'  NG {path}:{line}  [{name}]  {found}')
    print(f'検査したファイル: {n} 本 / 該当: {len(hits)} 件')
    return 1 if hits else 0


def cmd_hash_blocklist():
    if not os.path.exists(PLAIN_BLOCKLIST):
        print(f'{PLAIN_BLOCKLIST} がありません（1行1語で実在の氏名・会場名を書く。Git 管理外）')
        return 1
    with open(PLAIN_BLOCKLIST, encoding='utf-8') as f:
        terms = sorted({ln.strip() for ln in f if ln.strip() and not ln.startswith('#')})
    with open(HASHED_BLOCKLIST, 'w', encoding='utf-8') as f:
        f.write('# local-blocklist.txt の各語の「長さ:SHA-256」。語そのものは含まない。sanitize.py hash-blocklist で作る\n')
        for t in terms:
            f.write(f'{len(t)}:{sha(t)}\n')
    print(f'{HASHED_BLOCKLIST} を書きました（{len(terms)} 語）')
    return 0


if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == 'check':
        sys.exit(cmd_check(sys.argv[2:]))
    if len(sys.argv) >= 2 and sys.argv[1] == 'hash-blocklist':
        sys.exit(cmd_hash_blocklist())
    print(__doc__)
    sys.exit(2)
