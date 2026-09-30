import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CODEEDGE — Business workspace", template: "%s | CODEEDGE" },
  description: "Your CODEEDGE business workspace.",
  robots: { index: false, follow: false },
  icons: { icon: "/assets/favicon.svg" },
};
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB"><body>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <Link className="brand" href="/dashboard" aria-label="Codeedge dashboard">
        <Image className="brand-logo" src="/assets/logo.svg" alt="Codeedge" width={150} height={38} priority />
      </Link>
      <span className="header-note">Your business workspace</span>
    </header>
    {children}
    <footer className="footer">Codeedge · One Business. One System. One Control Centre.</footer>
  </body></html>;
}
