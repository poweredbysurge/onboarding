/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      fontSize: {
        // Floor everything at 16px — no body text smaller than this
        'xs':   ['1rem',      { lineHeight: '1.65' }], // 16px
        'sm':   ['1rem',      { lineHeight: '1.65' }], // 16px
        'base': ['1rem',      { lineHeight: '1.65' }], // 16px
        'lg':   ['1.125rem',  { lineHeight: '1.5' }],  // 18px — sub-headings
        'xl':   ['1.25rem',   { lineHeight: '1.4' }],  // 20px
        '2xl':  ['1.5rem',    { lineHeight: '1.3' }],  // 24px
        '3xl':  ['1.875rem',  { lineHeight: '1.2' }],  // 30px
        '4xl':  ['2.25rem',   { lineHeight: '1.15' }], // 36px
        '5xl':  ['3rem',      { lineHeight: '1.0' }],  // 48px
        '6xl':  ['3.75rem',   { lineHeight: '1.0' }],  // 60px
        '7xl':  ['4.5rem',    { lineHeight: '1.0' }],  // 72px
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surge: {
          bg: '#09090b',
          card: '#111113',
          green: '#dee535',
          text: '#e4e4e7',
          muted: '#a1a1aa',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
