import markdownIt from "markdown-it";

export default function (eleventyConfig) {
  // ---------- assets ----------
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  eleventyConfig.addPassthroughCopy({ admin: "admin" });

  // ---------- markdown ----------
  const md = markdownIt({ html: true, typographer: false, breaks: false });

  // Το `---` (οριζόντια γραμμή) γίνεται λουλούδι-διαχωριστής με την εικόνα του εξωφύλλου.
  const divider = (im) =>
    `<div class="flower-divider">\n      <div class="stem"></div>\n` +
    `      <img src="../assets/img/${im}" alt="" loading="lazy">\n` +
    `      <div class="stem"></div>\n    </div>`;
  md.renderer.rules.hr = (t, i, o, env) => divider(imgFile(env.image));

  // Η πρώτη παράγραφος του σώματος παίρνει dropcap — αυτόματα.
  md.renderer.rules.paragraph_open = (tokens, i, opts, env) => {
    // παράγραφος που περιέχει μόνο εικόνα → χωρίς <p>
    const inline = tokens[i + 1];
    if (inline && inline.type === "inline" && inline.children.length === 1 &&
        inline.children[0].type === "image") return "";
    if (!env._firstPara) { env._firstPara = true; return '<p class="dropcap">'; }
    return "<p>";
  };
  md.renderer.rules.paragraph_close = (tokens, i, opts, env) => {
    const inline = tokens[i - 1];
    if (inline && inline.type === "inline" && inline.children.length === 1 &&
        inline.children[0].type === "image") return "";
    return "</p>";
  };

  // Εικόνα: alt = ΛΟΥΛΟΥΔΙ → διαχωριστής με άλλη εικόνα· αλλιώς inline-figure.
  // Σύνταξη: ![alt](/assets/img/x.jpg "λεζάντα")
  md.renderer.rules.image = (tokens, i, opts, env) => {
    const t = tokens[i];
    const src = t.attrGet("src").replace(/^\/assets\/img\//, "");
    const alt = t.content || "";
    const cap = t.attrGet("title") || "";
    if (alt === "ΛΟΥΛΟΥΔΙ") return divider(src);
    return (
      `<figure class="inline-figure">\n      <div class="cover-img"><picture>` +
      `<source media="(max-width: 600px)" srcset="../assets/img/${small(src, "webp")}" type="image/webp">` +
      `<source media="(max-width: 600px)" srcset="../assets/img/${small(src, "jpg")}" type="image/jpeg">` +
      `<source srcset="../assets/img/${ext(src, "webp")}" type="image/webp">` +
      `<img src="../assets/img/${src}" alt="${alt.replace(/"/g, "&quot;")}" loading="lazy">` +
      `</picture></div>` +
      (cap ? `\n      <figcaption>${cap}</figcaption>` : "") +
      `\n    </figure>`
    );
  };

  eleventyConfig.setLibrary("md", md);

  // Το σώμα της ιστορίας: render με το slug της εικόνας στο περιβάλλον
  eleventyConfig.addFilter("storyBody", function (content, image) {
    return md.render(content, { image, _firstPara: false });
  });

  // ---------- συλλογές ----------
  eleventyConfig.addCollection("stories", (api) =>
    api.getFilteredByGlob("src/stories/*.md").sort((a, b) => a.data.number - b.data.number)
  );

  eleventyConfig.addCollection("byCategory", (api) => {
    const out = {};
    api
      .getFilteredByGlob("src/stories/*.md")
      .sort((a, b) => a.data.number - b.data.number)
      .forEach((s) => {
        (out[s.data.category] ||= []).push(s);
      });
    return out;
  });

  // ---------- «Διάβασε επίσης» ----------
  //
  //   Κάρτα 1  →  ιστορία της ΙΔΙΑΣ κατηγορίας   (θεματική συνέχεια)
  //   Κάρτα 2  →  η ΑΜΕΣΩΣ ΠΡΟΗΓΟΥΜΕΝΗ ιστορία   (Νο. N-1)
  //
  // Η κάρτα 2 φτιάχνει νήμα μέσα στη συλλογή: κάθε ιστορία δείχνει στην προηγούμενη,
  // άρα κάθε ιστορία αποκτά εισερχόμενη σύνδεση από τη διάδοχό της — αυτόματα,
  // χωρίς να ξαναγραφτεί ποτέ καμία σελίδα. Στο 90% οδηγεί σε ΑΛΛΗ κατηγορία.
  // Μόνο η νεότερη μένει προσωρινά χωρίς — μέχρι να γράψεις την επόμενη.
  //
  // Και οι δύο κάρτες κοιτούν ΜΟΝΟ ιστορίες που υπήρχαν ήδη (μικρότερο αριθμό):
  // έτσι το «Διάβασε επίσης» μιας ιστορίας ΔΕΝ αλλάζει ποτέ.
  //
  // Αν συμπληρώσεις το πεδίο «Διάβασε επίσης», η επιλογή σου υπερισχύει απόλυτα.
  // Καμία υπάρχουσα σελίδα δεν ξαναγράφεται ποτέ αυτόματα.
  eleventyConfig.addCollection("related", (api) => {
    const all = api
      .getFilteredByGlob("src/stories/*.md")
      .sort((a, b) => a.data.number - b.data.number);
    const bySlug = Object.fromEntries(all.map((s) => [slugOf(s), s]));

    const map = {};
    for (const s of all) {
      const me = slugOf(s);
      const chosen = (s.data.related || []).filter((r) => bySlug[r] && r !== me);
      if (chosen.length >= 2) { map[me] = chosen.slice(0, 2); continue; }

      const n = s.data.number;
      const cat = s.data.category;
      const past = all.filter((x) => x.data.number < n && slugOf(x) !== me);
      const same = past.filter((x) => x.data.category === cat).map(slugOf);
      const other = past.filter((x) => x.data.category !== cat).map(slugOf);

      const picks = [...chosen];
      const add = (c) => { if (c && !picks.includes(c)) picks.push(c); };

      if (same.length) add(same[n % same.length]);            // κάρτα 1: ίδια κατηγορία
      if (past.length) add(slugOf(past[past.length - 1]));    // κάρτα 2: η προηγούμενη ιστορία
      // εφεδρείες: πρώτη της κατηγορίας ή πρώτη του site
      let k = 0;
      while (picks.length < 2 && other.length) add(other[(n * 7 + k++) % other.length]);
      for (let j = 0; picks.length < 2 && j < all.length; j++) {
        const c = slugOf(all[j]);
        if (c !== me) add(c);
      }
      map[me] = picks.slice(0, 2);
    }

    // Ενημερωτικά μόνο — καμία αλλαγή, καμία αποτυχία.
    const inb = Object.fromEntries(all.map((s) => [slugOf(s), 0]));
    Object.values(map).flat().forEach((r) => inb[r]++);
    const none = Object.entries(inb).filter(([, c]) => c === 0).map(([s]) => s);
    if (none.length) {
      console.log(
        "[Παραμυθούπολη] Χωρίς «Διάβασε επίσης» προς αυτές (φυσιολογικό για τη νεότερη· " +
        "βρίσκονται κανονικά από την αρχική και τη σελίδα της κατηγορίας τους): " + none.join(", ")
      );
    }
    return map;
  });

  // ---------- φίλτρα ----------
  // Το CMS γράφει "/assets/img/x.jpg" — τα templates θέλουν "x.jpg"
  // Αν λείπει ο «Τίτλος με αλλαγή γραμμής», τον προτείνει το build.
  eleventyConfig.addFilter("autoBreak", autoBreak);
  eleventyConfig.addFilter("imgFile", imgFile);
  eleventyConfig.addFilter("slugOf", slugOf);
  eleventyConfig.addFilter("small", (f, e) => small(f, e));
  eleventyConfig.addFilter("ext", (f, e) => ext(f, e));
  eleventyConfig.addFilter("values", (o) => Object.values(o || {}));
  eleventyConfig.addFilter("esc", (v) =>
    String(v ?? "")
      .replace(/&(?![a-z#0-9]+;)/gi, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
  eleventyConfig.addFilter("isoDate", (d) => {
    if (typeof d === "string") return d.slice(0, 10);
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
  });
  eleventyConfig.addFilter("pad2", (n) => String(n).padStart(2, "0"));
  eleventyConfig.addFilter("jsonEsc", (s) =>
    String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")
  );
  eleventyConfig.addFilter("find", (arr, slug) =>
    arr.find((s) => slugOf(s) === slug)
  );

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}

const CONNECT = new Set(["και","κι","στο","στη","στην","στον","στα","στις","στους",
  "του","της","των","με","από","που","για","ο","η","το","τα","οι","ένα","έναν","μια"]);

function autoBreak(title) {
  const w = String(title || "").split(/\s+/).filter(Boolean);
  if (w.length < 3) return title;
  let best = null, score = Infinity;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i).join(" "), b = w.slice(i).join(" ");
    let s = Math.abs(a.length - b.length);
    if (CONNECT.has(w[i].toLowerCase())) s -= 6;
    if (CONNECT.has(w[i - 1].toLowerCase())) s -= 3;
    if (s < score) { score = s; best = [a, b]; }
  }
  return `${best[0]}<br>${best[1]}`;
}

function imgFile(f) {
  return String(f || "").replace(/^.*\/assets\/img\//, "");
}
function slugOf(item) {
  return item.page.fileSlug;
}
function ext(f, e) {
  return imgFile(f).replace(/\.[a-z]+$/i, "." + e);
}
function small(f, e) {
  return imgFile(f).replace(/\.[a-z]+$/i, "-small." + e);
}
