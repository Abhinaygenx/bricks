import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      colors: {
        brick: { DEFAULT: "#A63D2F", 50: "#FBF1EF", 100: "#F5DDD8", 600: "#A63D2F", 700: "#8A3125", 800: "#6E271E" },
        charcoal: { DEFAULT: "#252525", 600: "#3A3A3A", 400: "#6B6B6B" },
        offwhite: "#F8F7F5",
        beige: { DEFAULT: "#E8DCC8", 50: "#F6F1E8", 200: "#E8DCC8", 400: "#C9B48F" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Noto Sans", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(37,37,37,0.04), 0 4px 12px rgba(37,37,37,0.04)" },
    },
  },
  plugins: [animate],
};
export default config;
