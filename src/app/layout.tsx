import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crow.asia",
  description: "Leadership books in your language",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
