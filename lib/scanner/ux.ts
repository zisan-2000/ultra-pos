"use client";

export const SCAN_IDLE_SUBMIT_MS = 120;
export const MANUAL_DUPLICATE_WINDOW_MS = 280;
export const CAMERA_DUPLICATE_WINDOW_MS = 1200;

export type ScanMarker = {
  code: string;
  at: number;
} | null;

export function isRapidDuplicateScan(
  last: ScanMarker,
  code: string,
  windowMs: number,
  now = Date.now()
) {
  return Boolean(last && last.code === code && now - last.at < windowMs);
}

export function isEditableElement(element: Element | null) {
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return (element as HTMLElement).isContentEditable === true;
}

let sharedAudioContext: AudioContext | null = null;

export function playScannerFeedbackTone(kind: "success" | "error" = "success") {
  if (typeof window === "undefined") return;
  const AudioCtor =
    window.AudioContext ||
    ((window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext as typeof AudioContext | undefined);
  if (!AudioCtor) return;

  try {
    if (!sharedAudioContext) {
      sharedAudioContext = new AudioCtor();
    }
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = kind === "success" ? "sine" : "square";
    oscillator.frequency.setValueAtTime(kind === "success" ? 880 : 220, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === "success" ? 1040 : 180,
      now + (kind === "success" ? 0.08 : 0.12)
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + (kind === "success" ? 0.12 : 0.16)
    );

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + (kind === "success" ? 0.13 : 0.17));
  } catch {
    // Ignore audio feedback failures on browsers that block autoplay/audio contexts.
  }
}
