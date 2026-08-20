import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#091426',
          container: '#1e293b',
          fixed: '#d8e3fb',
          'fixed-dim': '#bcc7de',
        },
        secondary: {
          DEFAULT: '#505f76',
          container: '#d0e1fb',
          fixed: '#d3e4fe',
          'fixed-dim': '#b7c8e1',
        },
        surface: {
          DEFAULT: '#f8fafc',
          bright: '#ffffff',
          dim: '#d8dadc',
          container: {
            lowest: '#ffffff',
            low: '#f2f4f6',
            DEFAULT: '#eceef0',
            high: '#e6e8ea',
            highest: '#e0e3e5',
          },
          outline: '#e2e8f0',
          tint: '#545f73',
        },
        'on-surface': {
          DEFAULT: '#191c1e',
          variant: '#45474c',
        },
        'on-primary': {
          DEFAULT: '#ffffff',
          container: '#8590a6',
        },
        'on-secondary': {
          DEFAULT: '#ffffff',
          container: '#54647a',
        },
        status: {
          available: '#10b981',
          busy: '#f59e0b',
          blocked: '#ef4444',
          completed: '#3b82f6',
          preferred: '#8b5cf6',
          unavailable: '#94a3b8',
        },
        outline: {
          DEFAULT: '#75777d',
          variant: '#c5c6cd',
        },
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        unit: '4px',
        'container-padding': '1.5rem',
        'sidebar-width': '260px',
        'row-height-dense': '32px',
        'row-height-standard': '44px',
        gutter: '1rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
