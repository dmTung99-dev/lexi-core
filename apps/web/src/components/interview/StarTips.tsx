const TIPS = [
  ["S", "Situation", "bối cảnh, ngắn gọn"],
  ["T", "Task", "bạn chịu trách nhiệm gì"],
  ["A", "Action", "việc chính bạn làm, dùng \"I\""],
  ["R", "Result", "kết quả, có số liệu càng tốt"],
] as const;

export function StarTips() {
  return (
    <section className="iv-card" aria-label="Gợi ý STAR">
      <h3 className="iv-card-title">Gợi ý trả lời theo STAR</h3>
      {TIPS.map(([letter, word, hint]) => (
        <p key={letter} className="iv-star">
          <span className="iv-star-letter">{letter}</span>
          <span><b>{word}</b> — {hint}</span>
        </p>
      ))}
    </section>
  );
}
