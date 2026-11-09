export interface MemorySwitchProps {
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}

export function MemorySwitch({ checked, onChange, disabled }: MemorySwitchProps) {
  return (
    <label className="iv-row iv-checkbox memory-switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="memory-switch-text">
        <span>Dùng trí nhớ</span>
        <span className="iv-muted">AI dựa vào những gì đã học trước đó. Tắt vẫn ghi nhớ sau buổi.</span>
      </span>
    </label>
  );
}
