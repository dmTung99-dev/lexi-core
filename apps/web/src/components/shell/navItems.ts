export interface NavItem {
  href: string;
  icon: string;
  label: string;
  /** Shorter label for the phone tab bar, when `label` is too long. */
  shortLabel?: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", icon: "🏠", label: "Tổng quan" },
      { href: "/lookup", icon: "🔍", label: "Tra từ" },
      { href: "/vocab-bank", icon: "📚", label: "Ngân hàng từ vựng", shortLabel: "Từ vựng" },
      { href: "/practice", icon: "🎯", label: "Ôn tập" },
    ],
  },
  { label: "Đọc", items: [{ href: "/reading", icon: "📖", label: "Đọc — tổng quan" }] },
  { label: "Quét từ", items: [{ href: "/word-radar", icon: "🛰️", label: "Quét từ vựng" }] },
  { label: "Kiến thức", items: [{ href: "/knowledge", icon: "📖", label: "Kiến thức" }] },
  { label: "Nghe", items: [{ href: "/listening", icon: "🎧", label: "Nghe — tổng quan" }] },
  { label: "Phỏng vấn", items: [{ href: "/interview", icon: "🎤", label: "Phỏng vấn tiếng Anh" }] },
  { label: "Hội thoại", items: [{ href: "/conversation", icon: "💬", label: "Hội thoại tiếng Anh" }] },
  { label: "Khác", items: [{ href: "/settings", icon: "⚙️", label: "Cài đặt" }] },
];

const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
const TAB_HREFS = ["/dashboard", "/lookup", "/vocab-bank", "/practice"];

export const TAB_ITEMS: NavItem[] = TAB_HREFS.map((href) => ALL_ITEMS.find((i) => i.href === href) as NavItem);
export const MORE_ITEMS: NavItem[] = ALL_ITEMS.filter((i) => !TAB_HREFS.includes(i.href));

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreActive(pathname: string): boolean {
  return MORE_ITEMS.some((i) => isActivePath(pathname, i.href));
}

/** Live session pages have their own sticky bottom dock, so they hide the phone tab bar. */
export function hidesTabBar(pathname: string): boolean {
  return /^\/(interview|conversation)\/[^/]+$/.test(pathname);
}
