import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono } from "next/font/google";
import "./redesign.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-newsreader",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "OfficeMobile — Ink on Rice Paper",
  description: "Your Spreadsheet. Your Form.",
};

export default function RedesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`om-redesign-root ${newsreader.variable} ${plexMono.variable}`}>
      {children}
    </div>
  );
}
