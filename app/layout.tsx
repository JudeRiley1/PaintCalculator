import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#f7f6f3",
};

export async function generateMetadata(): Promise<Metadata> {
  let origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) {
    const requestHeaders = await headers();
    const host =
      requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host") ??
      "localhost:3000";
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (host.includes("localhost") ? "http" : "https");
    origin = `${protocol}://${host}`;
  }
  const basePath = process.env.GITHUB_PAGES_BASE_PATH ?? "";

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Paper + Paint",
      template: "%s · Paper + Paint",
    },
    description:
      "An Adobe-color-to-acrylic mixing guide made for Master's Touch paint and brown paper banners.",
    manifest: `${basePath}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Paper + Paint",
    },
    icons: {
      icon: [
        { url: `${basePath}/icon-192.png`, sizes: "192x192", type: "image/png" },
        { url: `${basePath}/icon-512.png`, sizes: "512x512", type: "image/png" },
      ],
      apple: [
        {
          url: `${basePath}/apple-touch-icon.png`,
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
    openGraph: {
      title: "Paper + Paint",
      description: "From Adobe color to acrylic — made for brown paper banners.",
      type: "website",
      images: [
        {
          url: `${origin}${basePath}/og.png`,
          width: 1792,
          height: 935,
          alt: "Paper + Paint — From CMYK to acrylic",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Paper + Paint",
      description: "From Adobe color to acrylic — made for brown paper banners.",
      images: [`${origin}${basePath}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const basePath = process.env.GITHUB_PAGES_BASE_PATH ?? "";
  const paperStyle = {
    "--paper-texture": `url("${basePath}/white-paper.webp")`,
  } as CSSProperties;

  return (
    <html lang="en">
      <body style={paperStyle}>{children}</body>
    </html>
  );
}
