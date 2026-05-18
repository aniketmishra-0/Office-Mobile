/** @type {import('tailwindcss').Config} */

// ─── Ink on Rice Paper — palette tokens ─────────────────────────────────
// These hex values drive every surface in the app. They are also mapped
// onto Tailwind's legacy colour scales below so existing class names
// (zinc-*, emerald-*, red-*, amber-*, blue-*, sky-*, gray-*, purple-*,
// green-*) resolve to tones from this palette instead of the defaults.
const ink = {
  cream:       "#F7F3EE",
  paper:       "#EEE9E2",
  ink:         "#1A1714",
  charcoal:    "#2D2925",
  stone:       "#9C9488",
  rule:        "#D4CECC",
  clay:        "#C8623A",
  "clay-dark": "#A84E2C",
  error:       "#B83A3A",
};

// Neutral scale — anchors 50 (cream) → 950 (ink). Existing code liberally
// uses zinc-100/200/300/500/600/800/950; re-mapping keeps all of that
// working but renders it in warm editorial tones.
const neutral = {
  50:  ink.cream,
  100: ink.paper,
  200: ink.rule,
  300: "#BDB5AE",
  400: ink.stone,
  500: "#7E766B",
  600: "#5A524A",
  700: "#403A35",
  800: ink.charcoal,
  900: "#22201D",
  950: ink.ink,
};

// "Accent" scale — maps emerald (used for success, auto-fill confirmation,
// etc.) to a warm terracotta so the accent shows up as clay instead of
// surgical-green.
const clayScale = {
  50:  "#F7EBE4",
  100: "#EFD6C6",
  200: "#E2B195",
  300: "#D48963",
  400: ink.clay,
  500: ink.clay,
  600: ink["clay-dark"],
  700: "#8C3F22",
  800: "#6E301B",
  900: "#4F2112",
};

// Error scale — keeps red variants readable but muted.
const errorScale = {
  50:  "#F4E4E4",
  100: "#EBCCCC",
  200: "#D9A1A1",
  300: "#C97474",
  400: "#BE4F4F",
  500: ink.error,
  600: "#9C2F2F",
  700: "#7C2424",
  800: "#5E1B1B",
  900: "#3F1212",
};

// Warm muted scale for what the old design used as amber (warnings).
const warmMuted = {
  50:  "#F4EDDF",
  100: "#E9DEC3",
  200: "#D6C391",
  300: "#BFA768",
  400: "#A18846",
  500: "#846E37",
  600: "#66552A",
  700: "#4B3E1F",
  800: "#302813",
  900: "#1A1509",
};

module.exports = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // Flatten everything — the editorial look uses border contrast for
    // depth, not drop shadows.
    boxShadow: {
      DEFAULT: "none",
      none:    "none",
      inner:   "none",
      sm:      "none",
      md:      "none",
      lg:      "none",
      xl:      "none",
      "2xl":   "none",
      soft:    "none",
      medium:  "none",
      sticky:  "none",
    },
    extend: {
      colors: {
        // Canonical tokens — use these directly going forward.
        cream:       ink.cream,
        paper:       ink.paper,
        ink:         ink.ink,
        charcoal:    ink.charcoal,
        stone:       ink.stone,
        rule:        ink.rule,
        clay:        ink.clay,
        "clay-dark": ink["clay-dark"],

        // Re-map legacy Tailwind scales the existing components call into.
        zinc:    neutral,
        gray:    neutral,
        slate:   neutral,
        stone:   neutral, // yes, both `text-stone` and bare `stone` are acceptable
        neutral: neutral,

        emerald: clayScale,
        green:   clayScale,
        teal:    clayScale,

        red:     errorScale,
        rose:    errorScale,

        amber:   warmMuted,
        yellow:  warmMuted,
        orange:  clayScale,

        // Cool accents get neutralised — the spec forbids blue/purple/teal.
        blue:    neutral,
        sky:     neutral,
        indigo:  neutral,
        violet:  neutral,
        purple:  neutral,
        fuchsia: neutral,
        pink:    errorScale,

        primary: {
          DEFAULT: ink.ink,
          50:  neutral[50],
          100: neutral[100],
          200: neutral[200],
          300: neutral[300],
          400: neutral[400],
          500: neutral[500],
          600: neutral[600],
          700: neutral[700],
          800: neutral[800],
          900: neutral[900],
          950: ink.ink,
        },
        accent: {
          DEFAULT: ink.clay,
          50:  clayScale[50],
          100: clayScale[100],
          200: clayScale[200],
          300: clayScale[300],
          400: clayScale[400],
          500: clayScale[500],
          600: clayScale[600],
          700: clayScale[700],
          800: clayScale[800],
          900: clayScale[900],
        },
        surface: {
          DEFAULT:   ink.cream,
          secondary: ink.paper,
          tertiary:  "#E4DED6",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-newsreader)",
          "Georgia",
          "ui-serif",
          "serif",
        ],
        serif: [
          "var(--font-newsreader)",
          "Georgia",
          "ui-serif",
          "serif",
        ],
        mono: [
          "var(--font-plex-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      spacing: {
        "safe-top":    "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left":   "env(safe-area-inset-left)",
        "safe-right":  "env(safe-area-inset-right)",
      },
      // Major containers stay square; inputs and chips get a 4px corner.
      borderRadius: {
        none: "0",
        sm:   "0",
        DEFAULT: "0",
        md:   "4px",
        lg:   "4px",
        xl:   "4px",
        "2xl": "0",
        "3xl": "0",
        full: "9999px",
      },
      animation: {
        "fade-in":    "fadeIn 250ms ease-out forwards",
        "slide-up":   "fadeIn 250ms ease-out forwards",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.6" },
        },
      },
    },
  },
  safelist: [
    "pb-safe-bottom",
    "pt-safe-top",
  ],
  plugins: [],
};
