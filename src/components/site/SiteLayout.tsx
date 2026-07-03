import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";

/**
 * Standard site chrome: sticky TopBar + content + Footer.
 *
 * Routes that want the full app frame (landing, docs, sandbox, integration)
 * wrap their content in this. The /playground command center uses its own
 * bespoke immersive layout and opts out.
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <TopBar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
