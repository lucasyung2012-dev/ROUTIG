import type { Config } from 'tailwindcss';

// As cores vêm dos tokens CSS de src/styles/index.css, assim os três temas
// (claro, escuro, automático) trocam tudo sem duplicar classes.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        'surface-3': token('surface-3'),
        line: token('line'),
        fg: token('fg'),
        muted: token('muted'),
        subtle: token('subtle'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        violet: token('violet'),
        teal: token('teal'),
        amber: token('amber'),
        rose: token('rose'),
        blue: token('blue'),
        danger: token('danger'),
        success: token('success'),
        warning: token('warning'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow) / 0.06), 0 8px 24px -12px rgb(var(--shadow) / 0.18)',
        lift: '0 2px 4px rgb(var(--shadow) / 0.08), 0 18px 40px -18px rgb(var(--shadow) / 0.35)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 10px 30px -10px rgb(var(--accent) / 0.55)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        'draw-route': { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
      },
      animation: {
        'fade-up': 'fade-up 280ms cubic-bezier(.2,.7,.2,1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(.2,.7,.2,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'draw-route': 'draw-route 1.4s cubic-bezier(.6,.1,.2,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
