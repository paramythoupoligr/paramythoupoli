# -*- coding: utf-8 -*-
"""
Παραμυθούπολη — παραγωγή παραγόμενων αρχείων από τα δεδομένα.

  1. Εικόνες:  src/assets/uploads/x.jpg  →  src/assets/img/x{.jpg,.webp,-small.jpg,-small.webp}
  2. PDF:      src/stories/*.md          →  src/assets/downloads/*.pdf   (A5, WeasyPrint)
  3. EPUB:     src/stories/*.md          →  src/assets/downloads/*.epub  (ebooklib)

Τρέχει αυτόματα στο GitHub Actions με κάθε δημοσίευση.
  python3 scripts/build_assets.py            # όλες τις ιστορίες
  python3 scripts/build_assets.py dyo-lykoi  # μία
"""
import os, re, sys, glob, html as H
from PIL import Image
import yaml
from markdown_it import MarkdownIt
from weasyprint import HTML, CSS
from ebooklib import epub

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'src')
IMG  = os.path.join(SRC, 'assets', 'img')
UP   = os.path.join(SRC, 'assets', 'uploads')
OUT  = os.path.join(SRC, 'assets', 'downloads')
os.makedirs(OUT, exist_ok=True)
os.makedirs(IMG, exist_ok=True)

NIGHT, EMBER, CREAM, RUST = '#14202c', '#e3a248', '#f4ecdc', '#8a3e3e'
FULL_W, SMALL_W = 1024, 600

# ──────────────────────────── 1. ΕΙΚΟΝΕΣ ────────────────────────────

def is_variant(name):
    """Είναι παράγωγο (μικρή έκδοση ή webp), όχι πρωτότυπο;"""
    stem = os.path.splitext(name)[0]
    return stem.endswith('-small') or name.lower().endswith('.webp')

def build_images():
    """Για κάθε πρωτότυπη εικόνα στο img/, φτιάχνει όσες από τις 4 εκδοχές λείπουν.
    Το CMS ανεβάζει απευθείας εδώ — οι υπόλοιπες εκδοχές παράγονται αυτόματα."""
    made = 0
    sources = sorted(glob.glob(os.path.join(IMG, '*'))) + sorted(glob.glob(os.path.join(UP, '*')))
    for src in sources:
        name = os.path.basename(src)
        if not name.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue
        if is_variant(name):
            continue
        base = os.path.splitext(name)[0]
        targets = {
            f'{base}.jpg':        (FULL_W,  'JPEG', 78),
            f'{base}.webp':       (FULL_W,  'WEBP', 76),
            f'{base}-small.jpg':  (SMALL_W, 'JPEG', 78),
            f'{base}-small.webp': (SMALL_W, 'WEBP', 75),
        }
        missing = {k: v for k, v in targets.items() if not os.path.exists(os.path.join(IMG, k))}
        if not missing:
            continue
        im = Image.open(src).convert('RGB')
        for fname, (w, fmt, q) in missing.items():
            out = im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            kw = dict(quality=q, optimize=True, progressive=True) if fmt == 'JPEG' \
                 else dict(quality=q, method=6)
            out.save(os.path.join(IMG, fname), fmt, **kw)
            made += 1
        print(f'  🖼  {base}: +{len(missing)} εκδοχές')
    return made

# ──────────────────────────── ΑΝΑΓΝΩΣΗ ΔΕΔΟΜΕΝΩΝ ────────────────────────────

def read_story(path):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'^---\n(.*?)\n---\n(.*)$', raw, re.S)
    d = yaml.safe_load(m.group(1))
    d['slug'] = os.path.basename(path)[:-3]
    d['body'] = m.group(2)
    for k in ('image', 'authorAvatar'):
        if d.get(k):
            d[k] = re.sub(r'^.*/assets/img/', '', str(d[k]))
    return d

CATNAME = {
    'archaioi': 'Αρχαίοι Ελληνικοί Μύθοι', 'irakleioi': 'Ηράκλειοι Μύθοι',
    'aisopou': 'Μύθοι Αισώπου', 'paradosiaka': 'Παραδοσιακά Ελληνικά Παραμύθια',
    'pagkosmia': 'Παγκόσμια Παραμυθοτράπεζα', 'symmetochi': 'Συμμετοχή «Συμπολιτών» και Φίλων',
}

