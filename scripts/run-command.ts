import { spawn } from "node:child_process";

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${String(code)}`}.`,
        ),
      );
    });
  });
}

export async function runNpm(
  script: string,
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm_execpath is unavailable; run this task through npm.");
  }
  await runCommand(process.execPath, [npmCli, "run", script], options);
}
