import type { WhyPoint } from "@/lib/conversationTypes";

export function WhyList({ points }: { points: WhyPoint[] }) {
  return (
    <ul className="cv-why">
      {points.map((p, i) => (
        <li key={i}>
          <strong>{p.part}</strong>: {p.reason}
        </li>
      ))}
    </ul>
  );
}
