"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, isActivePath } from "./navItems";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="leaf" />
        LexiCore
      </div>
      <nav className="sidenav">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? `group-${i}`}>
            {group.label && <div className="grp-label">{group.label}</div>}
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={isActivePath(pathname, item.href) ? "active" : undefined}>
                {`${item.icon} ${item.label}`}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
