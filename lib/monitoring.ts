type ErrorContext = Record<string, unknown> | undefined;

async function sendWebhook(payload: any) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Failed to send error webhook", err);
  }
}

export async function reportError(error: unknown, context?: ErrorContext) {
  const asError = error instanceof Error ? error : new Error(String(error));
  const payload = {
    message: asError.message,
    stack: asError.stack,
    context,
    timestamp: new Date().toISOString(),
  };

  // Always log locally
  console.error("[error]", payload);

  // Optional webhook for centralized tracking (Slack/Discord/Axiom/Sentry ingest).
  await sendWebhook(payload);
}
