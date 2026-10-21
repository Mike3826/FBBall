import Link from "next/link";

/**
 * Renders a link to a player's page when we have a Fantrax id, otherwise plain text.
 * Works in both server and client components.
 */
export default function PlayerLink({
  id,
  children,
  className = "",
}: {
  id: string | null | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  if (!id) return <span className={className}>{children}</span>;
  return (
    <Link href={`/players/${id}`} className={`hover:text-gold hover:underline ${className}`}>
      {children}
    </Link>
  );
}
