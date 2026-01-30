"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { useOnlineStatus } from "@/lib/sync/net-status";
import {
  emitCashUpdate,
  emitExpenseUpdate,
  emitSaleUpdate,
} from "@/lib/events/reportEvents";
import { emitProductEvent } from "@/lib/products/product-events";
import { emitDueCustomersEvent } from "@/lib/due/customer-events";
import { handlePermissionError } from "@/lib/permission-toast";
import {
  REALTIME_EVENTS,
  type RealtimeEventPayload,
} from "@/lib/realtime/events";
import { setRealtimeStatus } from "@/lib/realtime/status";

const TOKEN_REFRESH_MS = 10 * 60_000;

async function fetchAuthToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/token", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { token?: string };
    return typeof json?.token === "string" ? json.token : null;
  } catch (error) {
    handlePermissionError(error);
    return null;
  }
}

export default function RealtimeBridge() {
  const online = useOnlineStatus();
  const { shopId } = useCurrentShop();
  const [token, setToken] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const currentShopRef = useRef<string | null>(null);

  const realtimeUrl = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_REALTIME_URL ||
      "http://localhost:4001"
    );
  }, []);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;

    const refreshToken = async () => {
      const next = await fetchAuthToken();
      if (!cancelled) {
        setToken(next);
      }
    };

    refreshToken();
    const id = setInterval(refreshToken, TOKEN_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [online]);

  useEffect(() => {
    if (!online) {
      setRealtimeStatus(false);
    }
  }, [online]);

  useEffect(() => {
    if (!online || !realtimeUrl) return;

    let socket = socketRef.current;
    if (!socket) {
      socket = io(realtimeUrl, {
        autoConnect: false,
        transports: ["websocket"],
        withCredentials: true,
        auth: token ? { token } : {},
        extraHeaders: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      socketRef.current = socket;
    }

    socket.auth = token ? { token } : {};
    if (socket.io?.opts) {
      socket.io.opts.extraHeaders = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    }

    socket.connect();

    return () => {
      socket?.disconnect();
      setRealtimeStatus(false);
    };
  }, [online, token, realtimeUrl]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleConnect = () => {
      setRealtimeStatus(true);
      if (shopId) {
        socket.emit("shop:join", { shopId }, (res?: { ok: boolean }) => {
          if (!res?.ok) {
            console.warn("Realtime join failed");
          }
        });
        currentShopRef.current = shopId;
      }
    };

    const handleConnectError = (error: Error) => {
      console.warn("Realtime connection error", error.message);
      setRealtimeStatus(false);
    };

    const handleDisconnect = () => {
      setRealtimeStatus(false);
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
    };
  }, [shopId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !shopId) return;

    const prevShop = currentShopRef.current;
    if (prevShop && prevShop !== shopId) {
      socket.emit("shop:leave", { shopId: prevShop });
    }

    socket.emit("shop:join", { shopId }, (res?: { ok: boolean }) => {
      if (!res?.ok) {
        console.warn("Realtime join failed");
      }
    });
    currentShopRef.current = shopId;
  }, [shopId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleSaleCommitted = (payload: RealtimeEventPayload) => {
      const amount = Number(payload.data?.totalAmount ?? 0);
      emitSaleUpdate(
        payload.shopId,
        {
          type: "sale",
          operation: "add",
          amount: Number.isFinite(amount) ? amount : 0,
          shopId: payload.shopId,
          metadata: { timestamp: payload.at ?? Date.now() },
        },
        { source: "websocket", priority: "high" }
      );
    };

    const handleSaleVoided = (payload: RealtimeEventPayload) => {
      const amount = Number(payload.data?.totalAmount ?? 0);
      emitSaleUpdate(
        payload.shopId,
        {
          type: "sale",
          operation: "subtract",
          amount: Number.isFinite(amount) ? amount : 0,
          shopId: payload.shopId,
          metadata: { timestamp: payload.at ?? Date.now() },
        },
        { source: "websocket", priority: "high" }
      );
    };

    const handleExpenseCreated = (payload: RealtimeEventPayload) => {
      const amount = Number(payload.data?.amount ?? 0);
      emitExpenseUpdate(
        payload.shopId,
        {
          type: "expense",
          operation: "add",
          amount: Number.isFinite(amount) ? amount : 0,
          shopId: payload.shopId,
          metadata: { timestamp: payload.at ?? Date.now() },
        },
        { source: "websocket", priority: "high" }
      );
    };

    const handleCashUpdated = (payload: RealtimeEventPayload) => {
      const amount = Number(payload.data?.amount ?? 0);
      const entryType = (payload.data?.entryType as string | undefined) || "IN";
      emitCashUpdate(
        payload.shopId,
        {
          type: entryType === "OUT" ? "cash-out" : "cash-in",
          operation: "add",
          amount: Number.isFinite(amount) ? amount : 0,
          shopId: payload.shopId,
          metadata: { timestamp: payload.at ?? Date.now() },
        },
        { source: "websocket", priority: "high" }
      );
    };

    const handleStockUpdated = (payload: RealtimeEventPayload) => {
      emitProductEvent({
        shopId: payload.shopId,
        at: payload.at ?? Date.now(),
        source: "refresh",
      });
    };

    const handleLedgerUpdated = (payload: RealtimeEventPayload) => {
      emitDueCustomersEvent({
        shopId: payload.shopId,
        at: payload.at ?? Date.now(),
        source: "sync",
      });
    };

    socket.on(REALTIME_EVENTS.saleCommitted, handleSaleCommitted);
    socket.on(REALTIME_EVENTS.saleVoided, handleSaleVoided);
    socket.on(REALTIME_EVENTS.expenseCreated, handleExpenseCreated);
    socket.on(REALTIME_EVENTS.cashUpdated, handleCashUpdated);
    socket.on(REALTIME_EVENTS.stockUpdated, handleStockUpdated);
    socket.on(REALTIME_EVENTS.ledgerUpdated, handleLedgerUpdated);

    return () => {
      socket.off(REALTIME_EVENTS.saleCommitted, handleSaleCommitted);
      socket.off(REALTIME_EVENTS.saleVoided, handleSaleVoided);
      socket.off(REALTIME_EVENTS.expenseCreated, handleExpenseCreated);
      socket.off(REALTIME_EVENTS.cashUpdated, handleCashUpdated);
      socket.off(REALTIME_EVENTS.stockUpdated, handleStockUpdated);
      socket.off(REALTIME_EVENTS.ledgerUpdated, handleLedgerUpdated);
    };
  }, []);

  return null;
}
