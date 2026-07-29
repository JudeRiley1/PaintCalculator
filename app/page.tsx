import type { Metadata } from "next";
import { PaintCalculator } from "./paint-calculator";

export const metadata: Metadata = {
  title: "Paper + Paint — CMYK Acrylic Mix Calculator",
  description:
    "Turn Adobe CMYK colors into practical Master's Touch acrylic paint recipes for brown paper banners.",
};

export default function Home() {
  return <PaintCalculator />;
}
