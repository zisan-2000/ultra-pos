import net from "node:net";
import tls from "node:tls";
import { createInterface, type Interface } from "node:readline";
import { randomUUID } from "node:crypto";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  startTls: boolean;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
  ehloName: string;
  timeoutMs: number;
};

type MailInput = {
  to: string;
  subject: string;
  text: string;
};

type ReadQueue = {
  nextLine: (timeoutMs: number) => Promise<string>;
  close: () => void;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function parseBoolean(raw: string | undefined, fallback: boolean) {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function extractEmailAddress(raw: string) {
  const trimmed = raw.trim();
  const match = trimmed.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim();
  return trimmed;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim() || "";
  const fromRaw = process.env.SMTP_FROM?.trim() || process.env.SMTP_FROM_EMAIL?.trim() || "";
  if (!host || !fromRaw) return null;

  const port = Number(process.env.SMTP_PORT || "465");
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const startTls = parseBoolean(process.env.SMTP_STARTTLS, !secure && port === 587);
  const fromEmail = extractEmailAddress(fromRaw);
  const fromName = process.env.SMTP_FROM_NAME?.trim() || undefined;
  const ehloName =
    process.env.SMTP_EHLO_NAME?.trim() || process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "localhost";

  if (!Number.isFinite(port) || port <= 0) return null;
  if (!fromEmail.includes("@")) return null;

  const username = process.env.SMTP_USER?.trim() || undefined;
  const password = process.env.SMTP_PASS || undefined;

  return {
    host,
    port,
    secure,
    startTls,
    username,
    password,
    fromEmail,
    fromName,
    ehloName,
    timeoutMs: Number(process.env.SMTP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function createReadQueue(rl: Interface): ReadQueue {
  const buffered: string[] = [];
  let waiting:
    | {
        resolve: (line: string) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | null = null;

  const onLine = (line: string) => {
    if (waiting) {
      clearTimeout(waiting.timer);
      waiting.resolve(line);
      waiting = null;
      return;
    }
    buffered.push(line);
  };

  const onClose = () => {
    if (!waiting) return;
    clearTimeout(waiting.timer);
    waiting.reject(new Error("SMTP connection closed unexpectedly"));
    waiting = null;
  };

  rl.on("line", onLine);
  rl.on("close", onClose);

  return {
    nextLine(timeoutMs: number) {
      if (buffered.length > 0) {
        return Promise.resolve(buffered.shift()!);
      }

      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!waiting) return;
          waiting = null;
          reject(new Error("SMTP response timeout"));
        }, timeoutMs);

        waiting = { resolve, reject, timer };
      });
    },
    close() {
      rl.off("line", onLine);
      rl.off("close", onClose);
      rl.close();
      if (waiting) {
        clearTimeout(waiting.timer);
        waiting = null;
      }
    },
  };
}

async function readResponse(queue: ReadQueue, timeoutMs: number) {
  const first = await queue.nextLine(timeoutMs);
  const code = Number(first.slice(0, 3));
  if (!Number.isFinite(code)) {
    throw new Error(`Invalid SMTP response: ${first}`);
  }

  let lastLine = first;
  if (first[3] === "-") {
    while (true) {
      const line = await queue.nextLine(timeoutMs);
      lastLine = line;
      if (line.startsWith(`${code} `)) break;
    }
  }

  return { code, line: lastLine };
}

function assertCode(actual: number, expected: number[]) {
  if (expected.includes(actual)) return;
  throw new Error(`Unexpected SMTP response code ${actual}, expected ${expected.join("/")}`);
}

async function sendCommand(
  socket: net.Socket | tls.TLSSocket,
  queue: ReadQueue,
  command: string,
  expected: number[],
  timeoutMs: number
) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(queue, timeoutMs);
  assertCode(response.code, expected);
  return response;
}

function openPlainSocket(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const onError = (err: Error) => {
      socket.removeAllListeners();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error("SMTP connect timeout"));
    });
    socket.once("connect", () => {
      socket.off("error", onError);
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once("error", onError);
  });
}

