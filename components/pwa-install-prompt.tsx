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

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isEngaged, setIsEngaged] = useState(false);
  const [isSuppressed, setIsSuppressed] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engagementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionCountRef = useRef(0);
  const engagementReachedRef = useRef(false);
  const autoPromptedRef = useRef(false);

  const getSuppressionState = () => {
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      const weekInMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedTime < weekInMs) return true;
    }

    const later = localStorage.getItem("pwa-install-later");
    if (later) {
      const laterTime = parseInt(later, 10);
      const dayInMs = 24 * 60 * 60 * 1000;
      if (Date.now() - laterTime < dayInMs) return true;
    }

    return false;
  };

  useEffect(() => {
    // Check if app is already installed
    const checkIfInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isInWebAppiOS = (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone || isInWebAppiOS);
    };

    checkIfInstalled();

    setIsSuppressed(getSuppressionState());

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
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    setIsSuppressed(true);
  };

  const handleInstallLater = () => {
    setShowInstallPrompt(false);
    // Show again after 1 day
    localStorage.setItem('pwa-install-later', Date.now().toString());
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
      <DialogContent className="sm:max-w-md bg-card border-border shadow-2xl">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-bold text-foreground">
            My POS অ্যাপ ইনস্টল করুন
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground mt-2">
            দ্রুত অ্যাক্সেস, অফলাইন সাপোর্ট এবং ফুল স্ক্রিন অভিজ্ঞতার জন্য ডিভাইসে ইনস্টল করুন।
          </DialogDescription>
        </DialogHeader>
          
          <div className="flex flex-col items-center space-y-4 py-4">
          <div className="w-20 h-20 rounded-2xl border border-primary/20 bg-primary-soft text-primary flex items-center justify-center shadow-sm">
            <span className="text-2xl font-bold tracking-wide">POS</span>
          </div>
            
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                - অফলাইন সাপোর্ট<br/>
                - দ্রুত লোডিং<br/>
                - ফুল স্ক্রিন মোড<br/>
                - ব্রাউজার ট্যাব ছাড়াই ব্যবহার
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <Button 
              onClick={handleInstallClick}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary-hover text-base py-3"
              size="lg"
            >
              এখনই ইনস্টল
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleInstallLater}
              className="flex-1 border-border text-foreground/80 hover:bg-muted text-base py-3"
              size="lg"
            >
              পরে করব
            </Button>
            
            <Button 
              variant="ghost" 
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground text-base py-3"
              size="lg"
            >
              এখন নয়
            </Button>
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
