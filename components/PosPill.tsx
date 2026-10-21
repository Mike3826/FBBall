export default function PosPill({ pos }: { pos: string }) {
  const positions = pos.split(",").map((p) => p.trim()).filter(Boolean);
  return (
    <span className="inline-flex gap-1">
      {positions.map((p) => (
        <span key={p} className={`pill pill-${p}`}>
          {p}
        </span>
      ))}
    </span>
  );
}
