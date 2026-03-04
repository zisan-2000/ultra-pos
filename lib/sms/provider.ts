type SendSmsInput = {
  to: string;
  message: string;
};

export type SendSmsResult = {
  provider: string;
  messageId?: string | null;
};

const DEFAULT_TIMEOUT_MS = 12_000;

function parseJsonSafe(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  return {
    text,
    json: parseJsonSafe(text),
  };
}

function withTimeout(timeoutMs?: number) {
  const controller = new AbortController();
  const resolvedTimeout = Math.max(1_000, timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const timer = setTimeout(() => {
    controller.abort();
  }, resolvedTimeout);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

async function sendViaMock(input: SendSmsInput): Promise<SendSmsResult> {
  const fakeId = `mock-${Date.now()}`;
  console.info("[sms:mock]", {
    to: input.to,
    message: input.message,
    messageId: fakeId,
  });
  return {
    provider: "mock",
    messageId: fakeId,
  };
}

async function sendViaTwilio(
  input: SendSmsInput,
  timeoutMs?: number
): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio config missing: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM"
    );
  }

  const body = new URLSearchParams({
    To: input.to,
    From: from,
    Body: input.message,
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const { signal, cleanup } = withTimeout(timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal,
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      const details =
        payload.json?.message || payload.text || `HTTP ${response.status}`;
      throw new Error(`Twilio send failed: ${details}`);
    }
    return {
      provider: "twilio",
      messageId:
        typeof payload.json?.sid === "string" ? payload.json.sid : null,
    };
  } finally {
    cleanup();
  }
}

async function sendViaGenericHttp(
  input: SendSmsInput,
  timeoutMs?: number
): Promise<SendSmsResult> {
  const url = process.env.SMS_HTTP_URL?.trim();
  if (!url) {
    throw new Error("Generic SMS config missing: SMS_HTTP_URL");
  }

  const method = (process.env.SMS_HTTP_METHOD || "POST").toUpperCase();
  const toField = process.env.SMS_HTTP_TO_FIELD?.trim() || "to";
  const messageField = process.env.SMS_HTTP_MESSAGE_FIELD?.trim() || "message";
  const messageIdField = process.env.SMS_HTTP_MESSAGE_ID_FIELD?.trim() || "id";
  const bodyFormat = (process.env.SMS_HTTP_BODY_FORMAT || "json")
    .trim()
    .toLowerCase();
  const toMode = (process.env.SMS_HTTP_TO_MODE || "raw").trim().toLowerCase();

  let normalizedTo = input.to;
  if (toMode === "digits") {
    normalizedTo = input.to.replace(/\D/g, "");
  } else if (toMode === "strip_plus") {
    normalizedTo = input.to.replace(/^\+/, "");
  }

  const payload: Record<string, unknown> = {
    [toField]: normalizedTo,
    [messageField]: input.message,
  };

  const extraJson = process.env.SMS_HTTP_EXTRA_JSON?.trim();
  if (extraJson) {
    const parsed = parseJsonSafe(extraJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.assign(payload, parsed);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const bearerToken = process.env.SMS_HTTP_BEARER_TOKEN?.trim();
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const customAuthHeader = process.env.SMS_HTTP_AUTH_HEADER?.trim();
  const customAuthValue = process.env.SMS_HTTP_AUTH_VALUE?.trim();
  if (customAuthHeader && customAuthValue) {
    headers[customAuthHeader] = customAuthValue;
  }

  const { signal, cleanup } = withTimeout(timeoutMs);
  try {
    let requestUrl = url;
    let body: string | undefined;
    const normalizedPayloadEntries = Object.entries(payload).map(([k, v]) => [
      k,
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v),
    ]) as Array<[string, string]>;

    if (method === "GET") {
      const params = new URLSearchParams();
      normalizedPayloadEntries.forEach(([k, v]) => params.append(k, v));
      const query = params.toString();
      requestUrl = query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
    } else if (bodyFormat === "form") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const form = new URLSearchParams();
      normalizedPayloadEntries.forEach(([k, v]) => form.append(k, v));
      body = form.toString();
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(payload);
    }

    const response = await fetch(requestUrl, {
      method,
      headers,
      body,
      signal,
    });
    const responsePayload = await readResponsePayload(response);
    if (!response.ok) {
      throw new Error(
        `Generic SMS send failed: ${
          responsePayload.text || `HTTP ${response.status}`
        }`
      );
    }
    const messageId =
      responsePayload.json &&
      typeof responsePayload.json === "object" &&
      typeof responsePayload.json[messageIdField] === "string"
        ? (responsePayload.json[messageIdField] as string)
        : null;
    return {
      provider: "generic_http",
      messageId,
    };
  } finally {
    cleanup();
  }
}

function getProviderName() {
  const raw = (process.env.SMS_PROVIDER || "").trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV === "production" ? "none" : "mock";
  }
  if (raw === "mock") return "mock";
  if (raw === "twilio") return "twilio";
  if (raw === "generic_http" || raw === "generic") return "generic_http";
  throw new Error(`Unsupported SMS_PROVIDER: ${raw}`);
}

export function resolveSmsProviderLabel() {
  return getProviderName();
}

export async function sendSms(
  input: SendSmsInput,
  options?: { timeoutMs?: number }
): Promise<SendSmsResult> {
  const provider = getProviderName();
  if (provider === "none") {
    throw new Error(
      "SMS provider is not configured. Set SMS_PROVIDER to mock/twilio/generic_http."
    );
  }
  if (provider === "mock") {
    return sendViaMock(input);
  }
  if (provider === "twilio") {
    return sendViaTwilio(input, options?.timeoutMs);
  }
  return sendViaGenericHttp(input, options?.timeoutMs);
}
