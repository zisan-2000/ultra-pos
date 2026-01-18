import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";

const SUPPORT_CONTACT_TAG = "support-contact";

async function loadSupportContact() {
  const row = await prisma.systemSetting.findFirst({
    select: { supportPhone: true, supportWhatsapp: true },
  });
  return {
    supportPhone: row?.supportPhone || null,
    supportWhatsapp: row?.supportWhatsapp || null,
  };
}

const getSupportContactCached = unstable_cache(
  async () => loadSupportContact(),
  [SUPPORT_CONTACT_TAG],
  { revalidate: 60 }
);

export async function getSupportContactCachedData() {
  return getSupportContactCached();
}

export function revalidateSupportContact() {
  revalidateTag(SUPPORT_CONTACT_TAG);
}
