export type CopilotReplyLanguage = "bn" | "en";

export function inferCopilotReplyLanguage(question: string): CopilotReplyLanguage {
  const text = String(question || "").trim();
  if (!text) return "bn";

  if (/[\u0980-\u09FF]/.test(text)) {
    return "bn";
  }

  return "en";
}

export function getCopilotLanguageInstruction(question: string) {
  return inferCopilotReplyLanguage(question) === "en"
    ? "Answer in simple English. Keep the tone concise, practical, and business-friendly."
    : "Answer in simple Bengali for Bangladeshi shop owners. Keep the tone concise, practical, and business-friendly.";
}
