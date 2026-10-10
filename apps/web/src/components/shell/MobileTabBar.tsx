"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MORE_ITEMS, TAB_ITEMS, hidesTabBar, isActivePath, isMoreActive } from "./navItems";

/**
 * Phone navigation (visible only in phone mode via CSS; always rendered).
 * Four tabs plus "Thêm", which opens a bottom sheet with the remaining areas.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // A route change always closes the sheet (without stealing focus).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        moreRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    sheetRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidesTabBar(pathname)) return null;

  const closeToMore = () => {
    setOpen(false);
    moreRef.current?.focus();
  };
  const moreActive = open || isMoreActive(pathname);

  return (
    <>
      {open && <div className="mtab-backdrop" data-testid="mtab-backdrop" onClick={closeToMore} />}
      {open && (
        <div ref={sheetRef} className="mtab-sheet" role="dialog" aria-modal="true" aria-label="Các khu vực khác">
          <ul>
            {MORE_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={active ? "active" : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <span aria-hidden="true">{item.icon}</span> {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <nav className="mtab" aria-label="Điều hướng chính">
        {TAB_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "mtab-item active" : "mtab-item"}
              aria-current={active ? "page" : undefined}
            >
              <span className="mtab-icon" aria-hidden="true">{item.icon}</span>
              <span className="mtab-label">{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreRef}
          type="button"
          className={moreActive ? "mtab-more active" : "mtab-more"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="mtab-icon" aria-hidden="true">⋯</span>
          <span className="mtab-label">Thêm</span>
        </button>
      </nav>
    </>
  );
}
