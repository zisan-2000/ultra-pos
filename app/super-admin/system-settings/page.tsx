// app/super-admin/system-settings/page.tsx

import { redirect } from "next/navigation";
import { getSupportContact, updateSupportContact } from "@/app/actions/system-settings";
import { requireUser } from "@/lib/auth-session";

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
    <div className="space-y-6 section-gap">
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">System Settings → Support Contact</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ফোন ও WhatsApp নাম্বার শুধুমাত্র সুপার অ্যাডমিন পরিবর্তন করতে পারবেন।
        </p>
        {saved ? (
          <div
            className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-success-soft border border-success/30 text-sm text-success"
            role="status"
            aria-live="polite"
          >
            ✅ তথ্য সফলভাবে সংরক্ষণ হয়েছে
          </div>
        ) : null}
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <form action={handleUpdate} className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <label htmlFor="supportPhone" className="text-sm font-medium text-foreground">
              ফোন নম্বর
            </label>
            <input
              id="supportPhone"
              name="supportPhone"
              type="text"
              defaultValue={supportPhone ?? ""}
              placeholder="01700-XXXXXX"
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="supportWhatsapp" className="text-sm font-medium text-foreground">
              WhatsApp নম্বর
            </label>
            <input
              id="supportWhatsapp"
              name="supportWhatsapp"
              type="text"
              defaultValue={supportWhatsapp ?? ""}
              placeholder="01700-YYYYYY"
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            এই তথ্য শুধুমাত্র সুপার অ্যাডমিন পরিবর্তন করতে পারবেন।
          </p>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-soft text-primary border border-primary/30 rounded-lg text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
          >
            সেভ করুন
          </button>
        </form>
      </div>
    </div>
  );
}
