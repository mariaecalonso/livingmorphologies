import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";

const MAX_BYTES = 80 * 1024 * 1024;

export async function POST(request: Request) {
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return new Response(null, { status: 403 });
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("video/mp4")) return new Response(null, { status: 415 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength < 1000 || bytes.byteLength > MAX_BYTES) return new Response(null, { status: 400 });
  if (bytes.subarray(4, 8).toString("ascii") !== "ftyp") return new Response(null, { status: 400 });
  const file = path.join(tmpdir(), "physarum-video.mp4");
  await writeFile(file, bytes);
  try {
    await placeOnClipboard(file);
  } catch {
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}

function placeOnClipboard(file: string) {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$files = New-Object System.Collections.Specialized.StringCollection",
    "[void]$files.Add($env:PHYSARUM_CLIP)",
    "[System.Windows.Forms.Clipboard]::SetFileDropList($files)",
  ].join("; ");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-STA", "-NoProfile", "-NonInteractive", "-Command", script],
      { env: { ...process.env, PHYSARUM_CLIP: file }, windowsHide: true },
    );
    let failed = "";
    child.stderr.on("data", (chunk: Buffer) => {
      failed += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(failed.trim() || "The video could not be copied."));
    });
  });
}
