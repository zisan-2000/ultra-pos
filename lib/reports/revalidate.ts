import { revalidateTag } from "next/cache";
import { REPORTS_TAG_GROUPS } from "./cache-tags";

function revalidateTags(tags: readonly string[]) {
  tags.forEach((tag) => revalidateTag(tag));
}

export function revalidateReportsForSale() {
  revalidateTags(REPORTS_TAG_GROUPS.sales);
}

export function revalidateReportsForExpense() {
  revalidateTags(REPORTS_TAG_GROUPS.expenses);
}

export function revalidateReportsForCash() {
  revalidateTags(REPORTS_TAG_GROUPS.cash);
}

export function revalidateReportsForProduct() {
  revalidateTags(REPORTS_TAG_GROUPS.products);
}
