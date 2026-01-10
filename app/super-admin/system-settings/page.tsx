// app/super-admin/system-settings/page.tsx

import { redirect } from "next/navigation";
import { getSupportContact, updateSupportContact } from "@/app/actions/system-settings";
import { requireUser } from "@/lib/auth-session";
import SystemSettingsClient from "./SystemSettingsClient";

type PageProps = {
  searchParams?: Promise<{ saved?: string }>;
};

export default async function SystemSettingsPage({ searchParams }: PageProps) {
  const resolvedSearch = await searchParams;
  const saved = resolvedSearch?.saved === "1";
  const user = await requireUser();
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;

  if (!isSuperAdmin) {
    return (
      <div className="p-6 bg-danger-soft border border-danger/30 rounded-lg text-danger">
        এখানে শুধুমাত্র সুপার অ্যাডমিন পরিবর্তন করতে পারবেন।
      </div>
    );
  }

  const { supportPhone, supportWhatsapp } = await getSupportContact();

  async function handleUpdate(formData: FormData) {
    "use server";
    const phone = (formData.get("supportPhone") as string) || "";
    const whatsapp = (formData.get("supportWhatsapp") as string) || "";
    await updateSupportContact({
      supportPhone: phone,
      supportWhatsapp: whatsapp,
    });
    redirect("/super-admin/system-settings?saved=1");
  }

  return (
    <SystemSettingsClient
      saved={saved}
      initialSupport={{ supportPhone, supportWhatsapp }}
      onUpdate={handleUpdate}
    />
  );
}
