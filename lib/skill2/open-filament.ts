import { spawn } from "node:child_process";

const PORT = Number(process.env.LM_PORT || 43141);

/** The hidden calibration page for the archetype that just finished. */
export function filamentCalibrationUrl(archetypeId: string, port = PORT) {
  return `http://127.0.0.1:${port}/filament?archetype=${encodeURIComponent(archetypeId)}`;
}

/**
 * Opens the filament page for this archetype.
 * Starts the local app when it is not already running.
 * A failure here does not fail the search.
 */
export async function openFilamentCalibration(archetypeId: string) {
  const url = filamentCalibrationUrl(archetypeId);
  try {
    if (!(await serverReady())) await startDevServer();
    openUrl(url);
    console.log(`opened ${url}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`could not open ${url}: ${message}`);
  }
}

async function serverReady() {
  try {
    const response = await fetch(filamentCalibrationUrl("vertical-void"), { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startDevServer() {
  const child = spawn("npx", ["next", "dev", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  child.unref();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await serverReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("the local app did not start");
}

function openUrl(url: string) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], { detached: true, stdio: "ignore" }).unref();
}