def blocks(d):
    """Το σώμα σε λίστα μπλοκ: h2 / p / divider / figure / moral / discussion."""
    md = MarkdownIt()
    out, first = [], True
    tokens = md.parse(d['body'])
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.type == 'heading_open' and t.tag == 'h2':
            out.append(('h2', tokens[i + 1].content)); i += 3; continue
        if t.type == 'hr':
            out.append(('divider', d['image'])); i += 1; continue
        if t.type == 'html_block' and 'ΔΙΔΑΓΜΑ' in t.content:
            out.append(('MORAL_HERE', None)); i += 1; continue
        if t.type == 'paragraph_open':
            inline = tokens[i + 1]
            kids = inline.children or []
            if len(kids) == 1 and kids[0].type == 'image':
                src = kids[0].attrGet('src').replace('/assets/img/', '')
                alt = kids[0].content or ''
                cap = kids[0].attrGet('title') or ''
                if alt == 'ΛΟΥΛΟΥΔΙ':
                    out.append(('divider', src))
                else:
                    out.append(('figure', (src, alt, cap)))
            else:
                kind = 'dropcap' if first else 'p'
                first = False
                out.append((kind, md.renderInline(inline.content)))
            i += 3; continue
        i += 1
    return out

def moral_blocks(d):
    b = []
    if d.get('moral'):
        b.append(('moral', (d.get('moralLabel', 'Το δίδαγμα'), d['moral'])))
        b.append(('divider', d['image']))
    if d.get('discussion'):
        b.append(('discussion', ('Για συζήτηση', d['discussion'])))
        b.append(('divider', d['image']))
    return b

def assemble(d):
    bs = blocks(d)
    mb = moral_blocks(d)
    if ('MORAL_HERE', None) in bs:
        k = bs.index(('MORAL_HERE', None))
        bs = bs[:k] + mb + bs[k + 1:]
    else:
        bs = bs + mb
    if d.get('sourceNote'):
        bs.append(('note', 'Σημείωμα πηγής: ' + d['sourceNote']))
    bs.append(('closing', 'Τα παραμύθια και οι μύθοι υπάρχουν για να ταξιδεύουν. '
                          'Μπορείτε να μοιραστείτε αυτή την ιστορία, διατηρώντας πάντα '
                          'την πηγή της: paramythoupoli.gr'))
    return bs

# ──────────────────────────── 2. PDF ────────────────────────────

PDF_CSS = f"""
@page {{ size: A5; margin: 0; }}
@page content {{
  margin: 18mm 16mm 16mm;
  @bottom-center {{
    content: "Παραμυθούπολη · paramythoupoli.gr";
    font-family: 'DejaVu Serif', serif; font-style: italic;
    font-size: 7.5pt; color: #999; padding-top: 4mm;
  }}
}}
body {{ margin: 0; font-family: 'DejaVu Serif', serif; color: #2a2018; }}
.cover {{
  page: cover; background: {NIGHT}; color: {CREAM};
  width: 148mm; height: 210mm; box-sizing: border-box;
  padding: 16mm 14mm 12mm; text-align: center;
  display: flex; flex-direction: column;
}}
.cover .eyebrow {{
  font-family: 'DejaVu Sans', sans-serif; font-size: 7.5pt;
  letter-spacing: .12em; text-transform: uppercase; color: {EMBER};
  line-height: 1.7; margin-bottom: 8mm;
}}
.cover img {{ width: 100%; border-radius: 3mm; margin-bottom: 9mm; }}
.cover h1 {{ font-weight: bold; font-size: 24pt; line-height: 1.18; margin: 0 0 6mm; color: {CREAM}; }}
.cover .origin  {{ font-style: italic; font-size: 9.5pt; color: {EMBER}; margin: 0 0 5mm; }}
.cover .tagline {{ font-size: 10.5pt; line-height: 1.5; color: rgba(244,236,220,.88); margin: 0 0 5mm; }}
.cover .credit  {{ font-style: italic; font-size: 8.5pt; color: {EMBER}; margin: 0; }}
.cover .spacer  {{ flex: 1; }}
.cover .brand {{
  font-family: 'DejaVu Sans', sans-serif; font-size: 7pt;
  letter-spacing: .18em; text-transform: uppercase; color: {EMBER}; margin: 0;
}}
.content {{ page: content; }}
.content h2 {{ font-weight: bold; color: {RUST}; font-size: 13pt; margin: 7mm 0 3mm; page-break-after: avoid; }}
.content p {{ font-size: 10.5pt; line-height: 1.62; text-align: justify; margin: 0 0 3.6mm; }}
.content p.dropcap {{ clear: both; }}
.content span.dc {{
  float: left; font-weight: bold; font-size: 30pt; line-height: 1;
  color: {RUST}; margin: 0.6mm 2.4mm 0 0;
}}
.moral-box {{ background: {CREAM}; border-left: 1mm solid {RUST}; padding: 4mm 5mm; margin: 6mm 0; page-break-inside: avoid; }}
.moral-box .label {{
  display: block; font-family: 'DejaVu Sans', sans-serif; font-size: 7.5pt;
  letter-spacing: .1em; text-transform: uppercase; color: {RUST}; margin-bottom: 2mm;
}}
.moral-box p {{ font-style: italic; margin: 0; text-align: left; }}
.moral-box ul {{ margin: 0; padding-left: 5mm; }}
.moral-box li {{ font-size: 10pt; font-style: italic; line-height: 1.55; margin-bottom: 2mm; }}
.moral-box li:last-child {{ margin-bottom: 0; }}
.flower-divider {{ text-align: center; margin: 7mm 0; page-break-inside: avoid; }}
.flower-divider img {{ width: 16mm; height: 16mm; object-fit: cover; border-radius: 50%; opacity: .85; }}
figure {{ text-align: center; margin: 6mm 0; page-break-inside: avoid; }}
figure img {{ width: 100%; border-radius: 2mm; }}
figcaption {{ font-size: 8pt; font-style: italic; color: #777; margin-top: 2mm; }}
.note {{ font-size: 8.5pt; font-style: italic; color: #6a6258; text-align: left; }}
.closing {{ text-align: center; font-style: italic; font-size: 8.5pt; color: #888;
            margin-top: 8mm; padding-top: 4mm; border-top: .3mm solid #ddd; }}
"""

