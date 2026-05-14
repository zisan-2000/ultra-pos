// lib/exports/excel-export.ts
//
// Lazy-loaded Excel exporter. Each report becomes a styled worksheet with
// bold header row, Bengali column titles, auto-sized columns, accounting-style
// number formatting and an optional totals row.
//
// For the "all" mode we build a single workbook with one worksheet per report
// — far friendlier than 9 separate files.

import { downloadFile } from "@/lib/utils/download";
import type { ExportColumn, ExportDataset, ExportMeta } from "./types";

// Monochrome professional palette — black header, neutral grays only. Matches
// the B&W look of audit-style reports (Quickbooks, KPMG, bank statements).
const HEADER_FILL = "FF0F172A"; // slate-900 (effectively black)
const HEADER_FONT = "FFFFFFFF";
const SUBHEADER_FILL = "FFF1F5F9"; // slate-100 — KPI band background
const ZEBRA_FILL = "FFF8FAFC"; // slate-50 — alternate-row stripe
const TOTAL_FILL = "FFE2E8F0"; // slate-200 — totals row, distinct from zebra

const MONEY_FORMAT = '"৳ "#,##0.00;"৳ "-#,##0.00;"৳ "0';
const NUMBER_FORMAT = "#,##0";
const DATE_FORMAT = "yyyy-mm-dd hh:mm";

function sanitizeSheetName(raw: string) {
  // Excel sheet names: max 31 chars, no \ / ? * [ ]
  return raw.replace(/[\\\/\?\*\[\]:]/g, "").slice(0, 31) || "Sheet";
}

function formatForCell(value: unknown, kind?: ExportColumn["kind"]): unknown {
  if (value === null || value === undefined || value === "") return null;
  if (kind === "money" || kind === "number") {
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }
  if (kind === "datetime") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? value : d;
  }
  return value;
}

function cellFormat(kind?: ExportColumn["kind"]) {
  switch (kind) {
    case "money":
      return MONEY_FORMAT;
    case "number":
      return NUMBER_FORMAT;
    case "datetime":
    case "date":
      return DATE_FORMAT;
    default:
      return undefined;
  }
}

function applyAutoWidth(worksheet: any, columns: ExportColumn[]) {
  // exceljs needs explicit widths; we estimate from header length + first 50 rows.
  columns.forEach((col, idx) => {
    const colIdx = idx + 1;
    const cells = worksheet.getColumn(colIdx).values ?? [];
    const max = cells.reduce((m: number, v: unknown) => {
      const len = v == null ? 0 : String(v).length;
      return Math.max(m, len);
    }, col.header.length);
    worksheet.getColumn(colIdx).width = Math.min(Math.max(max + 2, 12), 48);
  });
}

