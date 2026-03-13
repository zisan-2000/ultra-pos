"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

function getSuppressionState() {
  const dismissed = safeLocalStorageGet("pwa-install-dismissed");
  if (dismissed) {
    const dismissedTime = parseInt(dismissed, 10);
    const weekInMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - dismissedTime < weekInMs) return true;
  }

  const later = safeLocalStorageGet("pwa-install-later");
  if (later) {
    const laterTime = parseInt(later, 10);
    const dayInMs = 24 * 60 * 60 * 1000;
    if (Date.now() - laterTime < dayInMs) return true;
  }

  return false;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isEngaged, setIsEngaged] = useState(false);
  const [isSuppressed, setIsSuppressed] = useState(() => getSuppressionState());
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engagementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionCountRef = useRef(0);
  const engagementReachedRef = useRef(false);
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    // Check if app is already installed
    const checkIfInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isInWebAppiOS = (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone || isInWebAppiOS);
    };

    checkIfInstalled();

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const suppressed = getSuppressionState();
      setIsSuppressed(suppressed);
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
      if (engagementTimerRef.current) {
        clearTimeout(engagementTimerRef.current);
      }
    };
  }, [isInstalled]);

  useEffect(() => {
    if (isInstalled) return;

    let cleaned = false;
    const handleInteraction = () => {
      if (engagementReachedRef.current) return;
      interactionCountRef.current += 1;
      if (interactionCountRef.current >= 3) {
        markEngaged();
      }
    };

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("scroll", handleInteraction);
      if (engagementTimerRef.current) {
        clearTimeout(engagementTimerRef.current);
      }
    };

    const markEngaged = () => {
      if (engagementReachedRef.current) return;
      engagementReachedRef.current = true;
      setIsEngaged(true);
      cleanup();
    };

    engagementTimerRef.current = setTimeout(markEngaged, 45_000);
    window.addEventListener("pointerdown", handleInteraction, { passive: true });
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("scroll", handleInteraction, { passive: true });

    return cleanup;
  }, [isInstalled]);

  useEffect(() => {
    if (!deferredPrompt || isInstalled || isSuppressed || !isEngaged) return;
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
    }
    showTimerRef.current = setTimeout(() => {
      setShowInstallPrompt(true);
    }, 800);
  }, [deferredPrompt, isInstalled, isSuppressed, isEngaged]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch (error) {
      console.error('Error during installation:', error);
      setShowInstallPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    // Don't show again for 7 days
    safeLocalStorageSet("pwa-install-dismissed", Date.now().toString());
    setIsSuppressed(true);
  };

  const handleInstallLater = () => {
    setShowInstallPrompt(false);
    // Show again after 1 day
    safeLocalStorageSet("pwa-install-later", Date.now().toString());
    setIsSuppressed(true);
  };

  const canInstall = Boolean(deferredPrompt) && !isInstalled;
  const showCta = canInstall && isEngaged;

  if (!canInstall) {
    return null;
  }

  return (
    <>
      <Dialog open={showInstallPrompt} onOpenChange={setShowInstallPrompt}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md max-h-[90vh] overflow-y-auto border-border bg-card p-5 shadow-2xl sm:w-full sm:max-w-md">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-primary/20 bg-gradient-to-br from-primary-soft via-card to-primary-soft/70 text-primary shadow-sm">
                <span className="text-[22px] font-extrabold tracking-[0.06em]">POS</span>
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[1.7rem] font-black leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[2rem]">
                  My POS অ্যাপ ইনস্টল করুন
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-[15px] font-medium leading-7 text-foreground/72 sm:text-base">
                  দ্রুত খোলার জন্য আর cleaner full-screen ব্যবহারের জন্য install করুন।
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-muted/45 to-card p-4">
              <p className="text-[15px] font-bold tracking-[-0.01em] text-foreground">যা পাবেন</p>
              <div className="mt-3 grid gap-2.5">
                <div className="rounded-xl border border-border/50 bg-card px-3 py-2.5 text-[15px] font-semibold text-foreground">
                  দ্রুত open হবে
                </div>
                <div className="rounded-xl border border-border/50 bg-card px-3 py-2.5 text-[15px] font-semibold text-foreground">
                  browser tab ছাড়াই ব্যবহার করা যাবে
                </div>
                <div className="rounded-xl border border-border/50 bg-card px-3 py-2.5 text-[15px] font-semibold text-foreground">
                  full-screen এ cleaner কাজের screen পাবেন
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border/70 bg-card p-4 text-[15px] font-medium leading-6 text-foreground/68">
              এখন না চাইলে পরে আবার install করতে পারবেন।
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <Button
              onClick={handleInstallClick}
              className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary-hover"
              size="lg"
            >
              এখনই ইনস্টল
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={handleInstallLater}
                className="h-11 w-full rounded-2xl border-border text-foreground/80 hover:bg-muted"
                size="lg"
              >
                পরে করব
              </Button>
              <Button
                variant="ghost"
                onClick={handleDismiss}
                className="h-11 w-full rounded-2xl text-muted-foreground hover:text-foreground"
                size="lg"
              >
                এখন নয়
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {showCta && !showInstallPrompt ? (
        <div className="fixed bottom-5 right-5 z-40">
          <Button
            onClick={() => setShowInstallPrompt(true)}
            variant="outline"
            className="w-auto border-border bg-card/95 text-foreground shadow-lg"
          >
            অ্যাপ ইনস্টল
          </Button>
        </div>
      ) : null}
    </>
  );
}
