import type { Metadata, Viewport } from "next";
import {
  Space_Grotesk,
  Archivo,
  Outfit,
  Fraunces,
  Inter,
  Geist_Mono,
  Sora,
  Libre_Franklin,
  DM_Serif_Display,
  Manrope,
} from "next/font/google";
import { ThemeScript } from "@/components/theme/theme-script";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});
// Archivo is the default heading face for the "Swiss Instrument" language.
// The weight range matters: the display register uses 800, and Archivo holds a
// -0.04em track at that weight without the counters closing up.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});
// The geometric face the Bauhaus reference calls for, offered as an option.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800", "900"],
});
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});
const libreFranklin = Libre_Franklin({
  variable: "--font-libre-franklin",
  subsets: ["latin"],
});
const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  weight: "400",
});
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alan OS",
  description: "A personal, lifelong second brain — money, tasks, workouts, and more.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// Matches the Ink theme's paper/ink grounds — this is the colour Android paints
// the status bar with when the PWA is open from the home screen.
export const viewport: Viewport = {
  // Android keyboards float OVER the page by default: the layout viewport
  // keeps its full height, so a sheet sized at 85dvh stays 85% of the WHOLE
  // screen and its lower half — the capture sheet's chips and Save button —
  // ends up behind the keys. `resizes-content` makes the viewport itself
  // shrink when the keyboard opens, which is what every dvh/vh measurement and
  // every fixed element in the app is then measured against, so the sheet
  // simply gets shorter and everything in it stays reachable. iOS Safari
  // ignores the key and already behaves this way.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1F0EC" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${archivo.variable} ${outfit.variable} ${fraunces.variable} ${inter.variable} ${geistMono.variable} ${sora.variable} ${libreFranklin.variable} ${dmSerifDisplay.variable} ${manrope.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
