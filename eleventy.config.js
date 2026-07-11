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
  md.renderer.rules.hr = (t, i, o, env) => divider(env.image);

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

  // ---------- related: ρητά ή αυτόματα, χωρίς ορφανές ----------
  eleventyConfig.addCollection("related", (api) => {
    const all = api
      .getFilteredByGlob("src/stories/*.md")
      .sort((a, b) => a.data.number - b.data.number);
    const bySlug = Object.fromEntries(all.map((s) => [slugOf(s), s]));
    const byCat = {};
    all.forEach((s) => (byCat[s.data.category] ||= []).push(s));

    const map = {};
    for (const s of all) {
      const me = slugOf(s);
      if (Array.isArray(s.data.related) && s.data.related.length) {
        map[me] = s.data.related.filter((r) => bySlug[r] && r !== me).slice(0, 2);
        continue;
      }
      // αυτόματο: κυκλικά μέσα στην κατηγορία (εγγυάται εισερχόμενες συνδέσεις)
      const cat = byCat[s.data.category];
      const i = cat.indexOf(s);
      const picks = [];
      for (let k = 1; k <= cat.length && picks.length < 2; k++) {
        const c = slugOf(cat[(i + k) % cat.length]);
        if (c !== me && !picks.includes(c)) picks.push(c);
      }
      // αν η κατηγορία είναι πολύ μικρή, συμπλήρωση από το σύνολο
      const gi = all.indexOf(s);
      for (let k = 1; k <= all.length && picks.length < 2; k++) {
        const c = slugOf(all[(gi + k) % all.length]);
        if (c !== me && !picks.includes(c)) picks.push(c);
      }
      map[me] = picks;
    }

    // ---- ΕΛΕΓΧΟΣ: καμία ορφανή ----
    const inbound = Object.fromEntries(all.map((s) => [slugOf(s), 0]));
    Object.values(map).flat().forEach((r) => inbound[r]++);
    const orphans = Object.entries(inbound)
      .filter(([, n]) => n === 0)
      .map(([s]) => s);
    if (orphans.length) {
      throw new Error(
        `ΟΡΦΑΝΕΣ ΙΣΤΟΡΙΕΣ (καμία εισερχόμενη σύνδεση): ${orphans.join(", ")}\n` +
          `Πρόσθεσέ τες στο «related» κάποιας άλλης ιστορίας, ή άφησε το πεδίο κενό για αυτόματη σύνδεση.`
      );
    }
    return map;
  });

  // ---------- φίλτρα ----------
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

function slugOf(item) {
  return item.page.fileSlug;
}
function ext(f, e) {
  return f.replace(/\.[a-z]+$/i, "." + e);
}
function small(f, e) {
  return f.replace(/\.[a-z]+$/i, "-small." + e);
}
