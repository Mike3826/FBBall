export const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/live", label: "Live" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
  { href: "/daily-rankings", label: "Daily" },
  { href: "/weekly-rankings", label: "Weekly" },
  { href: "/season", label: "Season" },
  { href: "/analytics", label: "Analytics" },
  { href: "/transactions", label: "Transactions" },
  { href: "/history", label: "History" },
] as const;

/** Nav items worth listing as section cards on the home page (everything but Home itself). */
export const SECTION_ITEMS = NAV_ITEMS.filter((i) => i.href !== "/");
