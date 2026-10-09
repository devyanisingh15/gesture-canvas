import type { Metadata, Viewport } from "next";
// Fonts are self-hosted so builds don't depend on reaching Google Fonts.
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gesture Canvas",
  description: "A multiplayer drawing game powered by your camera and gestures. No mouse. No limits.",
};

export const viewport: Viewport = {
  themeColor: "#e8e1ff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
