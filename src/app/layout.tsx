import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CODEEDGE — Business workspace", template: "%s | CODEEDGE" },
  description: "Your CODEEDGE business workspace.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB"><body>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><Link className="brand" href="/dashboard"><span className="brand-mark" aria-hidden="true" />CODEEDGE</Link><span className="header-note">Your business workspace</span></header>
    {children}
    <footer className="footer">CODEEDGE for UK service businesses.</footer>
  </body></html>;
}
