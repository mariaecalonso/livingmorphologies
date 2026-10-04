import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { Orbitron, Rajdhani } from "next/font/google";
import { DevOverlayPassThrough } from "@/components/dev-overlay-pass-through";
import { SiteNav } from "@/components/site-nav";
import { SiteDisplayControl } from "@/components/site-display-control";
import "./globals.css";
const neuropol = localFont({
  src: "./fonts/Neuropol.otf",
  variable: "--font-neuropol",
  weight: "400",
  display: "swap",
});
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "700"],
});
const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});
export const metadata: Metadata = {
  title: "Living Morphologies",
  description:
    "Skill 1 prototype: catalog criteria ranked into Physarum agent behavior for Void Field and Contained Room Within Volume.",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${neuropol.variable} ${orbitron.variable} ${rajdhani.variable} h-full antialiased`}
    >
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/rau7owf.css" />
      </head>
      <body className="min-h-full">
        <DevOverlayPassThrough />
        <SiteDisplayControl />
        <div className="site-frame">
          <div className="site-shell">
            <div className="site-edit-canvas">
              <SiteNav />
              <main className="site-main">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
