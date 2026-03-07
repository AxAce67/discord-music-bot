import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SingleInstanceHandle {
  release(): Promise<void>;
}

export async function acquireSingleInstance(name: string): Promise<SingleInstanceHandle> {
  const runtimeDir = path.resolve(".runtime");
  await mkdir(runtimeDir, { recursive: true });

  const lockPath = path.join(runtimeDir, `${name}.lock`);
  const pid = process.pid;

  let handle;
  try {
    handle = await open(lockPath, "wx");
    await writeFile(lockPath, String(pid), "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EEXIST") {
      throw err;
    }

    const lockedPid = await readLockedPid(lockPath);
    if (lockedPid !== null && isProcessRunning(lockedPid)) {
      throw new Error(`music-bot is already running (pid: ${lockedPid})`);
    }

    await rm(lockPath, { force: true });
    handle = await open(lockPath, "wx");
    await writeFile(lockPath, String(pid), "utf8");
  }

  let released = false;

  return {
    async release() {
      if (released) {
        return;
      }

      released = true;
      await handle.close();
      await rm(lockPath, { force: true });
    }
  };
}

async function readLockedPid(lockPath: string): Promise<number | null> {
  try {
    const content = await readFile(lockPath, "utf8");
    const pid = Number.parseInt(content.trim(), 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
