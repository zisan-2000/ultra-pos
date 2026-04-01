"use client";

type CopilotMoodTone = "success" | "warning" | "danger" | "primary";

const toneClasses: Record<
  CopilotMoodTone,
  {
    shell: string;
    face: string;
    eye: string;
    ring: string;
    mouth: string;
    aura: string;
  }
> = {
  success: {
    shell:
      "bg-[linear-gradient(135deg,rgba(22,163,74,0.98),rgba(13,148,136,0.94))]",
    face: "bg-white/92",
    eye: "bg-emerald-700",
    ring: "ring-emerald-200/70",
    mouth: "border-emerald-700",
    aura: "bg-emerald-400/20",
  },
  primary: {
    shell:
      "bg-[linear-gradient(135deg,rgba(13,148,136,0.98),rgba(8,145,178,0.92))]",
    face: "bg-white/92",
    eye: "bg-cyan-700",
    ring: "ring-cyan-200/70",
    mouth: "border-cyan-700",
    aura: "bg-cyan-400/20",
  },
  warning: {
    shell:
      "bg-[linear-gradient(135deg,rgba(245,158,11,0.98),rgba(251,191,36,0.92))]",
    face: "bg-white/94",
    eye: "bg-amber-800",
    ring: "ring-amber-200/70",
    mouth: "border-amber-800",
    aura: "bg-amber-400/20",
  },
  danger: {
    shell:
      "bg-[linear-gradient(135deg,rgba(239,68,68,0.98),rgba(244,63,94,0.92))]",
    face: "bg-white/94",
    eye: "bg-rose-800",
    ring: "ring-rose-200/70",
    mouth: "border-rose-800",
    aura: "bg-rose-400/20",
  },
};

function Mouth({ tone }: { tone: CopilotMoodTone }) {
  if (tone === "danger") {
    return (
      <span
        className={`absolute bottom-[7px] left-1/2 h-[2px] w-[11px] -translate-x-1/2 rounded-full ${toneClasses[tone].eye}`}
      />
    );
  }

  if (tone === "warning") {
    return (
      <span
        className={`absolute bottom-[6px] left-1/2 h-[5px] w-[12px] -translate-x-1/2 rounded-b-full border-b-2 ${toneClasses[tone].mouth}`}
      />
    );
  }

  return (
    <span
      className={`absolute bottom-[5px] left-1/2 h-[7px] w-[14px] -translate-x-1/2 rounded-b-full border-b-2 ${toneClasses[tone].mouth}`}
    />
  );
}

export default function CopilotMoodOrb({
  tone = "primary",
  className = "",
}: {
  tone?: CopilotMoodTone;
  className?: string;
}) {
  const palette = toneClasses[tone];

  return (
    <span className={`relative inline-flex h-9 w-9 items-center justify-center ${className}`}>
      <span className={`absolute inset-0 rounded-full blur-md ${palette.aura}`} />
      <span
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full shadow-[0_10px_22px_rgba(15,23,42,0.16)] ring-2 ${palette.ring} ${palette.shell}`}
      >
        <span className={`relative inline-flex h-6.5 w-6.5 rounded-full ${palette.face}`}>
          <span className={`absolute left-[6px] top-[7px] h-[3px] w-[3px] rounded-full ${palette.eye}`} />
          <span className={`absolute right-[6px] top-[7px] h-[3px] w-[3px] rounded-full ${palette.eye}`} />
          <Mouth tone={tone} />
        </span>
      </span>
    </span>
  );
}
