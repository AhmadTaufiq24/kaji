type PdfSection = {
  key: string;
  title: string;
  score: number | null;
  body: string;
};

type PdfSource = {
  title: string | null;
  url: string;
};

type TextRun = {
  text: string;
  font: "regular" | "bold";
  size: number;
};

type TextBlock =
  | { kind: "gap"; height: number }
  | { kind: "rule" }
  | { kind: "lines"; leading: number; runs: TextRun[] };

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/×/g, "x")
    .replace(/≈/g, "~")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0A\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function escapePdfText(value: string) {
  return normalizeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapRun(text: string, widthChars: number) {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > widthChars) {
      if (current) lines.push(current);
      if (word.length > widthChars) {
        for (let i = 0; i < word.length; i += widthChars) {
          lines.push(word.slice(i, i + widthChars));
        }
        current = "";
      } else {
        current = word;
      }
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function approxWidth(size: number) {
  // Helvetica average glyph width ≈ 0.5em; page content ~499pt → chars.
  return Math.max(28, Math.floor(499 / (size * 0.5)));
}

function pushParagraph(
  blocks: TextBlock[],
  text: string,
  opts: { font?: "regular" | "bold"; size?: number; leading?: number } = {},
) {
  const font = opts.font ?? "regular";
  const size = opts.size ?? 10;
  const leading = opts.leading ?? size + 3;
  const width = approxWidth(size);
  for (const line of wrapRun(text, width)) {
    blocks.push({
      kind: "lines",
      leading,
      runs: [{ text: line, font, size }],
    });
  }
}

function blockHeight(block: TextBlock) {
  if (block.kind === "gap") return block.height;
  if (block.kind === "rule") return 10;
  return block.leading;
}

function buildBlocks(input: {
  title: string;
  verdict: string | null;
  score: number | null;
  costUsd: number | null;
  ideaText: string;
  sections: PdfSection[];
  sources: PdfSource[];
  generatedAt?: string | null;
}): TextBlock[] {
  const blocks: TextBlock[] = [];

  pushParagraph(blocks, "KAJI", { font: "bold", size: 11, leading: 14 });
  pushParagraph(blocks, "Laporan validasi ide startup", {
    font: "regular",
    size: 9,
    leading: 12,
  });
  blocks.push({ kind: "gap", height: 8 });
  blocks.push({ kind: "rule" });
  blocks.push({ kind: "gap", height: 12 });

  pushParagraph(blocks, input.title, { font: "bold", size: 16, leading: 20 });
  blocks.push({ kind: "gap", height: 6 });

  const meta = [
    input.verdict ? `Verdict: ${input.verdict}` : null,
    input.score != null ? `Skor: ${input.score}/100` : null,
    input.costUsd != null ? `Biaya estimasi: $${input.costUsd.toFixed(4)}` : null,
    input.generatedAt ? `Dibuat: ${input.generatedAt}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");
  if (meta) {
    pushParagraph(blocks, meta, { font: "bold", size: 10, leading: 13 });
  }

  blocks.push({ kind: "gap", height: 10 });
  pushParagraph(blocks, "Ide", { font: "bold", size: 11, leading: 14 });
  blocks.push({ kind: "gap", height: 2 });
  for (const paragraph of input.ideaText.split(/\n+/)) {
    pushParagraph(blocks, paragraph, { size: 10, leading: 13 });
    blocks.push({ kind: "gap", height: 4 });
  }

  for (const section of input.sections) {
    blocks.push({ kind: "gap", height: 8 });
    blocks.push({ kind: "rule" });
    blocks.push({ kind: "gap", height: 10 });
    const score =
      section.score != null ? `  ·  skor ${section.score}/100` : "";
    pushParagraph(blocks, `${section.title}${score}`, {
      font: "bold",
      size: 12,
      leading: 16,
    });
    blocks.push({ kind: "gap", height: 6 });
    for (const paragraph of section.body.split(/\n+/).filter(Boolean)) {
      pushParagraph(blocks, paragraph.replace(/^#+\s*/, ""), {
        size: 10,
        leading: 13,
      });
      blocks.push({ kind: "gap", height: 5 });
    }
  }

  if (input.sources.length) {
    blocks.push({ kind: "gap", height: 10 });
    blocks.push({ kind: "rule" });
    blocks.push({ kind: "gap", height: 10 });
    pushParagraph(blocks, "Sumber", { font: "bold", size: 12, leading: 16 });
    blocks.push({ kind: "gap", height: 6 });
    input.sources.forEach((source, index) => {
      pushParagraph(
        blocks,
        `[${index + 1}] ${source.title || source.url}`,
        { font: "bold", size: 9, leading: 12 },
      );
      pushParagraph(blocks, source.url, { size: 8, leading: 11 });
      blocks.push({ kind: "gap", height: 4 });
    });
  }

  blocks.push({ kind: "gap", height: 16 });
  pushParagraph(
    blocks,
    "Kaji dulu, baru bangun. AI mencari bukti; founder yang memutuskan.",
    { size: 8, leading: 10 },
  );

  return blocks;
}

function paginate(blocks: TextBlock[], pageInnerHeight: number) {
  const pages: TextBlock[][] = [];
  let current: TextBlock[] = [];
  let used = 0;

  const flush = () => {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  };

  for (const block of blocks) {
    const height = blockHeight(block);
    if (used + height > pageInnerHeight && current.length) flush();
    // Avoid starting a page with only a rule
    if (block.kind === "rule" && used === 0) continue;
    current.push(block);
    used += height;
  }
  flush();
  return pages.length ? pages : [[{ kind: "gap", height: 1 }]];
}

/** Multi-page PDF with Helvetica/Helvetica-Bold, rules, and page numbers. */
export function buildReportPdf(input: {
  title: string;
  verdict: string | null;
  score: number | null;
  costUsd: number | null;
  ideaText: string;
  sections: PdfSection[];
  sources: PdfSource[];
  generatedAt?: string | null;
}) {
  const pageHeight = 842;
  const pageWidth = 595;
  const marginX = 48;
  const marginTop = 52;
  const marginBottom = 48;
  const footerReserve = 24;
  const innerHeight = pageHeight - marginTop - marginBottom - footerReserve;

  const pages = paginate(buildBlocks(input), innerHeight);
  const objects: string[] = [];

  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontRegular = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const fontBold = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  const contentIds: number[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageBlocks = pages[pageIndex]!;
    let y = pageHeight - marginTop;
    const ops: string[] = [];

    for (const block of pageBlocks) {
      if (block.kind === "gap") {
        y -= block.height;
        continue;
      }
      if (block.kind === "rule") {
        y -= 4;
        ops.push("0.75 w");
        ops.push("0.72 0.7 0.68 RG");
        ops.push(`${marginX} ${y} m ${pageWidth - marginX} ${y} l S`);
        ops.push("0 0 0 RG");
        y -= 6;
        continue;
      }

      for (const run of block.runs) {
        const fontRef = run.font === "bold" ? fontBold : fontRegular;
        const textY = y - run.size;
        ops.push("BT");
        ops.push(`/F${run.font === "bold" ? "B" : "R"} ${run.size} Tf`);
        ops.push(`${marginX} ${textY} Td`);
        ops.push(`(${escapePdfText(run.text)}) Tj`);
        ops.push("ET");
      }
      y -= block.leading;
    }

    // Footer
    const pageLabel = `Halaman ${pageIndex + 1} dari ${pages.length}`;
    ops.push("BT");
    ops.push(`/FR 8 Tf`);
    ops.push(`${marginX} ${marginBottom - 8} Td`);
    ops.push(`(${escapePdfText(pageLabel)}) Tj`);
    ops.push("ET");
    ops.push("BT");
    ops.push(`/FR 8 Tf`);
    ops.push(`${pageWidth - marginX - 70} ${marginBottom - 8} Td`);
    ops.push(`(kaji.app) Tj`);
    ops.push("ET");

    // Silence unused fontRegular in content by referencing both via resources
    void fontRegular;
    void fontBold;

    const stream = ops.join("\n");
    contentIds.push(
      addObject(
        `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
      ),
    );
  }

  const pageIds: number[] = [];
  for (const contentId of contentIds) {
    pageIds.push(
      addObject(
        `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /FR ${fontRegular} 0 R /FB ${fontBold} 0 R >> >> >>`,
      ),
    );
  }

  const pagesId = addObject(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
  );

  for (const pageId of pageIds) {
    objects[pageId - 1] = objects[pageId - 1]!.replace(
      "/Parent 0 0 R",
      `/Parent ${pagesId} 0 R`,
    );
  }

  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const finalOffsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    finalOffsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(finalOffsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}