def build_pdf(d):
    out = []
    for kind, v in assemble(d):
        if kind == 'h2':        out.append(f'<h2>{v}</h2>')
        elif kind == 'dropcap': out.append(f'<p class="dropcap"><span class="dc">{v[0]}</span>{v[1:]}</p>')
        elif kind == 'p':       out.append(f'<p>{v}</p>')
        elif kind == 'divider': out.append(f'<div class="flower-divider"><img src="{IMG}/{v}"></div>')
        elif kind == 'figure':  out.append(f'<figure><img src="{IMG}/{v[0]}"><figcaption>{v[2]}</figcaption></figure>')
        elif kind == 'moral':   out.append(f'<div class="moral-box"><span class="label">{v[0]}</span><p>{v[1]}</p></div>')
        elif kind == 'discussion':
            li = ''.join(f'<li>{x}</li>' for x in v[1])
            out.append(f'<div class="moral-box"><span class="label">{v[0]}</span><ul>{li}</ul></div>')
        elif kind == 'note':    out.append(f'<p class="note">{v}</p>')
        elif kind == 'closing': out.append(f'<p class="closing">{v}</p>')

    eyebrow = f"{CATNAME[d['category']]} Νο. {d['number']:02d} · Διάρκεια ανάγνωσης ≈ {d['readingTime']} λεπτά"
    doc = f"""<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"></head><body>
<div class="cover">
  <p class="eyebrow">{eyebrow}</p>
  <img src="{IMG}/{d['image']}">
  <h1>{d.get('titleHtml') or d['title']}</h1>
  {f'<p class="origin">{d["origin"]}</p>' if d.get('origin') else ''}
  <p class="tagline">{d['tagline']}</p>
  {f'<p class="credit">{d["credit"]}</p>' if d.get('credit') else ''}
  <div class="spacer"></div>
  <p class="brand">Παραμυθούπολη · paramythoupoli.gr</p>
</div>
<div class="content">
{chr(10).join(out)}
</div>
</body></html>"""
    HTML(string=doc, base_url=SRC).write_pdf(f'{OUT}/{d["slug"]}.pdf', stylesheets=[CSS(string=PDF_CSS)])

# ──────────────────────────── 3. EPUB ────────────────────────────

EPUB_CSS = """
body{ font-family: serif; line-height:1.7; color:#2a2018; }
h1{ color:#8a3e3e; font-size:1.5em; }
h2{ color:#8a3e3e; font-size:1.2em; margin-top:1.6em; }
.eyebrow{ font-size:0.8em; letter-spacing:0.06em; text-transform:uppercase; color:#e3a248; }
.origin{ font-style:italic; color:#8a3e3e; }
.tagline{ color:#555; }
.credit{ font-style:italic; color:#8a3e3e; font-size:0.85em; margin-top:0.3em; }
p{ text-align: justify; margin: 0 0 1em; }
figure{ text-align:center; margin: 1.4em 0; }
figure img{ max-width: 92%; border-radius: 6px; }
figcaption{ font-size:0.8em; font-style:italic; color:#777; }
.moral-box{ background:#f4ecdc; border-left:4px solid #8a3e3e; padding: 0.9em 1.2em; margin: 1.6em 0; }
.moral-label{ display:block; font-size:0.78em; text-transform:uppercase; letter-spacing:0.06em; color:#8a3e3e; margin-bottom:0.4em; }
.moral-box p{ font-style:italic; margin:0; }
.moral-box ul{ margin:0; padding-left:1.1em; }
.moral-box li{ font-style:italic; margin-bottom:0.5em; }
.flower-divider{ text-align:center; margin:1.6em 0; }
.flower-divider img{ width:70px; height:70px; border-radius:50%; }
.note{ font-size:0.85em; font-style:italic; color:#6a6258; }
.closing{ text-align:center; font-style:italic; font-size:0.85em; color:#777; margin-top:2em; }
"""

