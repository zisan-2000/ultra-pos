import { notFound } from "next/navigation";
import {
  getStaffPermissionOptions,
  getStaffUserSummary,
} from "@/app/actions/user-management";
import AccessControlClient from "./AccessControlClient";

type PageProps = { params: Promise<{ userId: string }> };

export default async function StaffAccessPage({ params }: PageProps) {
  const { userId } = await params;

  if (!userId) {
    notFound();
  }

  const [user, options] = await Promise.all([
    getStaffUserSummary(userId),
    getStaffPermissionOptions(userId),
  ]);

  return <AccessControlClient user={user} permissions={options.permissions} />;
}
