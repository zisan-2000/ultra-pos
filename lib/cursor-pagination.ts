import { Buffer } from "buffer";

export type CursorToken = {
  createdAt: string;
  id: string;
};

export function encodeCursorList(list: CursorToken[]) {
  return Buffer.from(JSON.stringify(list), "utf8").toString("base64url");
}

export function decodeCursorList(value?: string): CursorToken[] {
  if (!value) return [];
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cursors: CursorToken[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const createdAt =
        typeof (entry as { createdAt?: unknown }).createdAt === "string"
          ? (entry as { createdAt: string }).createdAt
          : null;
      const id =
        typeof (entry as { id?: unknown }).id === "string"
          ? (entry as { id: string }).id
          : null;
      if (createdAt && id) {
        cursors.push({ createdAt, id });
      }
    }
    return cursors;
  } catch {
    return [];
  }
}

export function toCursorInput(cursor: CursorToken | null) {
  if (!cursor) return null;
  const createdAt = new Date(cursor.createdAt);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: cursor.id };
}

export function applyCursorLimit(list: CursorToken[], base: number, max: number) {
  if (list.length <= max) {
    return { list, base };
  }
  const overflow = list.length - max;
  return { list: list.slice(overflow), base: base + overflow };
}

export function normalizeCursorPageState({
  page,
  cursors,
  cursorBase,
  maxHistory,
}: {
  page: number;
  cursors: CursorToken[];
  cursorBase: number;
  maxHistory: number;
}) {
  let safePage = Number.isFinite(page) ? Math.floor(page) : 1;
  let safeCursorBase = Number.isFinite(cursorBase) ? Math.floor(cursorBase) : 2;
  let cursorList = Array.isArray(cursors) ? cursors : [];

  if (safeCursorBase < 2) {
    safeCursorBase = 2;
  }

  if (safePage <= 1) {
    safePage = 1;
    cursorList = [];
    safeCursorBase = 2;
  } else {
    const limited = applyCursorLimit(cursorList, safeCursorBase, maxHistory);
    cursorList = limited.list;
    safeCursorBase = limited.base;

    const requiredLength = safePage - safeCursorBase + 1;
    if (requiredLength < 1 || cursorList.length < requiredLength) {
      safePage = 1;
      cursorList = [];
      safeCursorBase = 2;
    } else if (cursorList.length > requiredLength) {
      cursorList = cursorList.slice(0, requiredLength);
    }
  }

  const currentCursor =
    safePage > 1 ? cursorList[safePage - safeCursorBase] ?? null : null;

  return {
    page: safePage,
    cursors: cursorList,
    cursorBase: safeCursorBase,
    currentCursor,
  };
}

export function buildCursorPageLink({
  targetPage,
  currentPage,
  cursors,
  cursorBase,
  nextCursor,
  maxHistory,
  buildHref,
}: {
  targetPage: number;
  currentPage: number;
  cursors: CursorToken[];
  cursorBase: number;
  nextCursor: CursorToken | null;
  maxHistory: number;
  buildHref: (args: {
    page?: number;
    cursors?: CursorToken[];
    cursorBase?: number;
  }) => string;
}) {
  if (targetPage <= 1) {
    return buildHref({});
  }

  if (targetPage === currentPage + 1 && nextCursor) {
    const nextList = [...cursors, nextCursor];
    const limited = applyCursorLimit(nextList, cursorBase, maxHistory);
    return buildHref({
      page: targetPage,
      cursors: limited.list,
      cursorBase: limited.base,
    });
  }

  if (targetPage <= currentPage) {
    if (targetPage < cursorBase) return null;
    const requiredLength = targetPage - cursorBase + 1;
    if (requiredLength < 1 || cursors.length < requiredLength) {
      return null;
    }
    const targetCursors = cursors.slice(0, requiredLength);
    return buildHref({
      page: targetPage,
      cursors: targetCursors,
      cursorBase,
    });
  }

  return null;
}
