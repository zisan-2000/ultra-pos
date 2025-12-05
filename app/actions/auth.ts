"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/* REGISTER */
export async function registerAction(formData: FormData) {
  const name = formData.get("name")?.toString();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!name || !email || !password) {
    return { error: "All fields are required" };
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
      },
    });

    return { success: true };
  } catch (err: any) {
    return { error: "User already exists" };
  }
}

/* LOGIN */
export async function loginAction(formData: FormData) {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) return { error: "Email & password required" };

  const res = await auth.api.signInEmail({ email, password });

  if (res.error) return { error: "Invalid credentials" };

  redirect("/dashboard");
}

/* LOGOUT */
export async function logout() {
  await auth.api.signOut();
  redirect("/login");
}
