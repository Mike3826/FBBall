import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { leagueInfo } from "@/lib/data";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: leagueInfo.leagueName,
    template: `%s · ${leagueInfo.leagueName}`,
  },
  description: `Fantasy basketball hub for ${leagueInfo.leagueName} (Fantrax).`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-screen font-sans">
        <Nav leagueName={leagueInfo.leagueName} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-xs text-slate-500 sm:px-6">
          Data sourced from{" "}
          <a
            className="underline decoration-slate-600 underline-offset-2 hover:text-slate-300"
            href={`https://www.fantrax.com/fantasy/league/${leagueInfo.leagueId}/home`}
            target="_blank"
            rel="noreferrer"
          >
            Fantrax
          </a>
          . Season {leagueInfo.seasonYear}–{String(leagueInfo.seasonYear + 1).slice(-2)}.
        </footer>
      </body>
    </html>
  );
}
