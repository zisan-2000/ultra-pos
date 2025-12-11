// app/actions/profile.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { hashPassword, verifyPassword } from "@/lib/password";

type MyProfile = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{ id: string; name: string }>;
  permissions: string[];
};

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function getMyProfile(): Promise<MyProfile> {
  const sessionUser = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      roles: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return {
    ...user,
    permissions: sessionUser.permissions ?? [],
  };
}

export async function updateMyProfile(input: {
  name?: string;
  email?: string;
}): Promise<MyProfile> {
  const sessionUser = await requireUser();

  const current = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      roles: { select: { id: true, name: true } },
    },
  });

  if (!current) {
    throw new Error("User not found");
  }

  const nextNameInput =
    typeof input.name === "string" ? input.name.trim() : current.name ?? "";
  const normalizedName = nextNameInput.length ? nextNameInput : null;

  const nextEmailInput =
    typeof input.email === "string" ? input.email.trim() : current.email ?? "";
  const normalizedEmail =
    nextEmailInput.length > 0 ? nextEmailInput.toLowerCase() : null;

  if (normalizedEmail && !validateEmail(normalizedEmail)) {
    throw new Error("সঠিক ইমেইল লিখুন");
  }

  const emailChanged =
    (normalizedEmail || null) !==
    (current.email ? current.email.toLowerCase() : null);

  if (emailChanged && normalizedEmail) {
    const duplicate = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        NOT: { id: sessionUser.id },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new Error("এই ইমেইলটি আগে থেকে ব্যবহৃত হচ্ছে");
    }
  }

  const updated = await prisma.user.update({
    where: { id: sessionUser.id },
    data: {
      name: normalizedName,
      email: normalizedEmail,
      ...(emailChanged ? { emailVerified: false } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      roles: { select: { id: true, name: true } },
    },
  });

  return {
    ...updated,
    permissions: sessionUser.permissions ?? [],
  };
}

export async function changeMyPassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const sessionUser = await requireUser();
  const currentPassword = input.currentPassword?.trim() ?? "";
  const newPassword = input.newPassword?.trim() ?? "";

  if (!currentPassword || !newPassword) {
    throw new Error("পাসওয়ার্ড ফাঁকা রাখা যাবে না");
  }

  if (newPassword.length < 8) {
    throw new Error("নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে");
  }

  const complexityChecks = [
    /[A-Z]/.test(newPassword),
    /[a-z]/.test(newPassword),
    /[0-9]/.test(newPassword),
    /[^A-Za-z0-9]/.test(newPassword),
  ];

  if (complexityChecks.filter(Boolean).length < 3) {
    throw new Error(
      "নতুন পাসওয়ার্ডে বড় হাতের, ছোট হাতের, সংখ্যা এবং বিশেষ অক্ষরের যেকোনো তিনটি থাকতে হবে"
    );
  }

  if (currentPassword === newPassword) {
    throw new Error("নতুন পাসওয়ার্ড পুরনোটির থেকে আলাদা হতে হবে");
  }

  const credentialAccount = await prisma.account.findFirst({
    where: { userId: sessionUser.id, providerId: "credential" },
    select: { password: true },
  });

  let passwordHash = credentialAccount?.password || null;

  if (!passwordHash) {
    const userRow = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { passwordHash: true },
    });
    passwordHash = userRow?.passwordHash ?? null;
  }

  if (!passwordHash) {
    throw new Error("পাসওয়ার্ড তথ্য পাওয়া যায়নি। প্রশাসকের সাথে যোগাযোগ করুন।");
  }

  const isValid = await verifyPassword(currentPassword, passwordHash);
  if (!isValid) {
    throw new Error("বর্তমান পাসওয়ার্ড সঠিক নয়");
  }

  const newHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.account.updateMany({
      where: { userId: sessionUser.id, providerId: "credential" },
      data: { password: newHash },
    }),
    prisma.user.update({
      where: { id: sessionUser.id },
      data: { passwordHash: newHash },
    }),
  ]);

  return { success: true };
}
