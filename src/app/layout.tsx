import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Influential — AI Influencer Studio",
  description: "Generate consistent AI influencers and short-form video on command.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Match the server-side caption font set so the in-app preview shows
            the same glyphs the libass renderer ships with. DejaVu / Liberation
            aren't on Google Fonts; they're installed in the runtime image and
            usually present as system fallbacks in the browser. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;600;700;800;900&family=Open+Sans:wght@400;600;700;800&family=Noto+Sans:wght@400;600;700;800&family=Noto+Sans+Display:wght@700;800;900&family=Noto+Serif:wght@400;700;900&family=Pacifico&family=Lobster&display=swap"
        />
      </head>
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
