export type AiProviderName = "gemini";

export type AiProviderConfig =
  | {
      enabled: false;
      provider: null;
      model: null;
      apiKey: null;
      timeoutMs: number;
    }
  | {
      enabled: true;
      provider: AiProviderName;
      model: string;
      apiKey: string;
      timeoutMs: number;
    };

const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";
const DEFAULT_TIMEOUT_MS = 8_000;

function parseTimeoutMs(rawValue: string | undefined) {
  const numeric = Number(rawValue ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(numeric)) return DEFAULT_TIMEOUT_MS;
  return Math.min(20_000, Math.max(2_000, Math.round(numeric)));
}

export function getAiProviderConfig(): AiProviderConfig {
  const timeoutMs = parseTimeoutMs(process.env.OWNER_COPILOT_LLM_TIMEOUT_MS);
  const rawEnabled = (process.env.OWNER_COPILOT_LLM_ENABLED ?? "").trim().toLowerCase();
  const rawProvider = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  const geminiApiKey = (process.env.GEMINI_API_KEY ?? "").trim();

  const provider =
    rawProvider === "gemini" || (!rawProvider && geminiApiKey) ? "gemini" : null;
  const enabled =
    provider === "gemini" &&
    Boolean(geminiApiKey) &&
    rawEnabled !== "0" &&
    rawEnabled !== "false" &&
    rawEnabled !== "off";

  if (!enabled || !provider) {
    return {
      enabled: false,
      provider: null,
      model: null,
      apiKey: null,
      timeoutMs,
    };
  }

  return {
    enabled: true,
    provider,
    model: (process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL,
    apiKey: geminiApiKey,
    timeoutMs,
  };
}
