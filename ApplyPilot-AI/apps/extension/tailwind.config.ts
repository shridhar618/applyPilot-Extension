import type { Config } from "tailwindcss";

// Design tokens for ApplyPilot AI. Radii: sm=8 (controls), md=12 (cards), lg=16 (panels). Keep to these three.
export default {
  content: ["./popup.html", "./sidepanel.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#0B0E14", 2: "#11151D" },
        card: "#151B25", elevated: "#1B2330", line: "#283244",
        accent: { DEFAULT: "#22D3EE", violet: "#8B5CF6", warm: "#F5A623" },
        ink: { DEFAULT: "#F8FAFC", dim: "#A3ADBD" },
        ok: "#34D399", warn: "#FBBF24", bad: "#F87171",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter Variable", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px" },
      boxShadow: { card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)" },
      keyframes: { shimmer: { "100%": { transform: "translateX(100%)" } } },
      animation: { shimmer: "shimmer 1.4s infinite" },
    },
  },
} satisfies Config;
