import type { Metadata } from "next";
import { auth, signOut, authEnabled } from "@/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gaston Caspar — Nyenrode's Academic Assistant",
  description:
    "Gaston Caspar, AI research and writing copilot for Nyenrode Business Universiteit students.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = authEnabled ? await auth() : null;

  return (
    <html lang="en">
      <body>
        <div className="app">
          <header className="topbar">
            <div className="brand">
              <img
                src="/gaston-caspar.png"
                alt="Gaston Caspar"
                className="brand-avatar"
              />
              <div className="brand-text">
                <span className="brand-name">Gaston Caspar</span>
                <span className="brand-sub">Nyenrode&apos;s Academic Assistant</span>
              </div>
            </div>
            {session?.user ? (
              <div className="user-info">
                <span className="user-name">
                  {session.user.name ?? session.user.email}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                >
                  <button className="signout-btn" type="submit">
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <span className="tagline">A Reward For Life</span>
            )}
          </header>

          {children}

          <footer className="payoff-bar">Nyenrode. A Reward For Life</footer>
        </div>
      </body>
    </html>
  );
}
