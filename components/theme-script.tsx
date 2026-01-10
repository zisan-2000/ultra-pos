// components/theme-script.tsx

import Script from "next/script";

const themeScript = `
(() => {
  try {
    const storageKey = "pos.theme";
    const root = document.documentElement;
    const stored = localStorage.getItem(storageKey);
    const theme = stored === "light" || stored === "dark" ? stored : "light";
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  } catch {
    // no-op
  }
})();
`;

export default function ThemeScript() {
  return (
    <Script id="theme-init" strategy="afterInteractive">
      {themeScript}
    </Script>
  );
}
