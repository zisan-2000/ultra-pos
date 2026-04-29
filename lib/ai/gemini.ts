type GeminiGenerateTextOptions = {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  timeoutMs: number;
  temperature?: number;
};

type GeminiCandidatePart = {
  text?: string;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiCandidatePart[];
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1000;

function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof TypeError) return true;
  if (error instanceof Error && error.message.startsWith("gemini_http_5")) return true;
  return false;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateTextWithGemini({
  apiKey,
  model,
  systemInstruction,
  prompt,
  timeoutMs,
  temperature = 0.3,
}: GeminiGenerateTextOptions) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(BACKOFF_BASE_MS * attempt);
    }

    const perAttemptTimeout = Math.min(
      timeoutMs,
      Math.floor((timeoutMs * 0.8) / (MAX_RETRIES + 1 - attempt))
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), perAttemptTimeout);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemInstruction }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature,
            },
          }),
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const err = new Error(
          `gemini_http_${response.status}:${body.slice(0, 240)}`
        );
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw err;
      }

      const payload =
        (await response.json()) as GeminiGenerateContentResponse;
      const text = payload.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!text) {
        const blockReason = payload.promptFeedback?.blockReason;
        throw new Error(
          blockReason
            ? `gemini_blocked_${blockReason}`
            : "gemini_empty_response"
        );
      }

      return {
        text,
        model,
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES && isRetryable(error)) {
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}