def build_epub(d):
    bs = assemble(d)
    book = epub.EpubBook()
    book.set_identifier(f'paramythoupoli-{d["slug"]}')
    book.set_title(d['title'])
    book.set_language('el')
    book.add_author(d.get('author') or 'Παραμυθούπολη')
    book.set_cover('images/cover.jpg', open(f'{IMG}/{d["image"]}', 'rb').read())

    css = epub.EpubItem(uid='style', file_name='style/style.css',
                        media_type='text/css', content=EPUB_CSS)
    book.add_item(css)

    imap, i = {}, 0
    for kind, v in bs:
        src = v if kind == 'divider' else (v[0] if kind == 'figure' else None)
        if src and src not in imap:
            i += 1
            fn = f'images/img{i}.jpg'
            book.add_item(epub.EpubItem(uid=f'im{i}', file_name=fn, media_type='image/jpeg',
                                        content=open(f'{IMG}/{src}', 'rb').read()))
            imap[src] = fn

    out = []
    for kind, v in bs:
        if kind == 'h2':        out.append(f'<h2>{v}</h2>')
        elif kind == 'dropcap': out.append(f'<p class="dropcap"><span class="dropcap-letter">{v[0]}</span>{v[1:]}</p>')
        elif kind == 'p':       out.append(f'<p>{v}</p>')
        elif kind == 'divider': out.append(f'<div class="flower-divider"><img src="{imap[v]}"/></div>')
        elif kind == 'figure':  out.append(f'<figure class="inline-figure"><img src="{imap[v[0]]}"/><figcaption>{v[2]}</figcaption></figure>')
        elif kind == 'moral':   out.append(f'<div class="moral-box"><span class="moral-label">{v[0]}</span><p>{v[1]}</p></div>')
        elif kind == 'discussion':
            li = ''.join(f'<li>{x}</li>' for x in v[1])
            out.append(f'<div class="moral-box"><span class="moral-label">{v[0]}</span><ul>{li}</ul></div>')
        elif kind == 'note':    out.append(f'<p class="note">{v}</p>')
        elif kind == 'closing': out.append(f'<p class="closing">{v}</p>')

    eyebrow = f"{CATNAME[d['category']]} Νο. {d['number']:02d} · Διάρκεια ανάγνωσης ≈ {d['readingTime']} λεπτά"
    ch = epub.EpubHtml(title=d['title'], file_name='chapter.xhtml', lang='el')
    ch.add_item(css)
    ch.content = (f'<span class="eyebrow">{eyebrow}</span>\n<h1>{d["title"]}</h1>\n'
                  + (f'<p class="origin">{d["origin"]}</p>\n' if d.get('origin') else '')
                  + f'<p class="tagline">{d["tagline"]}</p>\n'
                  + (f'<p class="credit">{d["credit"]}</p>\n' if d.get('credit') else '')
                  + '\n'.join(out))
    book.add_item(ch)
    book.toc = (ch,)
    book.add_item(epub.EpubNcx())
    nav = epub.EpubNav(); nav.add_item(css); book.add_item(nav)
    book.spine = ['nav', ch]
    epub.write_epub(f'{OUT}/{d["slug"]}.epub', book)

# ──────────────────────────── ΕΚΤΕΛΕΣΗ ────────────────────────────

if __name__ == '__main__':
    n = build_images()
    if n: print(f'  → {n} αρχεία εικόνας')

    paths = sorted(glob.glob(os.path.join(SRC, 'stories', '*.md')))
    if len(sys.argv) > 1:
        want = set(sys.argv[1:])
        paths = [p for p in paths if os.path.basename(p)[:-3] in want]

    for p in paths:
        d = read_story(p)
        build_pdf(d)
        build_epub(d)
        print(f'  📄 {d["slug"]}.pdf + .epub')
    print(f'\n{len(paths)} ιστορίες.')
