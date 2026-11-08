/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /*
         * Page background. Flips between near black and near white, so it is
         * only ever used for the app canvas and the bars that sit on it.
         */
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        /*
         * The grey ramp: surfaces, borders and text. The light theme flips the
         * whole ramp, so `bg-ink-900` stays "the raised surface" and
         * `text-ink-400` stays "muted text" in both themes.
         *
         * 950 is deliberately left out of the ramp: it is the literal deepest
         * ink, used for scrims over photos, immersive full-screen surfaces and
         * text/icons drawn on the neon accent — all of which read dark in both
         * themes.
         */
        ink: {
          950: '#06070A',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          750: 'rgb(var(--ink-750) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
        },
        /*
         * `white` is the foreground ink: white on the dark theme, near black on
         * the light one. Anything drawn on top of a photo must not flip, so use
         * the literal `photo` white inside a `.force-dark` scope instead.
         */
        white: 'rgb(var(--fg) / <alpha-value>)',
        photo: '#FFFFFF',
        /*
         * The accents keep their hue but darken on the light theme, where a
         * pure #EC1350 or #6FD3FF would disappear against a white surface.
         * The gradient backgrounds stay literal so buttons keep the brand look.
         */
        neon: {
          DEFAULT: 'rgb(var(--neon) / <alpha-value>)',
          soft: 'rgb(var(--neon-soft) / <alpha-value>)',
          lime: '#FF8AA2',
          aqua: '#E3124C',
          dark: '#8B0028',
        },
        sky: {
          DEFAULT: 'rgb(var(--sky) / <alpha-value>)',
          soft: 'rgb(var(--sky-soft) / <alpha-value>)',
          deep: '#1A8FC4',
        },
        rose: 'rgb(var(--rose) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
      },
      opacity: {
        3: '0.03',
        6: '0.06',
        8: '0.08',
        12: '0.12',
        15: '0.15',
        18: '0.18',
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        glow: '0 0 30px rgba(236, 19, 80, 0.3)',
        'glow-sm': '0 0 18px rgba(236, 19, 80, 0.24)',
        card: 'var(--shadow-card)',
        'card-warm':
          '0 34px 90px -30px rgba(0, 0, 0, 0.9), 0 18px 50px -32px rgba(236, 19, 80, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
        float: 'var(--shadow-float)',
      },
      backgroundImage: {
        'neon-gradient': 'linear-gradient(135deg, #FF8AA2 0%, #EC1350 52%, #D80B47 100%)',
        'plus-gradient': 'linear-gradient(120deg, #FF8AA2 0%, #EC1350 40%, #6FD3FF 100%)',
        'card-fade':
          'linear-gradient(to top, rgba(8, 6, 10, 0.97) 0%, rgba(8, 6, 10, 0.86) 22%, rgba(8, 6, 10, 0.52) 52%, rgba(8, 6, 10, 0.16) 78%, transparent 100%)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        'typing-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '30%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        'confetti-fall': {
          '0%': { transform: 'translate3d(0,-20px,0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translate3d(var(--dx), 100vh, 0) rotate(720deg)', opacity: '0' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(18px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'typing-dot': 'typing-dot 1.2s infinite',
        'confetti-fall': 'confetti-fall 3s linear forwards',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up': 'slide-up 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
