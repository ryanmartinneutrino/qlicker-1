import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import apiClient, { getAccessToken } from '../api/client';

const LiveSessionWebSocketContext = createContext(null);

function buildWebsocketUrl(token) {
  const encodedToken = encodeURIComponent(token);
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?token=${encodedToken}`;
}

export function LiveSessionWebSocketProvider({ sessionId, children }) {
  const [lastEvent, setLastEvent] = useState(null);
  const [transport, setTransport] = useState('connecting');
  const eventIdRef = useRef(0);
  const refreshHandlerRef = useRef(null);

  const registerRefreshHandler = (handler) => {
    refreshHandlerRef.current = handler;
    return () => {
      if (refreshHandlerRef.current === handler) {
        refreshHandlerRef.current = null;
      }
    };
  };

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let pollingTimer = null;
    let closed = false;

    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      refreshHandlerRef.current?.();
    };

    const startPolling = () => {
      if (pollingTimer || closed) return;
      setTransport('polling');
      pollingTimer = setInterval(refresh, 3000);
    };

    const stopPolling = () => {
      if (!pollingTimer) return;
      clearInterval(pollingTimer);
      pollingTimer = null;
    };

    const connect = () => {
      if (closed) return;
      const latestToken = getAccessToken();
      if (!latestToken) {
        startPolling();
        return;
      }

      try {
        ws = new WebSocket(buildWebsocketUrl(latestToken));
      } catch {
        startPolling();
        reconnectTimer = setTimeout(connect, 2500);
        return;
      }

      ws.onopen = () => {
        stopPolling();
        setTransport('websocket');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const evt = message?.event;
          const data = message?.data;
          if (!evt || String(data?.sessionId || '') !== String(sessionId)) return;

          const receivedAtMs = Date.now();
          eventIdRef.current += 1;
          setLastEvent({
            id: eventIdRef.current,
            event: evt,
            data,
            receivedAtMs,
            receivedAt: new Date(receivedAtMs).toISOString(),
          });
        } catch {
          // Ignore malformed websocket payloads.
        }
      };

      ws.onclose = () => {
        if (closed) return;
        startPolling();
        reconnectTimer = setTimeout(connect, 2500);
      };
    };

    const init = async () => {
      try {
        const { data } = await apiClient.get('/health');
        if (data?.websocket === true) {
          connect();
          return;
        }
      } catch {
        // Fall through to polling when websocket health is unavailable.
      }
      startPolling();
    };

    init();

    const handleVisibility = () => refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopPolling();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sessionId]);

  const value = useMemo(() => ({
    lastEvent,
    transport,
    registerRefreshHandler,
  }), [lastEvent, registerRefreshHandler, transport]);

  return (
    <LiveSessionWebSocketContext.Provider value={value}>
      {children}
    </LiveSessionWebSocketContext.Provider>
  );
}

export function useLiveSessionWebSocket() {
  const context = useContext(LiveSessionWebSocketContext);
  if (!context) {
    throw new Error('useLiveSessionWebSocket must be used within a LiveSessionWebSocketProvider');
  }
  return context;
}
