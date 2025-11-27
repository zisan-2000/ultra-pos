// tailwind.config.ts

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./components/ui/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        /* Background & Cards */
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",

        /* Primary Blue */
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "primary-foreground": "var(--primary-foreground)",

        /* Accent Colors */
        "accent-sky": "var(--accent-sky)",
        success: "var(--success)",
        destructive: "var(--destructive)",
        warning: "var(--warning)",
        info: "var(--info)",
        highlight: "var(--highlight)",

        /* Neutral Colors */
        "header-gray": "var(--header-gray)",
        border: "var(--border)",
        "text-medium": "var(--text-medium)",
        "text-muted": "var(--text-muted)",

        /* Legacy support */
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
      },
    },
  },
  plugins: [],
};

export default config;
