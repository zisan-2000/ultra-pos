"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, GripVertical, Loader2, X } from "lucide-react";
import CopilotInsightPanel from "@/components/copilot/CopilotInsightPanel";
import CopilotMoodOrb from "@/components/copilot/CopilotMoodOrb";
import CopilotVoiceAsk from "@/components/copilot/CopilotVoiceAsk";
import { CopilotErrorBoundary } from "@/components/copilot/CopilotErrorBoundary";
import RefreshIconButton from "@/components/ui/refresh-icon-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentShop } from "@/hooks/use-current-shop";
import {
  buildOwnerCopilotInsight,
  type OwnerCopilotSnapshot,
} from "@/lib/owner-copilot";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type CopilotSummary = {
  sales: { total: number; count: number };
  expenses: { total: number; count: number; cogs: number };
  profit: number;
  cash: { in: number; out: number; balance: number; count: number };
};

type CopilotPayload = {
  summary: CopilotSummary;
  snapshot: OwnerCopilotSnapshot;
  generatedAt: string;
};

type Position = {
  x: number;
  y: number;
};

const MOBILE_BUTTON_WIDTH = 124;
const DESKTOP_BUTTON_WIDTH = 228;
const BUTTON_HEIGHT = 52;
const VIEWPORT_PADDING = 16;
const DEFAULT_BOTTOM_GAP = 112;
const DRAG_THRESHOLD = 8;
const LAUNCHER_POSITION_KEY = "owner-copilot-launcher:position";
const CACHE_KEY_PREFIX = "owner-copilot:snapshot:";
const VISIBILITY_KEY = "owner-copilot:visible";

function getDefaultPosition(): Position {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }
  const launcherWidth =
    window.innerWidth < 640 ? MOBILE_BUTTON_WIDTH : DESKTOP_BUTTON_WIDTH;
  return {
    x: Math.max(VIEWPORT_PADDING, window.innerWidth - launcherWidth - VIEWPORT_PADDING),
    y: Math.max(
      88,
      window.innerHeight - BUTTON_HEIGHT - DEFAULT_BOTTOM_GAP
    ),
  };
}

function clampPosition(position: Position): Position {
  if (typeof window === "undefined") {
    return position;
  }

  const launcherWidth =
    window.innerWidth < 640 ? MOBILE_BUTTON_WIDTH : DESKTOP_BUTTON_WIDTH;
  const maxX = Math.max(
    VIEWPORT_PADDING,
    window.innerWidth - launcherWidth - VIEWPORT_PADDING
  );
  const maxY = Math.max(88, window.innerHeight - BUTTON_HEIGHT - VIEWPORT_PADDING);

  return {
    x: Math.min(Math.max(position.x, VIEWPORT_PADDING), maxX),
    y: Math.min(Math.max(position.y, 88), maxY),
  };
}

function parseStoredPosition(raw: string | null): Position | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (
      typeof parsed?.x === "number" &&
      Number.isFinite(parsed.x) &&
      typeof parsed?.y === "number" &&
      Number.isFinite(parsed.y)
    ) {
      return clampPosition({ x: parsed.x, y: parsed.y });
    }
  } catch {
    return null;
  }
  return null;
}

function shouldShowCopilot(pathname: string | null) {
  if (!pathname) return false;
  if (pathname.startsWith("/dashboard/sales/new")) return false;
  if (pathname.startsWith("/dashboard/admin")) return false;
  if (pathname.startsWith("/dashboard/users")) return false;
  if (pathname.startsWith("/dashboard/shops")) return false;

  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/owner/dashboard") ||
    pathname.startsWith("/dashboard/sales") ||
    pathname.startsWith("/dashboard/products") ||
    pathname.startsWith("/dashboard/due") ||
    pathname.startsWith("/dashboard/expenses") ||
    pathname.startsWith("/dashboard/cash") ||
    pathname.startsWith("/dashboard/reports") ||
    pathname.startsWith("/dashboard/purchases") ||
    pathname.startsWith("/dashboard/suppliers") ||
    pathname.startsWith("/dashboard/queue")
  );
}