function openTlsSocket(
  host: string,
  port: number,
  timeoutMs: number
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host });
    const onError = (err: Error) => {
      socket.removeAllListeners();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error("SMTP TLS connect timeout"));
    });
    socket.once("secureConnect", () => {
      socket.off("error", onError);
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once("error", onError);
  });
}

function upgradeToTls(
  socket: net.Socket,
  host: string,
  timeoutMs: number
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({ socket, servername: host });
    const onError = (err: Error) => {
      tlsSocket.removeAllListeners();
      reject(err);
    };
    tlsSocket.setTimeout(timeoutMs, () => {
      tlsSocket.destroy(new Error("SMTP STARTTLS timeout"));
    });
    tlsSocket.once("secureConnect", () => {
      tlsSocket.off("error", onError);
      tlsSocket.setTimeout(0);
      resolve(tlsSocket);
    });
    tlsSocket.once("error", onError);
  });
}

function formatFromHeader(config: SmtpConfig) {
  if (!config.fromName) return config.fromEmail;
  const safeName = config.fromName.replace(/"/g, "");
  return `"${safeName}" <${config.fromEmail}>`;
}

function toBase64Lines(input: string) {
  const encoded = Buffer.from(input, "utf8").toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < encoded.length; i += 76) {
    lines.push(encoded.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function buildMessage(config: SmtpConfig, mail: MailInput) {
  const messageId = `<${randomUUID()}@${config.ehloName || "localhost"}>`;
  const headers = [
    `From: ${formatFromHeader(config)}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];

  const body = toBase64Lines(mail.text);
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export function isSmtpConfigured() {
  return Boolean(getSmtpConfig());
}

export async function sendSmtpMail(mail: MailInput) {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP is not configured");
  }

  let socket: net.Socket | tls.TLSSocket | null = null;
  let rl: Interface | null = null;
  let queue: ReadQueue | null = null;

  try {
    socket = config.secure
      ? await openTlsSocket(config.host, config.port, config.timeoutMs)
      : await openPlainSocket(config.host, config.port, config.timeoutMs);

    rl = createInterface({ input: socket, crlfDelay: Infinity });
    queue = createReadQueue(rl);

    const greet = await readResponse(queue, config.timeoutMs);
    assertCode(greet.code, [220]);

    await sendCommand(socket, queue, `EHLO ${config.ehloName}`, [250], config.timeoutMs);

    if (!config.secure && config.startTls) {
      await sendCommand(socket, queue, "STARTTLS", [220], config.timeoutMs);

      queue.close();
      rl = null;
      queue = null;

      const upgraded = await upgradeToTls(socket as net.Socket, config.host, config.timeoutMs);
      socket = upgraded;

      rl = createInterface({ input: socket, crlfDelay: Infinity });
      queue = createReadQueue(rl);
      await sendCommand(socket, queue, `EHLO ${config.ehloName}`, [250], config.timeoutMs);
    }

    if (config.username && config.password) {
      await sendCommand(socket, queue, "AUTH LOGIN", [334], config.timeoutMs);
      await sendCommand(
        socket,
        queue,
        Buffer.from(config.username, "utf8").toString("base64"),
        [334],
        config.timeoutMs
      );
      await sendCommand(
        socket,
        queue,
        Buffer.from(config.password, "utf8").toString("base64"),
        [235],
        config.timeoutMs
      );
    }

    await sendCommand(socket, queue, `MAIL FROM:<${config.fromEmail}>`, [250], config.timeoutMs);
    await sendCommand(socket, queue, `RCPT TO:<${mail.to}>`, [250, 251], config.timeoutMs);
    await sendCommand(socket, queue, "DATA", [354], config.timeoutMs);

    const message = buildMessage(config, mail);
    socket.write(`${message}\r\n.\r\n`);
    const dataResponse = await readResponse(queue, config.timeoutMs);
    assertCode(dataResponse.code, [250]);

    await sendCommand(socket, queue, "QUIT", [221], config.timeoutMs);
  } finally {
    if (queue) queue.close();
    if (rl) rl.close();
    if (socket && !socket.destroyed) {
      socket.end();
      socket.destroy();
    }
  }
}
