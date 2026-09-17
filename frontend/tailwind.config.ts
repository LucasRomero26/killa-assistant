import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-surface": "var(--bg-surface)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-input": "var(--bg-input)",
        border: "var(--border)",
        "border-hover": "var(--border-hover)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-hover": "var(--accent-hover)",
        "accent-foreground": "var(--accent-foreground)",
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        full: "9999px",
      },
      spacing: {
        sidebar: "248px",
        gutter: "1.25rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        xl: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em", fontWeight: "600" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em", fontWeight: "600" }],
        "3xl": ["2rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em", fontWeight: "700" }],
        "4xl": ["2.5rem", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "700" }],
      },
      boxShadow: {
        glow: "0 0 0 1px var(--accent-ring), 0 8px 30px -8px var(--accent-glow)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 10px 30px -18px rgb(0 0 0 / 0.8)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 320ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
