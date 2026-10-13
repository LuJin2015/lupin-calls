export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "Lupin Calls signalling", time: new Date().toISOString() }, {
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required", { status: 426 });
      }
      const room = (url.searchParams.get("room") || "").toUpperCase();
      const id = (url.searchParams.get("id") || "").slice(0, 80);
      const name = (url.searchParams.get("name") || "Guest").replace(/[<>]/g, "").slice(0, 32) || "Guest";
      if (!/^[A-Z0-9-]{4,12}$/.test(room) || !id) {
        return new Response("A valid room and client id are required", { status: 400 });
      }
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      const target = new URL("https://room.internal/connect");
      target.searchParams.set("room", room);
      target.searchParams.set("id", id);
      target.searchParams.set("name", name);
      return stub.fetch(new Request(target, request));
    }
    return new Response("Lupin Calls signalling is running. Use /health or /ws.", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" }
    });
  }
};

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const name = url.searchParams.get("name") || "Guest";
    if (!id) return new Response("Missing client id", { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ id, name });
    this.state.acceptWebSocket(server);

    const peers = this.state.getWebSockets().filter(ws => ws !== server).map(ws => {
      try { return ws.deserializeAttachment(); } catch { return null; }
    }).filter(peer => peer && peer.id && peer.id !== id);

    server.send(JSON.stringify({ type: "room-state", peers }));
    this.broadcast({ type: "peer-joined", id, name }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, rawMessage) {
    let message;
    try {
      const text = typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage);
      message = JSON.parse(text);
    } catch {
      return;
    }
    const sender = socket.deserializeAttachment();
    if (!sender?.id || !message || typeof message.type !== "string") return;
    if (message.type === "leave") {
      try { socket.close(1000, "Participant left"); } catch {}
      return;
    }
    if (!["offer", "answer", "ice"].includes(message.type)) return;
    const outgoing = { ...message, from: sender.id, name: sender.name };
    delete outgoing.to;
    const recipientId = typeof message.to === "string" ? message.to : "";
    if (!recipientId || recipientId === sender.id) return;
    for (const peer of this.state.getWebSockets()) {
      try {
        const attachment = peer.deserializeAttachment();
        if (attachment?.id === recipientId) {
          peer.send(JSON.stringify(outgoing));
          break;
        }
      } catch {}
    }
  }

  webSocketClose(socket) {
    let participant;
    try { participant = socket.deserializeAttachment(); } catch {}
    if (participant?.id) this.broadcast({ type: "peer-left", id: participant.id }, socket);
  }

  webSocketError(socket) {
    let participant;
    try { participant = socket.deserializeAttachment(); } catch {}
    if (participant?.id) this.broadcast({ type: "peer-left", id: participant.id }, socket);
  }

  broadcast(message, excludedSocket = null) {
    const encoded = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket === excludedSocket) continue;
      try { socket.send(encoded); } catch {}
    }
  }
}
