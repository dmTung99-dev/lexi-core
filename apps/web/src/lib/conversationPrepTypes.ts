import type { ConversationLevel, ConversationPhrase, WhyPoint } from "./conversationTypes";

export interface PrepLine {
  speaker: "you" | "partner";
  /** Vietnamese label for the other side ("Khách hàng"); partner lines only, omitted when empty. */
  partnerRole?: string;
  en: string;
  /** Vietnamese translation; "" when the AI gave none. */
  vi: string;
}

export interface PrepPattern {
  /** Reusable frame, e.g. "I'd like to walk you through ___" or "We're on track to + V". */
  pattern: string;
  /** Vietnamese: what it does / when to use it. */
  meaning: string;
  /** Meant to be copied verbatim from one dialogue line; may be "". */
  example: string;
  why: WhyPoint[];
}

/** What the AI generates for one kit. */
export interface ConversationPrepContent {
  title: string;
  persona: string;
  goals: string[];
  dialogue: PrepLine[];
  patterns: PrepPattern[];
  vocab: ConversationPhrase[];
}

export interface NewConversationPrep extends ConversationPrepContent {
  situation: string;
  level: ConversationLevel;
}

export interface ConversationPrep extends NewConversationPrep {
  id: string;
  createdAt: string;
}

export const PREP_LIMITS = {
  minDialogue: 4,
  dialogue: 14,
  patterns: 8,
  vocab: 10,
  goals: 4,
  why: 3,
} as const;

/** Chips on the create page; tapping one fills the textarea. */
export const PREP_SUGGESTIONS: { label: string; text: string }[] = [
  { label: "Báo cáo khách hàng", text: "Tôi chuẩn bị báo cáo với khách hàng về tiến độ một task đang bị trễ." },
  { label: "Kể kỷ niệm du lịch", text: "Tôi muốn kể cho bạn bè nước ngoài về một kỷ niệm đáng nhớ trong chuyến du lịch." },
  { label: "Xin nghỉ phép", text: "Tôi muốn xin quản lý cho nghỉ phép ba ngày vào tuần sau." },
  { label: "Đặt bàn nhà hàng", text: "Tôi gọi điện đặt bàn ở nhà hàng cho sáu người vào tối thứ Bảy." },
];
