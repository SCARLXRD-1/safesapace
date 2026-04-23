import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Safespace",
  description: "Monitorización de sensores y seguridad ambiental.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="light">
      <body className="antialiased">{children}</body>
    </html>
  );
}
