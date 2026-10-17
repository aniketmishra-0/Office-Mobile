"use client";

import { useMemo } from "react";
import { getFormTheme } from "@/lib/formThemes";
import type { FormTheme } from "@/lib/formThemes";

interface Props {
  designId: string | undefined | null;
  children: React.ReactNode;
}

/**
 * Wraps the form fill page and injects CSS custom properties
 * based on the selected form design theme.
 */
export default function FormThemeWrapper({ designId, children }: Props) {
  const theme = useMemo(() => getFormTheme(designId), [designId]);

  const isDark = useMemo(() => {
    if (["midnight", "neon", "cyberpunk", "terminal", "slate"].includes(theme.id)) return true;
    const bg = (theme.styles.pageBg || "").toLowerCase();
    return bg.includes("#0") || bg.includes("#1") || bg.includes("#2") || bg.includes("rgb(1") || bg.includes("rgb(2");
  }, [theme]);

  const cssVars = useMemo(() => ({
    "--ft-page-bg": theme.styles.pageBg,
    "--ft-card-bg": theme.styles.cardBg,
    "--ft-card-border": theme.styles.cardBorder,
    "--ft-card-shadow": theme.styles.cardShadow,
    "--ft-card-radius": theme.styles.cardRadius,
    "--ft-font-family": theme.styles.fontFamily,
    "--ft-title-color": theme.styles.titleColor,
    "--ft-label-color": theme.styles.labelColor,
    "--ft-text-color": theme.styles.textColor,
    "--ft-placeholder-color": theme.styles.placeholderColor,
    "--ft-input-bg": theme.styles.inputBg,
    "--ft-input-border": theme.styles.inputBorder,
    "--ft-input-focus-border": theme.styles.inputFocusBorder,
    "--ft-input-focus-ring": theme.styles.inputFocusRing,
    "--ft-input-radius": theme.styles.inputRadius,
    "--ft-input-text": theme.styles.inputText,
    "--ft-button-bg": theme.styles.buttonBg,
    "--ft-button-text": theme.styles.buttonText,
    "--ft-button-hover": theme.styles.buttonHover,
    "--ft-button-radius": theme.styles.buttonRadius,
    "--ft-progress-bg": theme.styles.progressBg,
    "--ft-progress-fill": theme.styles.progressFill,
    "--ft-accent": theme.styles.accentColor,
    "--ft-meta-color": theme.styles.metaColor,
    "--ft-field-bg": isDark ? "rgba(36, 32, 32, 0.85)" : "rgba(255, 255, 255, 0.95)",
    "--ft-field-focus-bg": isDark ? "#242020" : "#FFFFFF",
    "--ft-field-border": isDark ? "#35302B" : "rgba(0, 0, 0, 0.08)",
    "--ink": isDark ? (theme.styles.inputText || "#F3ECE2") : (theme.styles.textColor || "#1A1714"),
    "--on-ink": isDark ? "#1A1714" : "#FFFFFF",
    "--paper": theme.styles.cardBg,
    "--cream": theme.styles.pageBg,
    "--rule": theme.styles.inputBorder || (isDark ? "#35302B" : "#D4CECC"),
    "--stone": theme.styles.placeholderColor || (isDark ? "#7F7A71" : "#9C9488"),
    "--clay": theme.styles.accentColor || (isDark ? "#E07A50" : "#C8623A"),
    colorScheme: isDark ? "dark" : "light",
  } as React.CSSProperties), [theme, isDark]);

  const isGradientBg = theme.styles.pageBg.includes("gradient");
  const isGlassmorphism = theme.id === "glass";

  return (
    <div
      className={`form-theme-root min-h-screen ${isDark ? "dark" : ""}`}
      data-theme={isDark ? "dark" : "light"}
      style={{
        ...cssVars,
        background: theme.styles.pageBg,
        fontFamily: theme.styles.fontFamily,
        color: isDark ? (theme.styles.inputText || "#F8FAFC") : (theme.styles.textColor || "#0F172A"),
      }}
    >
      <style>{`
        .form-theme-root .ft-card {
          background: ${theme.styles.cardBg};
          border: ${theme.styles.cardBorder};
          box-shadow: ${theme.styles.cardShadow};
          border-radius: ${theme.styles.cardRadius};
          ${isGlassmorphism ? "backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);" : ""}
        }

        .form-theme-root .ft-title {
          color: ${theme.styles.titleColor};
          font-family: ${theme.styles.fontFamily};
        }

        .form-theme-root .ft-label {
          color: ${theme.styles.labelColor};
          font-family: ${theme.styles.fontFamily};
        }

        .form-theme-root .ft-input {
          background: ${theme.styles.inputBg};
          border: ${theme.styles.inputBorder};
          border-radius: ${theme.styles.inputRadius};
          color: ${theme.styles.inputText};
          font-family: ${theme.styles.fontFamily};
          font-size: 16px;
          padding: 12px 14px;
          width: 100%;
          transition: border-color 0.2s, box-shadow 0.2s;
          outline: none;
        }

        .form-theme-root .ft-input::placeholder {
          color: ${theme.styles.placeholderColor};
        }

        .form-theme-root .ft-input:focus {
          border: ${theme.styles.inputFocusBorder};
          box-shadow: ${theme.styles.inputFocusRing};
        }

        .form-theme-root .ft-textarea {
          background: ${theme.styles.inputBg};
          border: ${theme.styles.inputBorder};
          border-radius: ${theme.styles.inputRadius};
          color: ${theme.styles.inputText};
          font-family: ${theme.styles.fontFamily};
          font-size: 16px;
          padding: 12px 14px;
          width: 100%;
          min-height: 100px;
          resize: vertical;
          transition: border-color 0.2s, box-shadow 0.2s;
          outline: none;
        }

        .form-theme-root .ft-textarea:focus {
          border: ${theme.styles.inputFocusBorder};
          box-shadow: ${theme.styles.inputFocusRing};
        }

        .form-theme-root .ft-button {
          background: ${theme.styles.buttonBg};
          color: ${theme.styles.buttonText};
          border-radius: ${theme.styles.buttonRadius};
          font-family: ${theme.styles.fontFamily};
          font-weight: 600;
          font-size: 15px;
          padding: 14px 24px;
          border: none;
          cursor: pointer;
          width: 100%;
          transition: all 0.2s;
        }

        .form-theme-root .ft-button:hover:not(:disabled) {
          background: ${theme.styles.buttonHover};
          transform: translateY(-1px);
        }

        .form-theme-root .ft-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-theme-root .ft-progress {
          height: 3px;
          background: ${theme.styles.progressBg};
          border-radius: 2px;
          overflow: hidden;
        }

        .form-theme-root .ft-progress-fill {
          height: 100%;
          background: ${theme.styles.progressFill};
          transition: width 400ms ease-out;
          border-radius: 2px;
        }

        .form-theme-root .ft-meta {
          color: ${theme.styles.metaColor};
          font-size: 12px;
        }

        .form-theme-root .ft-accent {
          color: ${theme.styles.accentColor};
        }

        .form-theme-root .ft-error {
          color: #EF4444;
          font-size: 12px;
          margin-top: 4px;
        }

        .form-theme-root .ft-field-group {
          margin-bottom: 20px;
        }

        .form-theme-root .ft-required {
          color: ${theme.styles.accentColor};
        }

        /* Override global styles within themed form — crisp high-contrast text */
        .form-theme-root input,
        .form-theme-root select,
        .form-theme-root textarea,
        .form-theme-root .om-input,
        .form-theme-root .om-combobox-input,
        .form-theme-root .om-date__input {
          color: ${theme.styles.inputText || (isDark ? "#F3ECE2" : "#1A1714")} !important;
          -webkit-text-fill-color: ${theme.styles.inputText || (isDark ? "#F3ECE2" : "#1A1714")} !important;
        }

        .form-theme-root input::placeholder,
        .form-theme-root select::placeholder,
        .form-theme-root textarea::placeholder,
        .form-theme-root .om-input::placeholder,
        .form-theme-root .om-combobox-input::placeholder,
        .form-theme-root .om-date__input::placeholder {
          color: ${theme.styles.placeholderColor || (isDark ? "#7F7A71" : "#9C9488")} !important;
          -webkit-text-fill-color: ${theme.styles.placeholderColor || (isDark ? "#7F7A71" : "#9C9488")} !important;
          opacity: 1 !important;
        }

        .form-theme-root .om-field__label {
          color: ${theme.styles.labelColor || (isDark ? "#9C9488" : "#7F7A71")} !important;
        }

        /* Prevent Chrome autofill from rendering an invisible/white box */
        .form-theme-root input:-webkit-autofill,
        .form-theme-root input:-webkit-autofill:hover, 
        .form-theme-root input:-webkit-autofill:focus,
        .form-theme-root textarea:-webkit-autofill {
          -webkit-text-fill-color: ${theme.styles.inputText || (isDark ? "#F3ECE2" : "#1A1714")} !important;
          -webkit-box-shadow: 0 0 0px 1000px ${theme.styles.cardBg || (isDark ? "#242020" : "#FFFFFF")} inset !important;
          box-shadow: 0 0 0px 1000px ${theme.styles.cardBg || (isDark ? "#242020" : "#FFFFFF")} inset !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        /* High-contrast crisp text selection in themed form */
        .form-theme-root ::selection {
          background: ${theme.styles.accentColor || "#C8623A"};
          color: ${isDark ? "#1A1714" : "#FFFFFF"};
        }

        /* Header override */
        .form-theme-root .ft-header {
          background: ${isGlassmorphism ? "rgba(255,255,255,0.1)" : theme.styles.cardBg};
          border-bottom: ${theme.styles.cardBorder};
          ${isGlassmorphism ? "backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);" : ""}
        }

        .form-theme-root .ft-header-title {
          color: ${theme.styles.titleColor};
          font-family: ${theme.styles.fontFamily};
        }
      `}</style>
      {children}
    </div>
  );
}
