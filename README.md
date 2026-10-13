# Lupin Calls

A lightweight, browser-based video calling app built with WebRTC and Cloudflare Durable Objects.

## Features

- Create a room or join with a room code
- Camera and microphone controls
- Screen sharing
- Multi-participant mesh calls (best for small groups)
- Responsive layout and pre-join device preview
- No account required for the starter version

## Run locally

Camera and microphone access require a secure context, so use localhost or HTTPS.

    python3 -m http.server 8000

Then open http://localhost:8000.

## Deploy the frontend

1. Open Settings → Pages in this repository.
2. Choose Deploy from a branch, branch main, folder / (root).
3. Save and wait for deployment.

## Deploy signalling

The frontend needs a deployed signalling Worker to exchange WebRTC offers, answers, and ICE candidates. Follow workers/README.md to deploy the Worker and set its URL in app.js.

## Important notes

- This starter uses peer-to-peer WebRTC and is intended for small groups.
- Some networks require a TURN relay for reliable connectivity. STUN alone cannot guarantee every network combination will connect.
- The signalling Worker relays call setup messages, not audio or video.
- Room codes are identifiers, not passwords. Share them only with intended participants.
