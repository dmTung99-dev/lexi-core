"use client";

import { useRef, useState } from "react";

export interface SimpleDropdownOption<T extends string> {
  value: T;
  label: string;
}

interface SimpleDropdownProps<T extends string> {
  triggerLabel: string;
  ariaLabel: string;
  options: SimpleDropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  active: boolean;
}

export function SimpleDropdown<T extends string>({
  triggerLabel,
  ariaLabel,
  options,
  value,
  onChange,
  active,
}: SimpleDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [alignEnd, setAlignEnd] = useState(false);

  return (
    <div className="vb-topic-popover-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`vb-chip${active ? " active" : ""}`}
        onClick={() => {
          if (!open && wrapRef.current) {
            // The popover is 320px wide (narrower on phones) and opens from the trigger's left edge;
            // right-align it when that would pass the scroll container's right edge.
            const width = Math.min(320, window.innerWidth - 32);
            const container = wrapRef.current.closest(".main") as HTMLElement | null;
            const rightEdge = container ? container.getBoundingClientRect().right : window.innerWidth;
            setAlignEnd(wrapRef.current.getBoundingClientRect().left + width > rightEdge);
          }
          setOpen((o) => !o);
        }}
      >
        {triggerLabel} ▾
      </button>
      {open && (
        <div className={`vb-topic-popover${alignEnd ? " align-end" : ""}`} role="listbox" aria-label={ariaLabel}>
          <div className="vb-topic-popover-opts simple-dropdown-opts">
            {options.map((opt) => (
              <button
                type="button"
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                className={`vb-chip${opt.value === value ? " active" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
