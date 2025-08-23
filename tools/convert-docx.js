// tools/convert-docx.js
const mammoth = require("mammoth");
const fse = require("fs-extra");
const glob = require("glob");
const path = require("path");
const slugify = require("slugify");

const RAW_DIR = "content/raw";
const OUT_HTML_DIR = "content/articles";
const OUT_IMG_DIR = "assets/articles";
const INDEX_JSON = "data/articles.json";

(async () => {
  await fse.ensureDir(OUT_HTML_DIR);
  await fse.ensureDir(OUT_IMG_DIR);
  await fse.ensureDir(path.dirname(INDEX_JSON));

  const files = glob.sync(`${RAW_DIR}/*.docx`);
  const index = [];

  for (const file of files) {
    const base = path.basename(file, ".docx");
    const slug = slugify(base, { lower: true, strict: true });

    const imgFolder = path.join(OUT_IMG_DIR, slug);
    await fse.ensureDir(imgFolder);

    // Ekstrak HTML + gambar
    const { value: html, messages } = await mammoth.convertToHtml(
      { path: file },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          // tambahkan mapping style lain jika Word-mu pakai style khusus
        ],
        convertImage: mammoth.images.inline(async (element) => {
          const ext = element.contentType.split("/")[1] || "png";
          const name = `img-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}.${ext}`;
          const buffer = await element.read();
          await fse.writeFile(path.join(imgFolder, name), buffer);
          return { src: `/${imgFolder}/${name}`.replace(/\\/g, "/") };
        }),
      }
    );

    // Ambil judul (H1 pertama) atau fallback ke nama file
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "") : base;

    // Simpan HTML “bersih” dibungkus <article>
    const wrapped = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body>
<article class="prose max-w-3xl mx-auto px-4 py-8">${html}</article>
</body></html>`;

    const outHtmlPath = path.join(OUT_HTML_DIR, `${slug}.html`);
    await fse.writeFile(outHtmlPath, wrapped, "utf8");

    // Buat ringkasannya untuk list/search
    const plain = html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const excerpt = plain.slice(0, 180) + (plain.length > 180 ? "…" : "");

    index.push({
      title,
      slug,
      url: `/content/articles/${slug}.html`,
      cover: null, // bisa kamu isi manual kalau mau (lihat Catatan Gambar di bawah)
      excerpt,
    });

    // Optional: log pesan konversi (style yang tidak dikenali, dsb.)
    messages.forEach((m) => console.log(`[mammoth] ${m.type}: ${m.message}`));
  }

  await fse.writeJson(INDEX_JSON, index, { spaces: 2 });
  console.log(
    `Selesai. HTML di /${OUT_HTML_DIR}, gambar di /${OUT_IMG_DIR}, index di /${INDEX_JSON}`
  );
})();
