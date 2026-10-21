# Lupin Calls

A browser-based video calling app using WebRTC and Cloudflare Durable Objects.

## Included

- Create or join a call using a room code
- Camera and microphone controls
- Screen sharing
- Responsive layout and optional camera preview
- WebRTC peer-to-peer media for small group calls
- Cloudflare Worker signalling endpoint: https://lupin-calls-signaling.lujinsg.workers.dev/health

## Open the site

GitHub Pages deployment is configured in .github/workflows/pages.yml.

1. Open this repository's Settings → Pages.
2. Set the build and deployment source to **GitHub Actions** if it is not already selected.
3. Open the Actions tab and check the latest “Deploy Lupin Calls to GitHub Pages” run.
4. Once successful, open https://lujin2015.github.io/lupin-calls/.

## Run locally

Camera and microphone access require a secure context, so use localhost or HTTPS.

    python3 -m http.server 8000

Then open http://localhost:8000.

## Signalling service

The Worker source is in workers/worker.js and its configuration is in wrangler.toml. The deployed endpoint is configured in app.js. The Worker relays room membership and WebRTC offer/answer/ICE messages; it does not relay audio or video.

## Important limitations

- Calls use a peer-to-peer mesh and are intended for small groups, not large webinars.
- The app uses a public STUN server. Some networks require a TURN relay, so connection success is not guaranteed on every network.
- Room codes are identifiers, not passwords. Share them only with people you intend to invite.
- Camera and microphone access requires user permission.

## Credits

**Project Lead:** Lu Jin

**AI Development Assistant:** ChatGPT by OpenAI

ChatGPT assisted with coding, debugging, documentation, and design. The Lupin projects were developed through human direction and AI assistance.

Intellectual property rights remain subject to applicable law and the rights of the respective contributors and third-party authors.

