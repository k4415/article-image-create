import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { getServerEnv } from "@/lib/config/env";

const nodeWebSocketTransport = WebSocket as unknown as typeof globalThis.WebSocket;

export function createAdminClient() {
  const env = getServerEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: nodeWebSocketTransport,
    },
  });
}
