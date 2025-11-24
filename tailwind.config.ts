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
        background: "var(--background)",
        foreground: "var(--foreground)",

        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",

        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",

        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",

        border: "var(--border)",

        success: "var(--success)",
        warning: "var(--warning)",
        destructive: "var(--destructive)",
      },
    },
  },
  plugins: [],
};

export default config;
