// app/dashboard/profile/ProfileClient.tsx

"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  changeMyPassword,
  getMyProfile,
  updateMyProfile,
} from "@/app/actions/profile";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  image: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  roles: Array<{ id: string; name: string }>;
  permissions: string[];
};

type Feedback = { message: string; tone: "success" | "error" };

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "–";
  try {
    return new Date(value).toLocaleString("bn-BD", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "–";
  }
}

function Badge({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "warning";
  children: ReactNode;
}) {
  const map: Record<"info" | "success" | "warning", string> = {
    info: "bg-primary-soft text-primary border border-primary/30",
    success: "bg-success-soft text-success border border-success/30",
    warning: "bg-warning-soft text-warning border border-warning/30",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null);

  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(
    null
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await getMyProfile();
        setProfile(data);
        setName(data.name ?? "");
        setEmail(data.email ?? "");
      } catch (err) {
        setInitialError(
          err instanceof Error ? err.message : "প্রোফাইল লোড করা যায়নি"
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const permissionPreview = useMemo(() => {
    if (!profile) return [];
    return profile.permissions.slice(0, 6);
  }, [profile]);

  const hasUnsavedProfileChanges = !!(
    profile && (name !== (profile.name ?? "") || email !== (profile.email ?? ""))
  );

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSavingProfile(true);
    setProfileFeedback(null);

    try {
      const updated = await updateMyProfile({ name, email });
      setProfile(updated);
      setProfileFeedback({
        tone: "success",
        message: "প্রোফাইল সফলভাবে আপডেট হয়েছে",
      });
    } catch (err) {
      setProfileFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "আপডেট করা যায়নি",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        tone: "error",
        message: "নতুন পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না",
      });
      return;
    }

    setChangingPassword(true);
    setPasswordFeedback(null);

    try {
      await changeMyPassword({ currentPassword, newPassword });
      setPasswordFeedback({
        tone: "success",
        message: "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "পাসওয়ার্ড পরিবর্তন ব্যর্থ",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-gradient-to-r from-muted/70 via-background to-muted/50 rounded-2xl border border-border animate-pulse" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-56 bg-card border border-border rounded-xl shadow-sm animate-pulse" />
            <div className="h-72 bg-card border border-border rounded-xl shadow-sm animate-pulse" />
          </div>
          <div className="h-72 bg-card border border-border rounded-xl shadow-sm animate-pulse" />
        </div>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="bg-danger-soft border border-danger/30 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-danger mb-2">ত্রুটি</h2>
        <p className="text-sm text-danger">{initialError}</p>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6 section-gap">
      <div className="bg-gradient-to-br from-primary/10 via-muted/60 to-background border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">আমার প্রোফাইল</p>
            <h1 className="text-3xl font-bold text-foreground leading-tight">
              {profile.name || "নাম সেট করুন"}
            </h1>
            <p className="text-muted-foreground">{profile.email || "ইমেইল সেট করুন"}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge tone={profile.emailVerified ? "success" : "warning"}>
                {profile.emailVerified ? "ইমেইল ভেরিফায়েড" : "ভেরিফিকেশন অপেক্ষমাণ"}
              </Badge>
              <Badge tone="info">
                ভূমিকা: {profile.roles.map((r) => r.name).join(", ") || "—"}
              </Badge>
            </div>
          </div>

          <div className="bg-card/70 backdrop-blur-sm border border-border rounded-xl px-4 py-3 shadow-sm w-full md:w-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">নিরাপত্তা অবস্থা</p>
                <p className="text-sm font-semibold text-foreground">
                  দুইটি স্তর সক্রিয়
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  সর্বশেষ আপডেট: {formatDate(profile.updatedAt)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-success/15 text-success flex items-center justify-center text-lg">
                🔒
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  প্রোফাইল তথ্য
                </h2>
                <p className="text-sm text-muted-foreground">
                  আপনার নাম ও ইমেইল সঠিক আছে কিনা নিশ্চিত করুন
                </p>
              </div>
              <Badge tone="info">ইউজার আইডি: {profile.id.slice(0, 8)}...</Badge>
            </div>

            <form className="space-y-4" onSubmit={handleProfileSave}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    নাম
                  </label>
                  <input
                    type="text"
                    className="w-full border border-border rounded-lg bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="আপনার নাম লিখুন"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    ইমেইল
                  </label>
                  <input
                    type="email"
                    className="w-full border border-border rounded-lg bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={savingProfile || !hasUnsavedProfileChanges}
                  className="px-4 py-2 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {savingProfile ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
                </button>
                {profileFeedback ? (
                  <span
                    className={`text-sm ${
                      profileFeedback.tone === "success"
                        ? "text-success"
                        : "text-danger"
                    }`}
                  >
                    {profileFeedback.message}
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  তৈরি: {formatDate(profile.createdAt)}
                </span>
              </div>
            </form>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  পাসওয়ার্ড পরিবর্তন
                </h2>
                <p className="text-sm text-muted-foreground">
                  বর্তমান পাসওয়ার্ড নিশ্চিত করুন এবং শক্তিশালী নতুন পাসওয়ার্ড দিন
                </p>
              </div>
              <Badge tone="warning">সুপার অ্যাডমিন প্রটেক্টেড</Badge>
            </div>

            <form className="space-y-4" onSubmit={handlePasswordChange}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  বর্তমান পাসওয়ার্ড
                </label>
                <input
                  type="password"
                  className="w-full border border-border rounded-lg bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="বর্তমান পাসওয়ার্ড লিখুন"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    নতুন পাসওয়ার্ড
                  </label>
                  <input
                    type="password"
                    className="w-full border border-border rounded-lg bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="কমপক্ষে ৮ অক্ষর"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    কনফার্ম পাসওয়ার্ড
                  </label>
                  <input
                    type="password"
                    className="w-full border border-border rounded-lg bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="আবার লিখুন"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="px-4 py-2 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {changingPassword ? "পরিবর্তন হচ্ছে..." : "পাসওয়ার্ড পরিবর্তন"}
                </button>
                {passwordFeedback ? (
                  <span
                    className={`text-sm ${
                      passwordFeedback.tone === "success"
                        ? "text-success"
                        : "text-danger"
                    }`}
                  >
                    {passwordFeedback.message}
                  </span>
                ) : null}
              </div>

              <div className="bg-muted border border-border rounded-lg p-3 text-xs text-muted-foreground">
                পাসওয়ার্ডে অন্তত ৮ অক্ষর, বড়-ছোট হাতের অক্ষর, সংখ্যা ও বিশেষ
                অক্ষরের সংমিশ্রণ ব্যবহার করলে অ্যাকাউন্ট নিরাপদ থাকবে।
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground">
                অ্যাক্সেস স্ন্যাপশট
              </h3>
              <Badge tone="info">
                {profile.permissions.length} পারমিশন
              </Badge>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">ভূমিকা</p>
                <div className="flex flex-wrap gap-2">
                  {profile.roles.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      কোনো ভূমিকা নেই
                    </span>
                  ) : (
                    profile.roles.map((role) => (
                      <span
                        key={role.id}
                        className="px-3 py-1 bg-muted text-foreground rounded-full text-sm font-medium"
                      >
                        {role.name}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  গুরুত্বপূর্ণ পারমিশন
                </p>
                <div className="flex flex-wrap gap-2">
                  {permissionPreview.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      কোনো পারমিশন পাওয়া যায়নি
                    </span>
                  ) : (
                    permissionPreview.map((perm) => (
                      <span
                        key={perm}
                        className="px-3 py-1 bg-success-soft text-success rounded-full text-xs font-semibold border border-success/30"
                      >
                        {perm.replace(/_/g, " ")}
                      </span>
                    ))
                  )}
                  {profile.permissions.length > permissionPreview.length ? (
                    <span className="text-xs text-muted-foreground">
                      +{profile.permissions.length - permissionPreview.length} আরও
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/15 text-warning flex items-center justify-center text-lg">
                🛡️
              </div>
              <div>
                <h4 className="text-base font-semibold text-foreground">
                  নিরাপত্তা টিপস
                </h4>
                <p className="text-sm text-muted-foreground">
                  নতুন ডিভাইস থেকে লগইন করলে পাসওয়ার্ড পরিবর্তন করুন।
                </p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
              <li>শেয়ারড ডিভাইসে লগআউট করে নিন</li>
              <li>শক্তিশালী পাসওয়ার্ড ব্যবহার করুন</li>
              <li>ইমেইল ভেরিফিকেশন সম্পন্ন রাখুন</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
