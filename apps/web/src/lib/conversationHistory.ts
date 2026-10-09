import { CONDENSE_THRESHOLD, RECENT_WINDOW, type ConversationMessage } from "./conversationTypes";

/** Messages not yet folded into `summary`. The summary covers
 * messages[0..summarizedCount), so summary + this window is the whole chat. */
export function unsummarizedWindow(messages: ConversationMessage[], summarizedCount: number): ConversationMessage[] {
  return messages.slice(summarizedCount);
}

export function shouldCondense(messageCount: number, summarizedCount: number): boolean {
  return messageCount - summarizedCount >= CONDENSE_THRESHOLD;
}

/** Folds everything except the last RECENT_WINDOW messages. `newCount` is an
 * absolute index, so it stays valid even if more messages arrive while the
 * condense call is in flight. */
export function planCondense(
  messages: ConversationMessage[],
  summarizedCount: number
): { toFold: ConversationMessage[]; newCount: number } | null {
  if (!shouldCondense(messages.length, summarizedCount)) return null;
  const newCount = messages.length - RECENT_WINDOW;
  return { toFold: messages.slice(summarizedCount, newCount), newCount };
}
