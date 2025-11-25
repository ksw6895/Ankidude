/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          900: "#0f3f3b",
          800: "#0F766E",
          600: "#149c90"
        },
        slate: {
          950: "#0b1526",
          900: "#0f172a",
          700: "#475569",
          500: "#64748b"
        },
        sand: {
          50: "#f7f7f3",
          100: "#f4f5f8"
        }
      },
      boxShadow: {
        "glass": "0 24px 60px -35px rgba(15, 23, 42, 0.45)",
        "card": "0 15px 40px -25px rgba(15, 23, 42, 0.32)"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200px 0" },
          "100%": { backgroundPosition: "200px 0" }
        }
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 1.8s ease-in-out infinite"
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};
