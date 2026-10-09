import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Arial", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "#0A0A0F",
        foreground: "#F8F8FF",
        primary: {
          DEFAULT: "#6366F1",
          hover: "#4F46E5",
          foreground: "#F8F8FF",
        },
        secondary: {
          DEFAULT: "#1E1E2E",
          foreground: "#94A3B8",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#F8F8FF",
        },
        success: {
          DEFAULT: "#10B981",
          foreground: "#F8F8FF",
        },
        warning: {
          DEFAULT: "#F59E0B",
          foreground: "#F8F8FF",
        },
        muted: {
          DEFAULT: "#141420",
          foreground: "#94A3B8",
        },
        accent: {
          DEFAULT: "#1E1E2E",
          foreground: "#F8F8FF",
        },
        popover: {
          DEFAULT: "#141420",
          foreground: "#F8F8FF",
        },
        card: {
          DEFAULT: "#141420",
          foreground: "#F8F8FF",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
