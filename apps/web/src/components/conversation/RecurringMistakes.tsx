import type { ConversationMistake } from "@/lib/conversationTypes";

export function RecurringMistakes({ items }: { items: ConversationMistake[] }) {
  if (items.length === 0) return null;
  return (
    <section className="iv-card" aria-label="Lỗi lặp lại">
      <h3 className="iv-card-title">Lỗi lặp lại</h3>
      {items.map((m, i) => (
        <div key={i} className="cv-mistake">
          <strong>{m.pattern}</strong>
          {m.examples.map((e, j) => (
            <p key={j} className="cv-example">
              <del>{e.said}</del> → <ins>{e.better}</ins>
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}
