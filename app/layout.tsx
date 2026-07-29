import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

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
      "A CMYK-to-acrylic mixing guide made for Master's Touch paint and brown paper banners.",
    openGraph: {
      title: "Paper + Paint",
      description: "From CMYK to acrylic — made for brown paper banners.",
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
      description: "From CMYK to acrylic — made for brown paper banners.",
      images: [`${origin}${basePath}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
