import http from "node:http";
import type { ClientRequest, IncomingHttpHeaders, Server } from "node:http";

export interface OpenedStream {
    status: number;
    headers: IncomingHttpHeaders;
    request: ClientRequest;
    text(): string;
    frameCount(): number;
    ended: Promise<void>;
}

export interface StreamConnection {
    request: ClientRequest;
    opened: Promise<OpenedStream>;
}

function countOccurrences(text: string, fragment: string): number {
    return text.split(fragment).length - 1;
}

export function connectStream(options: { port: number; path: string; clientIp?: string }): StreamConnection {
    const { port, path, clientIp } = options;
    const headers: Record<string, string> = {};
    if (clientIp !== undefined) {
        headers["X-Forwarded-For"] = clientIp;
    }

    let resolveOpened: (stream: OpenedStream) => void = () => {};
    const opened = new Promise<OpenedStream>((resolve) => {
        resolveOpened = resolve;
    });

    // agent: false gives every stream its own socket, so no pooled keep-alive socket crosses to another test's
    // server (Phase 14 deferred-items note). 127.0.0.1 makes the server see an IPv4 socket.
    const request = http.get({ host: "127.0.0.1", port, path, agent: false, headers }, (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
            text += chunk;
        });
        // 'close' fires both for a normal end and for a dropped connection.
        const ended = new Promise<void>((resolve) => {
            response.on("close", () => resolve());
        });
        resolveOpened({
            status: response.statusCode ?? 0,
            headers: response.headers,
            request,
            text: () => text,
            frameCount: () => countOccurrences(text, "event: prediction"),
            ended,
        });
    });
    request.on("error", () => {
        // Destroying a stream to simulate a client disconnect raises a socket hang-up, which is expected.
    });

    return { request, opened };
}

export function openStream(options: { port: number; path: string; clientIp?: string }): Promise<OpenedStream> {
    return connectStream(options).opened;
}

// Tests wait on this with vi.waitFor instead of a fixed sleep, so a release has certainly run before the next
// connect.
export function trackOpenResponses(server: Server): () => number {
    let open = 0;
    server.on("request", (_req, res) => {
        open += 1;
        res.on("close", () => {
            open -= 1;
        });
    });
    return () => open;
}
