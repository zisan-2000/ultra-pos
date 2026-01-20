"use client";

import { useState, useEffect } from "react";
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
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show install prompt after 2 seconds
      setTimeout(() => {
        if (!isInstalled) {
          setShowInstallPrompt(true);
        }
      }, 2000);
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
    };
  }, [isInstalled]);

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
  };

  const handleInstallLater = () => {
    setShowInstallPrompt(false);
    // Show again after 1 day
    localStorage.setItem('pwa-install-later', Date.now().toString());
  };

  // Check if user has dismissed or asked for later
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    const later = localStorage.getItem('pwa-install-later');
    
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const weekInMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedTime < weekInMs) {
        setShowInstallPrompt(false);
      }
    }
    
    if (later) {
      const laterTime = parseInt(later);
      const dayInMs = 24 * 60 * 60 * 1000;
      if (Date.now() - laterTime < dayInMs) {
        setShowInstallPrompt(false);
      }
    }
  }, []);

  if (isInstalled || !showInstallPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <Dialog open={showInstallPrompt} onOpenChange={setShowInstallPrompt}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-bold text-black">
            Install My POS
          </DialogTitle>
          <DialogDescription className="text-base text-gray-600 mt-2">
            Install our POS app on your device for faster access and a better experience
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-4 py-4">
          <div className="w-20 h-20 bg-black rounded-2xl flex items-center justify-center">
            <span className="text-white text-2xl font-bold">POS</span>
          </div>
          
          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">
              ✓ Works offline<br/>
              ✓ Faster loading<br/>
              ✓ Full screen experience<br/>
              ✓ No browser tabs needed
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Button 
            onClick={handleInstallClick}
            className="flex-1 bg-black text-white hover:bg-gray-800 text-base py-3"
            size="lg"
          >
            Install Now
          </Button>
          
          <Button 
            variant="outline" 
            onClick={handleInstallLater}
            className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50 text-base py-3"
            size="lg"
          >
            Later
          </Button>
          
          <Button 
            variant="ghost" 
            onClick={handleDismiss}
            className="text-gray-500 hover:text-gray-700 text-base py-3"
            size="lg"
          >
            Dismiss
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
