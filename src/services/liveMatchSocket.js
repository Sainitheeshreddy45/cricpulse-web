import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { API_BASE_URL } from '../api';

const STOMP_ENDPOINT = import.meta.env.VITE_STOMP_ENDPOINT
  || `${API_BASE_URL.replace(/\/$/, '')}/ws`;

export function subscribeToLiveMatch(matchId, onUpdate) {
  let active = true;
  let subscription;
  const client = new Client({
    webSocketFactory: () => new SockJS(STOMP_ENDPOINT),
    reconnectDelay: 5000,
    onConnect: () => {
      if (!active) return;
      subscription = client.subscribe(
        `/topic/match/${encodeURIComponent(matchId)}`,
        (message) => {
          if (!active) return;
          try {
            onUpdate(JSON.parse(message.body));
          } catch {
            // Ignore malformed frames; the next full score update can recover the view.
          }
        },
      );
    },
  });

  client.activate();
  return () => {
    active = false;
    subscription?.unsubscribe();
    void client.deactivate();
  };
}
