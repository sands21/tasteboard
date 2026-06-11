import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { StoragePersist } from "@/components/StoragePersist";

// Geist — all UI: labels, buttons, search, dates, microcopy.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

// Instrument Serif — notes, the wordmark, empty states ONLY. Ships in one
// weight (400); loaded normal + italic since the serif voice is usually italic.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "tasteboard",
  description: "a personal design taste tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${instrumentSerif.variable}`}>
      <body>
        <StoragePersist />
        {children}
      </body>
    </html>
  );
}
