import assert from "node:assert/strict";
import {
  canIssueSalesInvoice,
  canViewSalesInvoice,
  formatSalesInvoiceNo,
  resolveSalesInvoicePrefix,
  sanitizeSalesInvoicePrefix,
} from "../../lib/sales-invoice.ts";
import { runSuite } from "./test-utils.ts";

const baseUser = {
  id: "u1",
  email: "owner@example.com",
  name: "Owner",
  roles: ["owner"],
  permissions: [] as string[],
  staffShopId: null,
};

export async function runSalesInvoiceTests() {
  await runSuite("sales-invoice helpers", [
    {
      name: "sanitizes invoice prefix to uppercase alnum with max length",
      fn: () => {
        const sanitized = sanitizeSalesInvoicePrefix(" inv-2026_#special ");
        assert.equal(sanitized, "INV2026SPECIA");
      },
    },
    {
      name: "returns null for empty/invalid prefix values",
      fn: () => {
        assert.equal(sanitizeSalesInvoicePrefix("   "), null);
        assert.equal(sanitizeSalesInvoicePrefix("***"), null);
      },
    },
    {
      name: "resolves fallback prefix when no custom prefix provided",
      fn: () => {
        assert.equal(resolveSalesInvoicePrefix(null), "INV");
      },
    },
    {
      name: "formats invoice number with yymm and padded sequence",
      fn: () => {
        const invoiceNo = formatSalesInvoiceNo(
          "abc",
          42,
          new Date("2026-02-19T10:00:00.000Z")
        );
        assert.equal(invoiceNo, "ABC-2602-000042");
      },
    },
    {
      name: "can issue sales invoice only when feature enabled and permission exists",
      fn: () => {
        const allowedUser = {
          ...baseUser,
          permissions: ["issue_sales_invoice"],
        };
        const deniedUser = {
          ...baseUser,
          permissions: [],
        };

        assert.equal(canIssueSalesInvoice(allowedUser, true), true);
        assert.equal(canIssueSalesInvoice(allowedUser, false), false);
        assert.equal(canIssueSalesInvoice(deniedUser, true), false);
      },
    },
    {
      name: "can view sales invoice by permission",
      fn: () => {
        const viewer = {
          ...baseUser,
          permissions: ["view_sales_invoice"],
        };
        const nonViewer = {
          ...baseUser,
          permissions: [],
        };
        assert.equal(canViewSalesInvoice(viewer), true);
        assert.equal(canViewSalesInvoice(nonViewer), false);
      },
    },
  ]);
}
