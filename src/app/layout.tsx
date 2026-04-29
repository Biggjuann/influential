import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Influential — AI Influencer Studio",
  description: "Generate consistent AI influencers and short-form video on command.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased scrollbar">
        <div className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-40">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 group">
              <span className="h-7 w-7 rounded-md bg-gradient-to-br from-accent to-accent2" />
              <span className="font-semibold tracking-tight">Influential</span>
            </a>
            <nav className="flex items-center gap-6 text-sm text-muted">
              <a href="/" className="hover:text-text">Roster</a>
              <a href="/influencers/new" className="hover:text-text">New influencer</a>
            </nav>
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
