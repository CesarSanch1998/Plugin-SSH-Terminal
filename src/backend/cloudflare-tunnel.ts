import { Duplex } from "node:stream";
import WebSocket, { createWebSocketStream } from "ws";

export interface CloudflareTunnelOptions {
  hostname: string;
  port?: number;
  protocol?: "ws" | "wss";
  clientId?: string;
  clientSecret?: string;
  mode?: "websocket" | "cloudflared";
  timeoutMs?: number;
  log?: (level: "info" | "warning" | "error", message: string) => void;
}

/**
 * Creates a Node.js Duplex stream to an SSH server behind Cloudflare Tunnel (Zero Trust).
 *
 * Defaults to native WebSocket encapsulation (WSS) without requiring external binaries.
 * If mode is "cloudflared", uses the local `cloudflared` CLI binary if available.
 */
export async function createCloudflareTunnelStream(
  options: CloudflareTunnelOptions,
): Promise<Duplex> {
  const {
    hostname,
    port = 443,
    protocol,
    clientId,
    clientSecret,
    mode = "websocket",
    timeoutMs = 30000,
    log,
  } = options;

  const cleanHost = hostname
    .replace(/^https?:\/\/|^wss?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();

  if (mode === "cloudflared") {
    return createCloudflaredCliStream({
      hostname: cleanHost,
      clientId,
      clientSecret,
      timeoutMs,
      log,
    });
  }

  return createWebSocketTunnelStream({
    hostname: cleanHost,
    port,
    protocol,
    clientId,
    clientSecret,
    timeoutMs,
    log,
  });
}

function createWebSocketTunnelStream(options: {
  hostname: string;
  port: number;
  protocol?: "ws" | "wss";
  clientId?: string;
  clientSecret?: string;
  timeoutMs: number;
  log?: (level: "info" | "warning" | "error", message: string) => void;
}): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const { hostname, port, protocol, clientId, clientSecret, timeoutMs, log } =
      options;

    const proto =
      protocol ??
      (hostname === "127.0.0.1" || hostname === "localhost" ? "ws" : "wss");
    const isStandardPort =
      (proto === "wss" && port === 443) || (proto === "ws" && port === 80);
    const url = isStandardPort
      ? `${proto}://${hostname}/`
      : `${proto}://${hostname}:${port}/`;
    log?.("info", `Initiating Cloudflare Tunnel connection to ${url}`);

    const headers: Record<string, string> = {
      Host: hostname,
      "User-Agent": "Termix-SSH-Terminal/1.0",
    };

    if (clientId && clientSecret) {
      headers["CF-Access-Client-Id"] = clientId.trim();
      headers["CF-Access-Client-Secret"] = clientSecret.trim();
      log?.("info", "Cloudflare Access Service Token headers attached");
    }

    let ws: WebSocket | null = null;
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    try {
      ws = new WebSocket(url, {
        headers,
        rejectUnauthorized: true,
        handshakeTimeout: timeoutMs,
      });
    } catch (err) {
      log?.(
        "error",
        `Failed to initialize WebSocket client: ${err instanceof Error ? err.message : String(err)}`,
      );
      reject(err);
      return;
    }

    timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        log?.(
          "error",
          `Cloudflare Tunnel connection timed out after ${timeoutMs}ms`,
        );
        ws?.terminate();
        reject(
          new Error(
            `Cloudflare Tunnel connection timed out after ${timeoutMs}ms`,
          ),
        );
      }
    }, timeoutMs);

    ws.on("unexpected-response", (_req, res) => {
      if (settled) return;
      settled = true;
      cleanup();

      const statusCode = res.statusCode;
      let errorMsg = `Cloudflare Tunnel WebSocket handshake rejected with HTTP ${statusCode}`;

      if (statusCode === 403) {
        errorMsg =
          "Cloudflare Access Zero Trust rejected the connection (HTTP 403 Forbidden). " +
          "Verify your Service Token (CF-Access-Client-Id / CF-Access-Client-Secret) or Zero Trust Access policies.";
      } else if (statusCode === 502 || statusCode === 504) {
        errorMsg =
          `Cloudflare Tunnel origin is unreachable (HTTP ${statusCode}). ` +
          "Make sure cloudflared daemon is running on the origin server and the tunnel is healthy.";
      }

      log?.("error", errorMsg);
      ws?.terminate();
      reject(new Error(errorMsg));
    });

    ws.on("error", (err) => {
      log?.("error", `Cloudflare Tunnel WebSocket error: ${err.message}`);
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    });

    ws.on("open", () => {
      if (settled) return;
      settled = true;
      cleanup();

      log?.("info", `Connected to Cloudflare Zero Trust Tunnel at ${hostname}`);

      const duplexStream = createWebSocketStream(ws!, {
        allowHalfOpen: false,
      });

      // Ensure underlying WebSocket is closed when duplex stream ends or is destroyed
      duplexStream.on("close", () => {
        if (
          ws &&
          (ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING)
        ) {
          ws.close();
        }
      });

      resolve(duplexStream);
    });
  });
}

async function createCloudflaredCliStream(options: {
  hostname: string;
  clientId?: string;
  clientSecret?: string;
  timeoutMs: number;
  log?: (level: "info" | "warning" | "error", message: string) => void;
}): Promise<Duplex> {
  const { hostname, clientId, clientSecret, timeoutMs, log } = options;
  const { spawn } = await import("node:child_process");

  log?.("info", `Spawning cloudflared access tcp for ${hostname}`);

  const args = ["access", "tcp", "--hostname", hostname];
  if (clientId && clientSecret) {
    args.push("--id", clientId.trim(), "--secret", clientSecret.trim());
  }

  const proc = spawn("cloudflared", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGTERM");
        reject(new Error(`cloudflared process timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    proc.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            `Failed to spawn cloudflared: ${err.message}. Ensure cloudflared is installed or use native WebSocket mode.`,
          ),
        );
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) log?.("warning", `cloudflared: ${msg}`);
    });

    // Check when stdout receives first chunk or proc is ready
    if (!proc.stdin || !proc.stdout) {
      settled = true;
      clearTimeout(timer);
      reject(new Error("cloudflared stdio streams unavailable"));
      return;
    }

    const duplex = new Duplex({
      read() {
        proc.stdout?.resume();
      },
      write(chunk, encoding, callback) {
        if (!proc.stdin || proc.stdin.destroyed) {
          callback(new Error("stdin is destroyed"));
          return;
        }
        proc.stdin.write(chunk, encoding, callback);
      },
      destroy(err, callback) {
        proc.kill();
        callback(err);
      },
    });

    proc.stdout.on("data", (chunk) => {
      if (!duplex.push(chunk)) {
        proc.stdout?.pause();
      }
    });

    proc.stdout.on("end", () => {
      duplex.push(null);
    });

    proc.on("close", () => {
      if (!duplex.destroyed) {
        duplex.destroy();
      }
    });

    settled = true;
    clearTimeout(timer);
    resolve(duplex);
  });
}
