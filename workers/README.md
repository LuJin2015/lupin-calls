# Deploy the Lupin Calls signalling Worker

The Worker source lives in this folder's worker.js. It uses a Durable Object per room and forwards only WebRTC setup messages; audio/video media stays peer-to-peer.

## Option A — Wrangler (recommended)

From the repository root, with Wrangler installed and authenticated:

    npx wrangler deploy

The wrangler.toml file already declares the GameRoom Durable Object and its initial SQLite migration. The first deployment creates the Durable Object namespace.

After deployment, the expected URL is:

    https://lupin-calls-signaling.<your-workers-subdomain>.workers.dev

Test it by opening /health on that URL. The response should contain "ok": true.

## Configure the frontend

Open app.js and set SIGNALING_URL to the Worker's WebSocket endpoint, for example:

    const SIGNALING_URL = "wss://lupin-calls-signaling.<your-workers-subdomain>.workers.dev/ws";

Use wss:// for deployed HTTPS pages. Commit the change and reload the Pages site.

## Notes

- Camera/microphone permissions require HTTPS or localhost.
- WebRTC calls use a public STUN server for initial connectivity. Some networks require a TURN service; STUN alone cannot guarantee every call will connect.
- This is a mesh call architecture intended for small groups, not a large webinar.
- Room codes are not passwords. Do not share a code publicly if the call is private.
