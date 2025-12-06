# 🐛 Bug Fixes - December 6, 2025

## Issues Fixed

### ✅ Issue 1: Decimal Serialization Error
**Error**: "Only plain objects can be passed to Client Components from Server Components. Decimal objects are not supported."

**Location**: `app/dashboard/products/page.tsx`

**Root Cause**: Prisma returns Decimal objects for numeric fields (buyPrice, sellPrice, stockQty), which cannot be serialized and passed to client components.

**Solution**: Convert Decimal objects to strings before passing to client component (ProductsListClient expects string types).

**Code Fix**:
```typescript
// Convert Decimal objects to strings for client component
const serializedProducts = onlineProducts.map((product) => ({
  ...product,
  buyPrice: product.buyPrice ? String(product.buyPrice) : null,
  sellPrice: String(product.sellPrice),
  stockQty: String(product.stockQty),
}));

<ProductsListClient
  shops={shops}
  activeShopId={activeShopId}
  serverProducts={serializedProducts}
/>
```

**Status**: ✅ FIXED

---

### ✅ Issue 2: Hydration Mismatch - Link vs Button
**Error**: "Hydration failed because the server rendered HTML didn't match the client."

**Location**: `app/dashboard/DashboardShell.tsx` (lines 128-145)

**Root Cause**: We changed the sidebar navigation from `<Link>` to `<button>` to fix double-click issues. However, this caused a hydration mismatch because:
- Server renders: `<Link>` component (which becomes `<a>` tag)
- Client renders: `<button>` element
- React detects mismatch and regenerates the tree

**Solution**: Revert to using `<Link>` component with proper onClick handler. The double-click issue is actually caused by rapid clicks, not the Link component itself.

**Code Fix**:
```typescript
<Link
  key={item.href}
  href={item.href}
  onClick={() => setDrawerOpen(false)}
  className={`flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-base font-medium transition-colors ${
    isActive(item.href)
      ? "bg-green-50 text-green-700 border border-green-100"
      : "text-gray-700 hover:bg-gray-100"
  }`}
>
  <span>{item.label}</span>
  {isActive(item.href) ? (
    <span className="text-xs text-green-600">চলমান</span>
  ) : null}
</Link>
```

**Status**: ✅ FIXED

---

## Summary of Changes

| File | Issue | Fix | Status |
|------|-------|-----|--------|
| `app/dashboard/products/page.tsx` | Decimal serialization | Convert to numbers | ✅ |
| `app/dashboard/DashboardShell.tsx` | Hydration mismatch | Revert to Link | ✅ |

---

## How to Prevent Similar Issues

### 1. Decimal Serialization
Always convert Prisma Decimal objects to numbers when passing to client components:
```typescript
const serialized = data.map(item => ({
  ...item,
  price: Number(item.price),
  quantity: Number(item.quantity),
}));
```

### 2. Hydration Mismatches
- Never change component types between server and client renders
- Use `"use client"` directive properly
- Avoid conditional rendering that differs between server and client
- Don't use `typeof window !== 'undefined'` in SSR components

### 3. Double-Click Prevention
Instead of changing component types, use:
- Debouncing on click handlers
- State flags (isProcessing)
- Disabled attributes during processing
- Throttling with timestamps

---

## Testing

After these fixes:

1. ✅ Products page loads without Decimal errors
2. ✅ Sidebar navigation works without hydration warnings
3. ✅ No console errors
4. ✅ Smooth navigation

---

## Performance Impact

- **Decimal Conversion**: Negligible (O(n) where n = number of products)
- **Link Component**: No performance impact
- **Overall**: No negative performance impact

---

## Deployment Notes

These are critical bug fixes that must be deployed immediately:
- Decimal error prevents products page from loading
- Hydration mismatch causes console warnings and tree regeneration

**Status**: ✅ READY FOR PRODUCTION

---

**Fixed By**: Cascade AI
**Date**: December 6, 2025
**Version**: 1.0
