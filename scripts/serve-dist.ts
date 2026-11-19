import { lstat, realpath } from "node:fs/promises"
import { join, resolve, sep } from "node:path"

const root = await realpath(resolve(import.meta.dir, "../dist"))
const indexPath = join(root, "index.html")
const port = Number(process.env.PORT ?? "3000")

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ""}`)
}

const indexStat = await lstat(indexPath).catch(() => undefined)
if (!indexStat?.isFile()) {
  throw new Error("dist/index.html is missing; run the production build first")
}

async function filePath(pathname: string): Promise<string | null | undefined> {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname).replaceAll("\\", "/")
  } catch {
    return null
  }

  if (decoded.split("/").some((segment) => segment === "..")) {
    return null
  }

  const candidate = resolve(root, decoded.replace(/^\/+/, ""))
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return null
  }

  try {
    const candidateStat = await lstat(candidate)
    if (!candidateStat.isFile()) return undefined
    const canonical = await realpath(candidate)
    if (canonical !== root && !canonical.startsWith(`${root}${sep}`)) {
      return null
    }
    return canonical
  } catch {
    return undefined
  }
}

const server = Bun.serve({
  hostname: "0.0.0.0",
  port,
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      })
    }

    const url = new URL(request.url)
    const resolved = await filePath(url.pathname)
    if (resolved === null) return new Response("Not Found", { status: 404 })
    const lastSegment = url.pathname.split("/").at(-1) ?? ""
    const selected = resolved ?? (!lastSegment.includes(".") ? indexPath : undefined)
    if (!selected) return new Response("Not Found", { status: 404 })

    const file = Bun.file(selected)
    const headers = {
      "cache-control": selected === indexPath ? "no-store" : "public, max-age=3600",
      "content-type": file.type || "application/octet-stream",
    }
    return new Response(request.method === "HEAD" ? null : file, { headers })
  },
})

console.log(`Production build listening on http://0.0.0.0:${server.port}`)
