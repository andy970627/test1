# 重切木馬之夜的本機字體子集（11/27）。用法：在 repo 根目錄執行 python -I prototypes/troy-prologue/vendor/make-fonts.py
# 掃描遊戲頁會載入的檔案裡的所有字（加 ASCII），向 Google Fonts 的 text= 子集服務要 woff2，寫進 fonts/ 並重寫 fonts.css、fonts-ui2.css。
# 需要網路；只在新增文字後重跑。來源與授權見 LICENSES.md。
import urllib.request, urllib.parse, io, re, os
HERE = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(HERE, '..', '..')
SRC = ['troy-prologue/index.html', 'troy-prologue/risset.js', 'troy-prologue/audio.js', 'troy-prologue/calibration.js', 'troy-prologue/level-troy.js',
       'troy-prologue/level-troy-final.js', 'troy-prologue/level-troy-demo.js', 'nav.js', 'beatstrip.js', 'telemetry.js', 'ui-tokens.css']
chars = set(chr(c) for c in range(0x20, 0x7f))
for f in SRC: chars |= set(ch for ch in io.open(os.path.join(P, f), encoding='utf-8').read() if ord(ch) >= 0xa0)
t = ''.join(sorted(chars)); CH = [t[i:i + 450] for i in range(0, len(t), 450)]   # 一次太長 Google 會忽略 text=，450 字以內安全
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'}
GROUPS = {'fonts.css': [('Noto Serif TC', 'notoseriftc', 600), ('Noto Serif TC', 'notoseriftc', 900), ('Noto Sans TC', 'notosanstc', 400), ('Noto Sans TC', 'notosanstc', 500)],
          'fonts-ui2.css': [('Noto Sans TC', 'notosanstc', 700), ('LXGW WenKai TC', 'lxgwwenkaitc', 400), ('LXGW WenKai TC', 'lxgwwenkaitc', 700)]}
D = os.path.join(HERE, 'fonts'); os.makedirs(D, exist_ok=True); total = 0
for css, items in GROUPS.items():
    out = ['/* 本機字體（離線用）：只含木馬之夜頁面實際用到的字，來源與授權見 ../LICENSES.md。由 Google Fonts 的 text= 子集服務切出（make-fonts.py）。 */']
    for fam, slug, w in items:
        for i, c in enumerate(CH):
            u = 'https://fonts.googleapis.com/css2?family=' + fam.replace(' ', '+') + ':wght@' + str(w) + '&text=' + urllib.parse.quote(c)
            r = urllib.request.urlopen(urllib.request.Request(u, headers=UA)).read().decode()
            assert r.count('@font-face') == 1, (fam, w, i)
            src = re.search(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', r).group(1)
            ur = re.search(r'unicode-range:\s*([^;]+);', r).group(1).strip()
            data = urllib.request.urlopen(urllib.request.Request(src, headers=UA)).read(); assert data[:4] == b'wOF2'
            fn = f'{slug}-{w}-{i}.woff2'; open(os.path.join(D, fn), 'wb').write(data); total += len(data)
            out.append("@font-face { font-family: '%s'; font-style: normal; font-weight: %d; font-display: swap; src: url(%s) format('woff2'); unicode-range: %s; }" % (fam, w, fn, ur))
    io.open(os.path.join(D, css), 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
print(len(t), 'chars,', total, 'bytes')
