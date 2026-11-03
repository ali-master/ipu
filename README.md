# IPU — IP, meet you.

**U means you.** IPU automatically shows the visitor's IP address, matching network, ASN, approximate location, timezone and address traits. Browsers get a responsive interface; terminals get plain text. No external lookup service is called.

Built with **Bun**, **Elysia**, **React**, **shadcn/ui**, **Tailwind CSS 4**, **MaxMind** and a lazy-loaded **COBE** globe. Work Sans is self-hosted. Light/dark mode follows the system until the visitor chooses a preference.

## Run

```sh
bun install --frozen-lockfile
bun run build
bun start
# http://localhost:3000
```

`bun run dev` builds the frontend and watches the server. Run it again after frontend edits to rebuild the browser assets. `bun run build` uses Bun's native bundler and Tailwind plugin; no Vite or Node server is required.

On localhost the visitor IP is normally `127.0.0.1` or `::1`, so public location and ASN are unavailable. Use [the supplied example IP](http://localhost:3000/88.198.53.22) to explore a real database record. On a public deployment, IPU reads the visitor's socket address automatically.