async function buildSheet(
  workbook: any,
  dataset: ExportDataset,
  meta: ExportMeta
) {
  const worksheet = workbook.addWorksheet(sanitizeSheetName(dataset.title), {
    // Neutral dark-gray tab — keeps the workbook visually quiet across sheets.
    properties: { defaultRowHeight: 18, tabColor: { argb: "FF334155" } },
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // ── Title block ────────────────────────────────────────────────
  worksheet.mergeCells(1, 1, 1, dataset.columns.length);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = dataset.title;
  titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells(2, 1, 2, dataset.columns.length);
  const subtitleCell = worksheet.getCell(2, 1);
  const subtitleParts = [meta.shopName, meta.rangeLabel ?? "সব সময়"];
  if (dataset.subtitle) subtitleParts.push(dataset.subtitle);
  subtitleCell.value = subtitleParts.filter(Boolean).join("  |  ");
  subtitleCell.font = { name: "Calibri", size: 11, color: { argb: "FF64748B" }, italic: true };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(2).height = 20;

  // ── Header row ─────────────────────────────────────────────────
  const headerRow = worksheet.getRow(3);
  dataset.columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: HEADER_FONT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = {
      vertical: "middle",
      horizontal: col.kind === "money" || col.kind === "number" ? "right" : "left",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
  headerRow.height = 24;

  // ── Data rows ──────────────────────────────────────────────────
  dataset.rows.forEach((row, rowIdx) => {
    const excelRow = worksheet.getRow(rowIdx + 4);
    dataset.columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1);
      const raw = col.getValue ? col.getValue(row) : row[col.key];
      cell.value = formatForCell(raw, col.kind) ?? "";
      const fmt = cellFormat(col.kind);
      if (fmt) cell.numFmt = fmt;
      cell.alignment = {
        vertical: "middle",
        horizontal: col.kind === "money" || col.kind === "number" ? "right" : "left",
      };
      if (rowIdx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
      }
    });
  });

  // ── Total row (optional) ───────────────────────────────────────
  if (dataset.totalRow) {
    const totalRowIdx = dataset.rows.length + 4;
    const totalRow = worksheet.getRow(totalRowIdx);
    dataset.columns.forEach((col, idx) => {
      const cell = totalRow.getCell(idx + 1);
      const raw = dataset.totalRow?.[col.key];
      cell.value = formatForCell(raw, col.kind) ?? (idx === 0 ? "মোট" : "");
      cell.font = { name: "Calibri", size: 11, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
      const fmt = cellFormat(col.kind);
      if (fmt) cell.numFmt = fmt;
      cell.alignment = {
        vertical: "middle",
        horizontal: col.kind === "money" || col.kind === "number" ? "right" : "left",
      };
      cell.border = {
        top: { style: "medium", color: { argb: "FF0F172A" } },
      };
    });
    totalRow.height = 22;
  }

  // ── Footer block ───────────────────────────────────────────────
  const footerRowIdx =
    dataset.rows.length + (dataset.totalRow ? 5 : 4) + 1;
  worksheet.mergeCells(footerRowIdx, 1, footerRowIdx, dataset.columns.length);
  const footerCell = worksheet.getCell(footerRowIdx, 1);
  footerCell.value = `তৈরি হয়েছে: ${meta.generatedAt.toLocaleString("bn-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
  footerCell.font = { name: "Calibri", size: 9, color: { argb: "FF94A3B8" }, italic: true };

  // ── Header / KPI band over the title (optional KPI line) ───────
  // We surface KPIs as a single text line just under the subtitle so the
  // worksheet still prints cleanly. Skip if no KPIs provided.
  if (dataset.kpis && dataset.kpis.length > 0) {
    worksheet.insertRow(3, []);
    worksheet.mergeCells(3, 1, 3, dataset.columns.length);
    const kpiCell = worksheet.getCell(3, 1);
    kpiCell.value = dataset.kpis
      .map((k) => `${k.label}: ${k.value}`)
      .join("  ·  ");
    kpiCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1F2937" } };
    kpiCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEADER_FILL } };
    kpiCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    worksheet.getRow(3).height = 24;
    worksheet.views = [{ state: "frozen", ySplit: 4 }];
  }

  applyAutoWidth(worksheet, dataset.columns);
}

async function workbookToFile(workbook: any, filename: string) {
  const buffer: ArrayBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  // Reuse the existing downloadFile helper for consistent UX, but it expects
  // a string content. We bypass it by manually creating the anchor.
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Export a single report dataset to a one-sheet .xlsx file. */
export async function exportDatasetToExcel(
  dataset: ExportDataset,
  meta: ExportMeta,
  filename: string
): Promise<{ filename: string; rows: number }> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "POS App";
  workbook.created = meta.generatedAt;
  workbook.modified = meta.generatedAt;

  await buildSheet(workbook, dataset, meta);
  await workbookToFile(workbook, filename);

  return { filename, rows: dataset.rows.length };
}

/** Export many datasets into a single multi-sheet workbook. */
export async function exportDatasetsToExcel(
  datasets: ExportDataset[],
  meta: ExportMeta,
  filename: string
): Promise<{ filename: string; rows: number }> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "POS App";
  workbook.created = meta.generatedAt;
  workbook.modified = meta.generatedAt;

  for (const dataset of datasets) {
    await buildSheet(workbook, dataset, meta);
  }

  await workbookToFile(workbook, filename);

  const total = datasets.reduce((s, d) => s + d.rows.length, 0);
  return { filename, rows: total };
}

// Helper re-export so callers don't need to import downloadFile separately for CSV.
export { downloadFile };
