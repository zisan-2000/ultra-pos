// lib/exports/pdf-export.ts
//
// Professional PDF exporter for the reports section.
//
// Strategy: we render the report as a real styled HTML element off-screen,
// then rasterise it with html2canvas and embed the resulting image into a
// multi-page A4 jsPDF document. This gives us perfect Bengali typography
// (the browser does the shaping with system fonts) while still producing a
// downloadable .pdf file.
//
// Trade-off: text is rasterised (not selectable in the PDF). For the typical
// shopkeeper / accountant flow this is acceptable — they print or archive
// the file, they rarely copy-paste from it.

import type { ExportColumn, ExportDataset, ExportMeta } from "./types";

// A4 at 96 DPI ≈ 794 × 1123 px. We render to a generous internal width and
// rely on PDF page scaling for a sharper image.
const PAGE_WIDTH_PX = 794;
const PAGE_PADDING_PX = 36;
const SCALE = 2; // 2× super-sampling for crisp text

// ── HTML template builders ───────────────────────────────────────

function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCellValue(value: unknown, kind?: ExportColumn["kind"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "money") {
    const num = Number(value);
    if (!Number.isFinite(num)) return escapeHtml(value);
    return `৳ ${num.toLocaleString("bn-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (kind === "number") {
    const num = Number(value);
    if (!Number.isFinite(num)) return escapeHtml(value);
    return num.toLocaleString("bn-BD");
  }
  if (kind === "datetime") {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return escapeHtml(value);
    return d.toLocaleString("bn-BD", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (kind === "date") {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return escapeHtml(value);
    return d.toLocaleDateString("bn-BD", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return escapeHtml(value);
}

// Monochrome KPI palette — every card uses the same neutral background; the
// label tone is conveyed by typography (size/weight) and accent rule, not
// colour. This is the classic accounting-report look (Stripe, KPMG, audit
// statements) and prints cleanly on B&W printers.
function toneHex(_tone?: string) {
  return {
    fg: "#0f172a", // slate-900 — primary text
    bg: "#f8fafc", // slate-50 — card surface
    border: "#cbd5e1", // slate-300 — subtle outline
    rule: "#0f172a", // slate-900 — left accent rule (always dark)
  };
}

function renderDatasetSection(dataset: ExportDataset, meta: ExportMeta) {
  const kpisHtml = dataset.kpis && dataset.kpis.length > 0
    ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 16px 0;">
        ${dataset.kpis
          .map((k) => {
            const t = toneHex(k.tone);
            return `
              <div style="background:${t.bg};border:1px solid ${t.border};border-left:3px solid ${t.rule};border-radius:6px;padding:10px 12px;">
                <p style="margin:0;font-size:9px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(k.label)}</p>
                <p style="margin:4px 0 0 0;font-size:16px;font-weight:700;color:${t.fg};">${escapeHtml(k.value)}</p>
              </div>
            `;
          })
          .join("")}
      </div>
    `
    : "";

  const columns = dataset.columns;
  const headerCells = columns
    .map(
      (c) => `
        <th style="
          background:#1f2937;
          color:#fff;
          font-size:10px;
          font-weight:700;
          text-align:${c.kind === "money" || c.kind === "number" ? "right" : "left"};
          padding:8px 10px;
          border-bottom:2px solid #0f172a;
          letter-spacing:0.02em;
        ">${escapeHtml(c.header)}</th>
      `
    )
    .join("");

  const bodyRows =
    dataset.rows.length === 0
      ? `
        <tr>
          <td colspan="${columns.length}" style="
            padding:24px;
            text-align:center;
            color:#94a3b8;
            font-size:11px;
            font-style:italic;
          ">এই সময়ে কোনো ডাটা নেই</td>
        </tr>
      `
      : dataset.rows
          .map((row, idx) => {
            const cells = columns
              .map((c) => {
                const raw = c.getValue ? c.getValue(row) : row[c.key];
                const formatted = formatCellValue(raw, c.kind);
                const align =
                  c.kind === "money" || c.kind === "number" ? "right" : "left";
                return `
                  <td style="
                    padding:6px 10px;
                    font-size:10.5px;
                    text-align:${align};
                    border-bottom:1px solid #f1f5f9;
                    color:#0f172a;
                    ${align === "right" ? "font-variant-numeric:tabular-nums;" : ""}
                  ">${formatted}</td>
                `;
              })
              .join("");
            const bg = idx % 2 === 1 ? "#f8fafc" : "#ffffff";
            return `<tr style="background:${bg};">${cells}</tr>`;
          })
          .join("");

  const totalRowHtml = dataset.totalRow
    ? `
      <tr style="background:#f1f5f9;">
        ${columns
          .map((c, idx) => {
            const raw = dataset.totalRow?.[c.key];
            const formatted =
              raw !== undefined && raw !== null && raw !== ""
                ? formatCellValue(raw, c.kind)
                : idx === 0
                  ? "মোট"
                  : "";
            const align =
              c.kind === "money" || c.kind === "number" ? "right" : "left";
            return `
              <td style="
                padding:8px 10px;
                font-size:11px;
                font-weight:700;
                text-align:${align};
                border-top:2px solid #0f172a;
                color:#0f172a;
              ">${formatted}</td>
            `;
          })
          .join("")}
      </tr>
    `
    : "";

  return `
    <section style="margin:0 0 24px 0;page-break-inside:auto;">
      <header style="margin:0 0 12px 0;">
        <h2 style="margin:0;font-size:18px;color:#0f172a;font-weight:800;">${escapeHtml(dataset.title)}</h2>
        ${
          dataset.subtitle
            ? `<p style="margin:4px 0 0 0;font-size:11px;color:#64748b;">${escapeHtml(dataset.subtitle)}</p>`
            : ""
        }
      </header>
      ${kpisHtml}
      <table style="
        width:100%;
        border-collapse:collapse;
        border:1px solid #e2e8f0;
        border-radius:8px;
        overflow:hidden;
        font-family:'Hind Siliguri','Noto Sans Bengali','Segoe UI',system-ui,sans-serif;
      ">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}${totalRowHtml}</tbody>
      </table>
    </section>
  `;
}

function renderDocument(datasets: ExportDataset[], meta: ExportMeta) {
  const generatedAtStr = meta.generatedAt.toLocaleString("bn-BD", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const sectionsHtml = datasets
    .map((d, i) => {
      const breakClass =
        i > 0 ? "style=\"break-before:page;page-break-before:always;\"" : "";
      return `<div ${breakClass}>${renderDatasetSection(d, meta)}</div>`;
    })
    .join("");

  return `
    <div style="
      width:${PAGE_WIDTH_PX - PAGE_PADDING_PX * 2}px;
      padding:${PAGE_PADDING_PX}px;
      background:#ffffff;
      font-family:'Hind Siliguri','Noto Sans Bengali','Segoe UI',system-ui,sans-serif;
      color:#0f172a;
      box-sizing:content-box;
    ">
      <header style="
        display:flex;
        justify-content:space-between;
        align-items:flex-end;
        gap:16px;
        margin:0 0 20px 0;
        padding:0 0 16px 0;
        border-bottom:2px solid #0f172a;
      ">
        <div>
          <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.18em;font-weight:600;">
            রিপোর্ট
          </p>
          <h1 style="margin:6px 0 0 0;font-size:24px;font-weight:800;color:#0f172a;">${escapeHtml(meta.shopName)}</h1>
          <p style="margin:4px 0 0 0;font-size:12px;color:#475569;">
            সময়: <strong style="color:#0f172a;">${escapeHtml(meta.rangeLabel ?? "সব সময়")}</strong>
          </p>
        </div>
        <div style="text-align:right;">
          <p style="margin:0;font-size:10px;color:#94a3b8;">তৈরি হয়েছে</p>
          <p style="margin:4px 0 0 0;font-size:11px;color:#0f172a;font-weight:600;">${escapeHtml(generatedAtStr)}</p>
        </div>
      </header>

      ${sectionsHtml}

      <footer style="margin:24px 0 0 0;padding:12px 0 0 0;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;">
          এই রিপোর্ট স্বয়ংক্রিয়ভাবে তৈরি — ${escapeHtml(meta.shopName)}
        </p>
      </footer>
    </div>
  `;
}

// ── PDF generator ────────────────────────────────────────────────

async function captureAndDownload(html: string, filename: string) {
  const [{ default: html2canvas }, jspdfModule] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const JsPDF = jspdfModule.jsPDF;

  // Mount off-screen container with the report HTML.
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.zIndex = "-1";
  container.style.background = "#ffffff";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // Allow webfont/layout to settle before snapshot.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const target = container.firstElementChild as HTMLElement | null;
    if (!target) {
      throw new Error("PDF render target missing");
    }

    const canvas = await html2canvas(target, {
      scale: SCALE,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: PAGE_WIDTH_PX,
    });

    // jsPDF in A4 portrait, with measurements in points.
    const pdf = new JsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true,
    });

    const pageWidthPt = pdf.internal.pageSize.getWidth();
    const pageHeightPt = pdf.internal.pageSize.getHeight();

    // Compute image rendering dimensions so the canvas fits page width.
    const imgWidthPt = pageWidthPt;
    const imgHeightPt = (canvas.height * imgWidthPt) / canvas.width;

    if (imgHeightPt <= pageHeightPt) {
      // Single page — embed directly.
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(dataUrl, "JPEG", 0, 0, imgWidthPt, imgHeightPt, undefined, "FAST");
    } else {
      // Multi-page — slice the canvas into page-height strips.
      const sliceCanvas = document.createElement("canvas");
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");

      const sliceHeightPx = Math.floor((pageHeightPt * canvas.width) / pageWidthPt);
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;

      let yOffsetPx = 0;
      let pageIndex = 0;
      while (yOffsetPx < canvas.height) {
        const remaining = canvas.height - yOffsetPx;
        const currentSliceHeight = Math.min(sliceHeightPx, remaining);
        sliceCanvas.height = currentSliceHeight;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, sliceCanvas.width, currentSliceHeight);
        ctx.drawImage(
          canvas,
          0,
          yOffsetPx,
          canvas.width,
          currentSliceHeight,
          0,
          0,
          canvas.width,
          currentSliceHeight
        );
        const sliceImgHeightPt = (currentSliceHeight * imgWidthPt) / canvas.width;
        const dataUrl = sliceCanvas.toDataURL("image/jpeg", 0.92);
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(
          dataUrl,
          "JPEG",
          0,
          0,
          imgWidthPt,
          sliceImgHeightPt,
          undefined,
          "FAST"
        );

        // Footer with page number
        const totalPagesPlaceholder = "{total_pages}";
        const pageLabel = `পৃষ্ঠা ${pageIndex + 1}`;
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text(pageLabel, pageWidthPt / 2, pageHeightPt - 12, { align: "center" });
        // We don't write totalPagesPlaceholder for now — single-pass count
        void totalPagesPlaceholder;

        yOffsetPx += currentSliceHeight;
        pageIndex++;
      }
    }

    pdf.save(filename);
  } finally {
    container.remove();
  }
}

/** Export a single dataset to a downloadable PDF. */
export async function exportDatasetToPdf(
  dataset: ExportDataset,
  meta: ExportMeta,
  filename: string
): Promise<{ filename: string; rows: number }> {
  const html = renderDocument([dataset], meta);
  await captureAndDownload(html, filename);
  return { filename, rows: dataset.rows.length };
}

/** Export many datasets concatenated (one report per section) to a single PDF. */
export async function exportDatasetsToPdf(
  datasets: ExportDataset[],
  meta: ExportMeta,
  filename: string
): Promise<{ filename: string; rows: number }> {
  const html = renderDocument(datasets, meta);
  await captureAndDownload(html, filename);
  const total = datasets.reduce((s, d) => s + d.rows.length, 0);
  return { filename, rows: total };
}
