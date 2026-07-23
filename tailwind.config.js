/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 深邃午夜基底
        midnight: {
          950: "#070B16",
          900: "#0B1120",
          800: "#0F1729",
          700: "#1E293B",
        },
        // 电光青强调
        cyan: {
          glow: "#22D3EE",
          deep: "#0891B2",
        },
        // 琥珀橙警告
        amber: {
          glow: "#F59E0B",
        },
        // 玻璃白
        glass: {
          light: "rgba(255,255,255,0.10)",
          DEFAULT: "rgba(255,255,255,0.06)",
          dark: "rgba(255,255,255,0.03)",
          border: "rgba(255,255,255,0.12)",
          highlight: "rgba(255,255,255,0.15)",
        },
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      backdropBlur: {
        glass: '20px',
        xs: '4px',
      },
      backdropSaturate: {
        glass: '180%',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.37)',
        'glass-sm': '0 4px 16px rgba(0,0,0,0.25)',
        'glow-cyan': '0 0 24px rgba(34,211,238,0.35)',
        'inner-glass': 'inset 0 1px 0 rgba(255,255,255,0.15)',
      },
      backgroundImage: {
        'aurora': 'radial-gradient(circle at 20% 20%, rgba(34,211,238,0.18) 0%, transparent 45%), radial-gradient(circle at 80% 30%, rgba(168,85,247,0.16) 0%, transparent 45%), radial-gradient(circle at 50% 90%, rgba(245,158,11,0.12) 0%, transparent 50%)',
      },
      animation: {
        'float-slow': 'float 14s ease-in-out infinite',
        'float-medium': 'float 9s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'shimmer': 'shimmer 2.2s linear infinite',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(20px,-20px) scale(1.05)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.6', boxShadow: '0 0 20px rgba(34,211,238,0.25)' },
          '50%': { opacity: '1', boxShadow: '0 0 32px rgba(34,211,238,0.55)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
