import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { DevOverlayPassThrough } from "@/components/dev-overlay-pass-through";
import { SiteNav } from "@/components/site-nav";
import { SiteRail } from "@/components/site-rail";
import { SiteDisplayControl } from "@/components/site-display-control";
import "./globals.css";
const neuropol = localFont({
  src: "./fonts/Neuropol.otf",
  variable: "--font-neuropol",
  weight: "400",
  display: "swap",
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
      className={`${neuropol.variable} h-full antialiased`}
    >
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/rau7owf.css" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full">
        <DevOverlayPassThrough />
        <SiteDisplayControl />
        <div className="site-frame">
          <div className="site-shell">
            <div className="site-edit-canvas">
              <SiteRail />
              <SiteNav />
              <main className="site-main">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
