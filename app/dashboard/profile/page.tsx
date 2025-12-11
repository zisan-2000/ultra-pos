// app/dashboard/profile/page.tsx

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
    info: "bg-blue-50 text-blue-700 border border-blue-100",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    warning: "bg-amber-50 text-amber-700 border border-amber-100",
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
        <div className="h-32 bg-gradient-to-r from-slate-100 via-white to-slate-50 rounded-2xl border border-slate-200 animate-pulse" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-56 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse" />
            <div className="h-72 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse" />
          </div>
          <div className="h-72 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse" />
        </div>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-700 mb-2">ত্রুটি</h2>
        <p className="text-sm text-red-600">{initialError}</p>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6 section-gap">
      <div className="bg-gradient-to-br from-emerald-50 via-slate-50 to-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-gray-500">আমার প্রোফাইল</p>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">
              {profile.name || "নাম সেট করুন"}
            </h1>
            <p className="text-gray-600">{profile.email || "ইমেইল সেট করুন"}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge tone={profile.emailVerified ? "success" : "warning"}>
                {profile.emailVerified ? "ইমেইল ভেরিফায়েড" : "ভেরিফিকেশন অপেক্ষমাণ"}
              </Badge>
              <Badge tone="info">
                ভূমিকা: {profile.roles.map((r) => r.name).join(", ") || "—"}
              </Badge>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 shadow-sm w-full md:w-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500">নিরাপত্তা অবস্থা</p>
                <p className="text-sm font-semibold text-gray-900">
                  দুইটি স্তর সক্রিয়
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  সর্বশেষ আপডেট: {formatDate(profile.updatedAt)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg">
                🔒
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  প্রোফাইল তথ্য
                </h2>
                <p className="text-sm text-gray-600">
                  আপনার নাম ও ইমেইল সঠিক আছে কিনা নিশ্চিত করুন
                </p>
              </div>
              <Badge tone="info">ইউজার আইডি: {profile.id.slice(0, 8)}...</Badge>
            </div>

            <form className="space-y-4" onSubmit={handleProfileSave}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    নাম
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="আপনার নাম লিখুন"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    ইমেইল
                  </label>
                  <input
                    type="email"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
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
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {savingProfile ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
                </button>
                {profileFeedback ? (
                  <span
                    className={`text-sm ${
                      profileFeedback.tone === "success"
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {profileFeedback.message}
                  </span>
                ) : null}
                <span className="text-xs text-gray-500">
                  তৈরি: {formatDate(profile.createdAt)}
                </span>
              </div>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  পাসওয়ার্ড পরিবর্তন
                </h2>
                <p className="text-sm text-gray-600">
                  বর্তমান পাসওয়ার্ড নিশ্চিত করুন এবং শক্তিশালী নতুন পাসওয়ার্ড দিন
                </p>
              </div>
              <Badge tone="warning">সুপার অ্যাডমিন প্রটেক্টেড</Badge>
            </div>

            <form className="space-y-4" onSubmit={handlePasswordChange}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  বর্তমান পাসওয়ার্ড
                </label>
                <input
                  type="password"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="বর্তমান পাসওয়ার্ড লিখুন"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    নতুন পাসওয়ার্ড
                  </label>
                  <input
                    type="password"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="কমপক্ষে ৮ অক্ষর"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    কনফার্ম পাসওয়ার্ড
                  </label>
                  <input
                    type="password"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {changingPassword ? "পরিবর্তন হচ্ছে..." : "পাসওয়ার্ড পরিবর্তন"}
                </button>
                {passwordFeedback ? (
                  <span
                    className={`text-sm ${
                      passwordFeedback.tone === "success"
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {passwordFeedback.message}
                  </span>
                ) : null}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-gray-600">
                পাসওয়ার্ডে অন্তত ৮ অক্ষর, বড়-ছোট হাতের অক্ষর, সংখ্যা ও বিশেষ
                অক্ষরের সংমিশ্রণ ব্যবহার করলে অ্যাকাউন্ট নিরাপদ থাকবে।
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-900">
                অ্যাক্সেস স্ন্যাপশট
              </h3>
              <Badge tone="info">
                {profile.permissions.length} পারমিশন
              </Badge>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">ভূমিকা</p>
                <div className="flex flex-wrap gap-2">
                  {profile.roles.length === 0 ? (
                    <span className="text-sm text-gray-500">
                      কোনো ভূমিকা নেই
                    </span>
                  ) : (
                    profile.roles.map((role) => (
                      <span
                        key={role.id}
                        className="px-3 py-1 bg-slate-100 text-slate-800 rounded-full text-sm font-medium"
                      >
                        {role.name}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">
                  গুরুত্বপূর্ণ পারমিশন
                </p>
                <div className="flex flex-wrap gap-2">
                  {permissionPreview.length === 0 ? (
                    <span className="text-sm text-gray-500">
                      কোনো পারমিশন পাওয়া যায়নি
                    </span>
                  ) : (
                    permissionPreview.map((perm) => (
                      <span
                        key={perm}
                        className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-100"
                      >
                        {perm.replace(/_/g, " ")}
                      </span>
                    ))
                  )}
                  {profile.permissions.length > permissionPreview.length ? (
                    <span className="text-xs text-gray-500">
                      +{profile.permissions.length - permissionPreview.length} আরও
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-lg">
                🛡️
              </div>
              <div>
                <h4 className="text-base font-semibold text-slate-900">
                  নিরাপত্তা টিপস
                </h4>
                <p className="text-sm text-gray-600">
                  নতুন ডিভাইস থেকে লগইন করলে পাসওয়ার্ড পরিবর্তন করুন।
                </p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-gray-600 list-disc list-inside">
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
