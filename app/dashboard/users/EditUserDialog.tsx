"use client";

import { useEffect, useState } from "react";
import { updateUser } from "@/app/actions/user-management";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdminAction } from "@/lib/sync/queue";
import { db } from "@/lib/dexie/db";
import { handlePermissionError } from "@/lib/permission-toast";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  createdAt: Date | string;
  createdBy: string | null;
  roles: Array<{ id: string; name: string }>;
  pending?: boolean;
};

type EditUserDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
  onOptimisticUpdate?: (user: User) => void;
};

export function EditUserDialog({
  isOpen,
  onClose,
  user,
  onSuccess,
  onOptimisticUpdate,
}: EditUserDialogProps) {
  const online = useOnlineStatus();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePendingCreate = async (clientId: string, data: Record<string, any>) => {
    try {
      const items = await db.queue.where("type").equals("admin").toArray();
      const matches = items.filter(
        (item) =>
          item.payload?.action === "user_create" &&
          item.payload?.data?.clientId === clientId
      );
      await Promise.all(
        matches.map((item) =>
          item.id
            ? db.queue.update(item.id, {
                payload: {
                  ...item.payload,
                  data: { ...item.payload.data, ...data },
                },
              })
            : Promise.resolve()
        )
      );
    } catch (err) {
      handlePermissionError(err);
      console.error("Update pending user create failed", err);
    }
  };

  // Sync local form state whenever dialog opens or target user changes
  useEffect(() => {
    if (isOpen && user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setError(null);
      setPassword("");
      setConfirmPassword("");
    }
  }, [isOpen, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      setError("αª╕αª¼ αª½αª┐αª▓αºìαªí αª¬αºéαª░αªú αªòαª░αºüαª¿");
      return;
    }

    if (!online && (password.trim() || confirmPassword.trim())) {
      setError("αªàαª½αª▓αª╛αªçαª¿: αª¬αª╛αª╕αªôαª»αª╝αª╛αª░αºìαªí αª¬αª░αª┐αª¼αª░αºìαªñαª¿ αªòαª░αª╛ αª»αª╛αª¼αºç αª¿αª╛");
      return;
    }

    // If password fields filled, validate
    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        setError("Password αªÅαª¼αªé Confirm Password αª«αª┐αª▓αª¢αºç αª¿αª╛");
        return;
      }

      if (password.length < 8) {
        setError("Password αªòαª«αª¬αªòαºìαª╖αºç αº« αªàαªòαºìαª╖αª░αºçαª░ αª╣αªñαºç αª╣αª¼αºç");
        return;
      }
    }

    try {
      setLoading(true);
      if (!online) {
        const trimmedPassword = password.trim();
        const passwordValue = trimmedPassword ? trimmedPassword : undefined;
        const payload = {
          userId: user.id,
          name: trimmedName,
          email: trimmedEmail,
          ...(passwordValue ? { password: passwordValue } : {}),
        };

        if (user.id.startsWith("offline-")) {
          await updatePendingCreate(user.id, {
            email: trimmedEmail,
            name: trimmedName,
            ...(passwordValue ? { password: passwordValue } : {}),
          });
        } else {
          await queueAdminAction("user_update", payload);
        }

        onOptimisticUpdate?.({
          ...user,
          name: trimmedName,
          email: trimmedEmail,
          pending: true,
        });
        alert("αªàαª½αª▓αª╛αªçαª¿: αªçαªëαª£αª╛αª░ αªåαª¬αªíαºçαªƒ αªòαª┐αªë αª╣αª»αª╝αºçαª¢αºç, αªàαª¿αª▓αª╛αªçαª¿αºç αªùαºçαª▓αºç αª╕αª┐αªÖαºìαªò αª╣αª¼αºçαÑñ");
        onClose();
        return;
      }
      await updateUser(user.id, {
        name: trimmedName,
        email: trimmedEmail,
        password: password || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      handlePermissionError(err);
      setError(err instanceof Error ? err.message : "αª¼αºìαª»αª¼αª╣αª╛αª░αªòαª╛αª░αºÇ αªåαª¬αªíαºçαªƒ αªòαª░αªñαºç αª¼αºìαª»αª░αºìαªÑ");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-foreground/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">αª¼αºìαª»αª¼αª╣αª╛αª░αªòαª╛αª░αºÇ αª╕αª«αºìαª¬αª╛αªªαª¿αª╛ αªòαª░αºüαª¿</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
            disabled={loading}
          >
            ├ù
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-lg p-3">
              <p className="text-danger text-sm">{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              αª¿αª╛αª« *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="αª¼αºìαª»αª¼αª╣αª╛αª░αªòαª╛αª░αºÇαª░ αª¿αª╛αª«"
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                αª¿αªñαºüαª¿ αª¬αª╛αª╕αªôαª»αª╝αª╛αª░αºìαªí
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="αª½αª╛αªüαªòαª╛ αª░αª╛αªûαª▓αºç αª¬αª╛αª╕αªôαª»αª╝αª╛αª░αºìαªí αª¬αª░αª┐αª¼αª░αºìαªñαª¿ αª╣αª¼αºç αª¿αª╛"
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading || !online}
              />
              <p className="text-xs text-muted-foreground mt-1">
                αªòαª«αª¬αªòαºìαª╖αºç αº« αªàαªòαºìαª╖αª░, αªÅαªòαªƒαª┐ αª¼αªíαª╝ αªàαªòαºìαª╖αª░ αªÅαª¼αªé αªÅαªòαªƒαª┐ αª╕αªéαªûαºìαª»αª╛ αª¼αºìαª»αª¼αª╣αª╛αª░ αªòαª░αª╛ αªëαªñαºìαªñαª«
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                αªòαª¿αª½αª╛αª░αºìαª« αª¬αª╛αª╕αªôαª»αª╝αª╛αª░αºìαªí
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="αªåαª¼αª╛αª░ αª¬αª╛αª╕αªôαª»αª╝αª╛αª░αºìαªí αª▓αª┐αªûαºüαª¿"
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading || !online}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              αªçαª«αºçαªçαª▓ *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
          </div>

          {/* Role Info */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              αª¡αºéαª«αª┐αªòαª╛
            </label>
            <div className="flex flex-wrap gap-1">
              {user.roles.length === 0 ? (
                <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                  αªòαºïαª¿αºï αª¡αºéαª«αª┐αªòαª╛ αª¿αºçαªç
                </span>
              ) : (
                user.roles.map((role) => (
                  <span
                    key={role.id}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
                  >
                    {role.name}
                  </span>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              αª¡αºéαª«αª┐αªòαª╛ αª¬αª░αª┐αª¼αª░αºìαªñαª¿ αªòαª░αªñαºç RBAC admin panel αª¼αºìαª»αª¼αª╣αª╛αª░ αªòαª░αºüαª¿
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground font-medium hover:bg-muted disabled:opacity-50"
              disabled={loading}
            >
              αª¼αª╛αªñαª┐αª▓
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "αª╕αªéαª░αªòαºìαª╖αªú αª╣αªÜαºìαª¢αºç..." : "αª╕αªéαª░αªòαºìαª╖αªú αªòαª░αºüαª¿"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