export default function FloatingCopilotLauncher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { shopId: storedShopId } = useCurrentShop();
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visiblePreference, setVisiblePreference] = useState(true);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [payload, setPayload] = useState<CopilotPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"insights" | "ask">("insights");
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dragged: boolean;
  } | null>(null);
  const suppressOpenRef = useRef(false);
  const positionRef = useRef<Position>({ x: 0, y: 0 });

  const activeShopId = searchParams.get("shopId") || storedShopId;
  const visible = shouldShowCopilot(pathname) && Boolean(activeShopId);
  const cacheKey = activeShopId ? `${CACHE_KEY_PREFIX}${activeShopId}` : null;

  useEffect(() => {
    setMounted(true);
    const stored = parseStoredPosition(safeLocalStorageGet(LAUNCHER_POSITION_KEY));
    const storedVisibility = safeLocalStorageGet(VISIBILITY_KEY);
    const initialPosition = stored ?? getDefaultPosition();
    positionRef.current = initialPosition;
    setPosition(initialPosition);
    setVisiblePreference(storedVisibility !== "0");
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const handleResize = () => {
      setPosition((current) => {
        const next = clampPosition(current);
        positionRef.current = next;
        return next;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [mounted]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!cacheKey) {
      setPayload(null);
      return;
    }
    const cached = safeLocalStorageGet(cacheKey);
    if (!cached) {
      setPayload(null);
      return;
    }
    try {
      setPayload(JSON.parse(cached) as CopilotPayload);
    } catch {
      setPayload(null);
    }
  }, [cacheKey]);

  const persistPosition = useCallback((next: Position) => {
    safeLocalStorageSet(LAUNCHER_POSITION_KEY, JSON.stringify(next));
  }, []);

  const setLauncherVisible = useCallback((next: boolean) => {
    setVisiblePreference(next);
    safeLocalStorageSet(VISIBILITY_KEY, next ? "1" : "0");
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (!dragState.dragged) {
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < DRAG_THRESHOLD) return;
        dragState.dragged = true;
      }

      const next = clampPosition({
          x: dragState.originX + deltaX,
          y: dragState.originY + deltaY,
        });
      positionRef.current = next;
      setPosition(next);
    },
    []
  );

  const stopDragging = useCallback(() => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDragging);
    window.removeEventListener("pointercancel", stopDragging);

    if (dragState.dragged) {
      suppressOpenRef.current = true;
      const nextPosition = clampPosition(positionRef.current);
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      persistPosition(nextPosition);
      window.setTimeout(() => {
        suppressOpenRef.current = false;
      }, 140);
    }

    dragStateRef.current = null;
  }, [handlePointerMove, persistPosition]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 && event.pointerType !== "touch") return;

      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
        dragged: false,
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);
    },
    [handlePointerMove, position.x, position.y, stopDragging]
  );

  const loadCopilot = useCallback(
    async (force = false) => {
      if (!activeShopId || !cacheKey) return;

      setLoading(true);
      setError(null);

      try {
        if (!online && !force) {
          throw new Error("offline");
        }

        const response = await fetch(
          `/api/owner/copilot?shopId=${encodeURIComponent(activeShopId)}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`http_${response.status}`);
        }

        const nextPayload = (await response.json()) as CopilotPayload;
        setPayload(nextPayload);
        safeLocalStorageSet(cacheKey, JSON.stringify(nextPayload));
      } catch (fetchError) {
        const cached = safeLocalStorageGet(cacheKey);
        if (cached) {
          try {
            setPayload(JSON.parse(cached) as CopilotPayload);
            setError(
              online
                ? "সর্বশেষ snapshot দেখানো হচ্ছে। নতুন summary এই মুহূর্তে আনা যায়নি।"
                : "অফলাইন snapshot দেখানো হচ্ছে।"
            );
          } catch {
            setError("Smart Copilot এই মুহূর্তে লোড করা যাচ্ছে না।");
          }
        } else {
          setError(
            online
              ? "Smart Copilot এই মুহূর্তে লোড করা যাচ্ছে না।"
              : "অফলাইনে cached copilot snapshot পাওয়া যায়নি।"
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [activeShopId, cacheKey, online]
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab("insights");
    void loadCopilot();
  }, [loadCopilot, open]);

  const insight = useMemo(() => {
    if (!payload || !activeShopId) return null;
    return buildOwnerCopilotInsight(activeShopId, payload.summary, payload.snapshot);
  }, [activeShopId, payload]);

  const generatedLabel = useMemo(() => {
    if (!payload?.generatedAt) return null;
    const generatedAt = new Date(payload.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) return null;
    return new Intl.DateTimeFormat("bn-BD", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(generatedAt);
  }, [payload?.generatedAt]);

  const launcherMeta = useMemo(() => {
    if (!insight) {
      return {
        badge: "আজকের insight",
        caption: "খুলুন",
      };
    }

    if (insight.actionNotes.length > 0) {
      return {
        badge: `${insight.actionNotes.length} action`,
        caption: insight.priorityLabel,
      };
    }

    return {
      badge: insight.badge,
      caption: insight.priorityLabel,
    };
  }, [insight]);

  const showCollapsedOnLeft =
    position.x < (typeof window !== "undefined" ? window.innerWidth / 2 : 99999);

  if (!mounted || !visible) return null;

  return (
    <>
      <div
        className="fixed z-[55] print:hidden"
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
      >
        {visiblePreference ? (
          <div className="group relative">
            <button
              type="button"
              aria-label="Smart Copilot খুলুন"
              title="Smart Copilot খুলুন"
              onPointerDown={handlePointerDown}
              onClick={() => {
                if (suppressOpenRef.current) return;
                setOpen(true);
              }}
              aria-expanded={open}
              className="relative flex h-11 w-auto min-w-[124px] touch-none items-center gap-2 rounded-full border border-primary/15 bg-background/94 px-3 text-left text-primary shadow-[0_16px_34px_rgba(15,23,42,0.14)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_40px_rgba(13,148,136,0.22)] active:scale-[0.98] sm:h-[56px] sm:min-w-[228px] sm:gap-3 sm:px-3"
            >
              <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(45,212,191,0.16),transparent_58%)]" />
              <ChevronLeft className="pointer-events-none h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
              <span className="pointer-events-none truncate text-[14px] font-semibold text-foreground sm:hidden">
                Copilot
              </span>
              <CopilotMoodOrb tone={insight?.tone ?? "primary"} className="pointer-events-none hidden shrink-0 sm:inline-flex" />
              <span className="pointer-events-none hidden min-w-0 flex-1 sm:flex sm:flex-col sm:justify-center">
                <span className="truncate text-[13px] font-semibold leading-4 text-foreground">
                  Smart Copilot
                </span>
                <span className="truncate text-[11px] font-medium leading-4 text-muted-foreground">
                  {launcherMeta.caption}
                </span>
              </span>
              <span className="pointer-events-none hidden items-center rounded-full border border-primary/10 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary sm:inline-flex">
                {launcherMeta.badge}
              </span>
              <span className="pointer-events-none absolute bottom-0.5 left-1/2 inline-flex -translate-x-1/2 items-center justify-center rounded-full bg-muted/80 px-1 py-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:static sm:translate-x-0 sm:opacity-70 sm:bg-transparent sm:px-0 sm:py-0">
                <GripVertical className="h-2.5 w-2.5" />
              </span>
            </button>
            <button
              type="button"
              aria-label="Smart Copilot লুকান"
              title="Smart Copilot লুকান"
              className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-sm transition hover:text-foreground sm:right-1 sm:top-1"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                setLauncherVisible(false);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Smart Copilot আবার দেখান"
            title="Smart Copilot আবার দেখান"
            onClick={() => setLauncherVisible(true)}
            className={`group relative flex h-10 items-center gap-1.5 rounded-full border border-primary/15 bg-background/94 px-2 text-primary shadow-[0_14px_28px_rgba(15,23,42,0.12)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_34px_rgba(13,148,136,0.18)] ${
              showCollapsedOnLeft ? "pr-2.5" : "pl-2.5"
            }`}
          >
            <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(45,212,191,0.14),transparent_58%)]" />
            {showCollapsedOnLeft ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="hidden text-[11px] font-semibold text-foreground sm:inline">
              Copilot
            </span>
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          forceMount
          overlayClassName="bg-black/55 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:[animation-duration:260ms] data-[state=closed]:[animation-duration:380ms] data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:[animation-timing-function:cubic-bezier(0.22,1,0.36,1)]"
          className="bottom-0 left-0 right-0 top-auto z-[70] flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-3xl border-border/70 bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg will-change-transform will-change-opacity data-[state=closed]:slide-out-to-bottom-[4%] data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-[10%] data-[state=open]:fade-in-0 data-[state=open]:[animation-duration:320ms] data-[state=closed]:[animation-duration:520ms] data-[state=open]:[animation-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:[animation-timing-function:cubic-bezier(0.22,1,0.36,1)] sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:h-[calc(100vh-2rem)] sm:w-[min(560px,calc(100vw-2rem))] sm:max-h-none sm:overflow-hidden sm:rounded-3xl sm:border sm:p-4 sm:translate-x-0 sm:translate-y-0 sm:data-[state=closed]:slide-out-to-right-[3%] sm:data-[state=closed]:slide-out-to-top-0 sm:data-[state=open]:slide-in-from-right-[7%] sm:data-[state=open]:slide-in-from-top-0"
        >
          <DialogHeader className={`shrink-0 ${activeTab === "ask" ? "space-y-0 pb-0" : "space-y-1.5 pb-0"}`}>
            <div className={`flex items-start gap-2 pr-10 ${activeTab === "ask" ? "pb-1" : ""}`}>
              <div className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                স্মার্ট কপাইলট
              </div>
              <RefreshIconButton
                onClick={() => void loadCopilot(true)}
                loading={loading}
                label="রিফ্রেশ"
                showLabelOnMobile
                className={`ml-auto shrink-0 ${activeTab === "ask" ? "h-9 px-2.5 text-xs" : "h-10 px-3"}`}
              />
            </div>
            {activeTab === "insights" ? (
              <DialogTitle className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                এক নজরে দোকানের অবস্থা দেখুন
              </DialogTitle>
            ) : null}
            {activeTab === "insights" ? (
              <DialogDescription className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {payload?.snapshot.shopName
                  ? `${payload.snapshot.shopName}-এর আজকের অবস্থা, কী সমস্যা আর কী করবেন, সব একসাথে দেখুন।`
                  : "আজকের অবস্থা, কী সমস্যা আর কী করবেন, সব একসাথে দেখুন।"}
              </DialogDescription>
            ) : null}
            {generatedLabel && activeTab === "insights" ? (
              <div className="text-xs font-medium text-muted-foreground">
                সর্বশেষ আপডেট: {generatedLabel}
              </div>
            ) : null}
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden pb-1">
            {loading && !insight ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-muted/20">
                <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Smart Copilot loading হচ্ছে...
                </div>
              </div>
            ) : null}

            <div className="inline-flex w-full rounded-2xl border border-border/70 bg-muted/35 p-1 shadow-sm sm:p-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("insights")}
                aria-pressed={activeTab === "insights"}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition sm:px-4 sm:py-2.5 ${
                  activeTab === "insights"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Insights
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ask")}
                aria-pressed={activeTab === "ask"}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition sm:px-4 sm:py-2.5 ${
                  activeTab === "ask"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ask
              </button>
            </div>

            <div
              className={activeTab === "insights" ? "min-h-0 flex-1 overflow-y-auto pr-1" : "hidden"}
              aria-hidden={activeTab !== "insights"}
            >
              {insight ? <CopilotInsightPanel insight={insight} /> : null}
            </div>

            <div
              className={activeTab === "ask" ? "min-h-0 flex-1" : "hidden"}
              aria-hidden={activeTab !== "ask"}
            >
              <CopilotErrorBoundary>
                {activeShopId ? (
                  <CopilotVoiceAsk
                    shopId={activeShopId}
                    shopName={payload?.snapshot.shopName ?? null}
                    online={online}
                  />
                ) : null}
              </CopilotErrorBoundary>
            </div>

            {error ? (
              <div className="shrink-0 rounded-2xl border border-warning/25 bg-warning-soft/50 px-4 py-3 text-sm font-medium text-foreground">
                {error}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
