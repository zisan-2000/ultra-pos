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

export async function generateTextWithGemini({
  apiKey,
  model,
  systemInstruction,
  prompt,
  timeoutMs,
  temperature = 0.3,
}: GeminiGenerateTextOptions) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
      throw new Error(`gemini_http_${response.status}:${body.slice(0, 240)}`);
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const text = payload.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const blockReason = payload.promptFeedback?.blockReason;
      throw new Error(blockReason ? `gemini_blocked_${blockReason}` : "gemini_empty_response");
    }

    return {
      text,
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}
