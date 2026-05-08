"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

type Props = {
  value: string;
  productName: string;
  sellPrice?: string;
  generating?: boolean;
  onGenerate: () => void;
};

function normalizePriceLabel(value?: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return trimmed;
  return parsed.toFixed(2);
}

function getBarcodeRenderConfig(value: string) {
  if (/^\d{13}$/.test(value)) {
    return { format: "EAN13" as const, width: 2, height: 68, margin: 8 };
  }
  if (/^\d{8}$/.test(value)) {
    return { format: "EAN8" as const, width: 2, height: 62, margin: 8 };
  }
  return { format: "CODE128" as const, width: 1.6, height: 54, margin: 6 };
}

export default function BarcodePreviewCard({
  value,
  productName,
  sellPrice,
  generating = false,
  onGenerate,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [copies, setCopies] = useState("1");
  const [printStatus, setPrintStatus] = useState<string | null>(null);

  const trimmedValue = value.trim();
  const printablePrice = useMemo(() => normalizePriceLabel(sellPrice), [sellPrice]);
  const renderConfig = useMemo(() => getBarcodeRenderConfig(trimmedValue), [trimmedValue]);
  const renderError = useMemo(() => {
    if (!trimmedValue) return null;
    if (!/^[\x00-\x7F]+$/.test(trimmedValue)) {
      return "Barcode preview-এর জন্য English number/letter code ব্যবহার করুন।";
    }
    return null;
  }, [trimmedValue]);

  useEffect(() => {
    if (!svgRef.current) return;
    if (!trimmedValue) {
      svgRef.current.innerHTML = "";
      return;
    }
    if (renderError) {
      svgRef.current.innerHTML = "";
      return;
    }

    try {
      JsBarcode(svgRef.current, trimmedValue, {
        format: renderConfig.format,
        displayValue: false,
        lineColor: "#0f172a",
        background: "#ffffff",
        width: renderConfig.width,
        height: renderConfig.height,
        margin: renderConfig.margin,
        fontSize: 14,
        textMargin: 4,
      });
    } catch {
      svgRef.current.innerHTML = "";
    }
  }, [renderConfig, renderError, trimmedValue]);

  function buildPrintHtml(svgMarkup: string) {
    const copyCount = Math.min(
      24,
      Math.max(1, Number.parseInt(copies || "1", 10) || 1)
    );
    const labelName = productName.trim() || "Unnamed Product";
    const safeName = labelName
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const safeCode = trimmedValue
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const safePrice = printablePrice
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const labels = Array.from({ length: copyCount }, () => `
      <article class="label">
        <div class="name">${safeName}</div>
        ${safePrice ? `<div class="price">৳ ${safePrice}</div>` : ""}
        <div class="svg">${svgMarkup}</div>
        <div class="code">${safeCode}</div>
      </article>
    `).join("");

    return `
      <!doctype html>
      <html>
        <head>
          <title>Barcode Label</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 16px;
              font-family: Arial, sans-serif;
              background: #ffffff;
              color: #0f172a;
            }
            .sheet {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
              gap: 12px;
            }
            .label {
              border: 1px solid #d4d4d8;
              border-radius: 12px;
              padding: 12px;
              break-inside: avoid;
            }
            .name {
              font-size: 16px;
              font-weight: 700;
              margin-bottom: 4px;
            }
            .price {
              font-size: 13px;
              font-weight: 600;
              margin-bottom: 6px;
            }
            .svg {
              display: flex;
              justify-content: center;
              align-items: center;
              overflow: hidden;
            }
            .svg svg {
              width: 100%;
              height: auto;
            }
            .code {
              margin-top: 4px;
              text-align: center;
              font-size: 12px;
              letter-spacing: 0.08em;
            }
            @media print {
              body { padding: 0; }
              .sheet { gap: 8px; }
              .label {
                border-radius: 0;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <main class="sheet">${labels}</main>
        </body>
      </html>
    `;
  }

  function openPrintPopup(html: string) {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!popup) {
      setPrintStatus("Popup blocked. Browser-এর print allow করুন অথবা অন্য browser ব্যবহার করুন।");
      return false;
    }

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => {
      popup.print();
    }, 200);
    setPrintStatus("নতুন window-এ print sheet খোলা হয়েছে।");
    return true;
  }

  function handlePrint() {
    if (!trimmedValue || !svgRef.current || renderError) return;

    const html = buildPrintHtml(svgRef.current.outerHTML);

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const cleanup = () => {
      window.setTimeout(() => {
        frame.remove();
      }, 800);
    };

    frame.onload = () => {
      const printTarget = frame.contentWindow;
      if (!printTarget) {
        cleanup();
        openPrintPopup(html);
        return;
      }

      printTarget.focus();
      window.setTimeout(() => {
        try {
          printTarget.print();
          setPrintStatus("Print dialog খোলা হয়েছে। thermal বা A4 label page বেছে নিন।");
        } catch {
          openPrintPopup(html);
        }
        cleanup();
      }, 150);
    };

    frame.srcdoc = html;
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Barcode Tools</p>
          <p className="text-xs text-muted-foreground">
            Numeric code হলে EAN preview, অন্যথায় Code 128 preview দেখুন ও label print করুন।
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!productName.trim() || generating}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-card disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate Barcode"}
        </button>
      </div>

      {trimmedValue ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-3 space-y-3">
          <div className="overflow-hidden rounded-lg bg-white px-2 py-3">
            <svg ref={svgRef} />
          </div>
          {renderError ? (
            <p className="text-xs font-medium text-danger">{renderError}</p>
          ) : null}
          {printStatus ? (
            <p className="text-xs font-medium text-primary">{printStatus}</p>
          ) : null}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Raw Code
              </p>
              <p className="truncate text-sm font-semibold text-foreground">{trimmedValue}</p>
            </div>
            <div className="flex items-end gap-2">
              <label className="space-y-1">
                <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Copies
                </span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={copies}
                  onChange={(e) => setCopies(e.target.value.replace(/[^\d]/g, "").slice(0, 2) || "1")}
                  className="h-9 w-20 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <button
                type="button"
                onClick={handlePrint}
                disabled={Boolean(renderError)}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-card disabled:opacity-50"
              >
                Print Label
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            mobile print dialog না খুললে desktop Chrome/Edge, Bluetooth thermal printer, বা popup allow করে আবার try করুন।
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-3 text-xs text-muted-foreground">
          Barcode field ফাঁকা। product name লিখে `Generate Barcode` চাপুন, অথবা existing barcode manual দিন।
        </div>
      )}
    </div>
  );
}
