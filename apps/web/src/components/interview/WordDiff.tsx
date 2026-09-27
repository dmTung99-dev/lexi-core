import { Fragment } from "react";
import { wordDiff } from "@/lib/wordDiff";

export function WordDiff({ before, after }: { before: string; after: string }) {
  const segments = wordDiff(before, after);
  return (
    <p className="iv-diff">
      {segments.map((s, i) => (
        <Fragment key={i}>
          {s.kind === "equal" && <span>{s.text}</span>}
          {s.kind === "removed" && <del>{s.text}</del>}
          {s.kind === "added" && <ins>{s.text}</ins>}
          {i < segments.length - 1 && " "}
        </Fragment>
      ))}
    </p>
  );
}
