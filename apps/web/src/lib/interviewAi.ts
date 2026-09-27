import { generateContent } from "./generateContent";
import { InterviewAiError } from "./interviewPrompts";
import type { UserSettings } from "./settings";

export function hasAiKey(settings: UserSettings | null): boolean {
  return !!settings?.providers[settings.activeProvider].apiKeyCiphertext;
}

export async function callInterviewAi(settings: UserSettings, prompt: string): Promise<string> {
  const config = settings.providers[settings.activeProvider];
  if (!config.apiKeyCiphertext) {
    throw new InterviewAiError("Chưa có API key cho nhà cung cấp AI đang chọn — vào Cài đặt để thêm.");
  }
  const response = await generateContent({
    provider: settings.activeProvider,
    model: config.model,
    apiKeyCiphertext: config.apiKeyCiphertext,
    prompt,
  });
  return response.text;
}
