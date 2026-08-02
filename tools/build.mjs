/**
 * Builds the hosted, installable page (./index.html) from the single source of
 * truth (./app/index.html). The app source is head-less so it can also be
 * published as a Claude artifact; this adds the document shell, iOS meta tags,
 * manifest link, and service-worker registration.
 * Run: node tools/build.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");

const title = src.match(/<title>(.*?)<\/title>/)?.[1] ?? "Feeling Wheel";
const body = src.replace(/<title>.*?<\/title>\s*/, "");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
<meta name="description" content="Name what you're feeling using the Feeling Wheel, then look back at the pattern. Everything stays on your device." />
<meta name="theme-color" content="#f4f3f0" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#121210" media="(prefers-color-scheme: dark)" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Feelings" />
<link rel="apple-touch-icon" href="./icon-180.png" />
<link rel="icon" href="./icon-192.png" />
<link rel="manifest" href="./manifest.webmanifest" />
</head>
<body>
${body}
<script>
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
</script>
</body>
</html>
`;

writeFileSync(new URL("../index.html", import.meta.url), html);
console.log(`index.html — ${(html.length / 1024).toFixed(1)} kB`);
