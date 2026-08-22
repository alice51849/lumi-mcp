import { spawn } from "node:child_process";
import readline from "node:readline";

export class RpcClient {
  constructor(command, args, options = {}) {
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.exited = new Promise((resolve, reject) => {
      this.child.once("error", reject);
      this.child.once("exit", (code, signal) => {
        const message =
          `MCP process exited with code ${String(code)} ` +
          `and signal ${String(signal)}.`;
        for (const { reject: rejectPending, timer } of this.pending.values()) {
          clearTimeout(timer);
          rejectPending(new Error(`${message}\n${this.stderr}`));
        }
        this.pending.clear();
        if (code === 0) resolve();
        else reject(new Error(`${message}\n${this.stderr}`));
      });
    });
    void this.exited.catch(() => {});
    this.lines = readline.createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        const failure = new Error(
          `MCP process emitted invalid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        for (const { reject, timer } of this.pending.values()) {
          clearTimeout(timer);
          reject(failure);
        }
        this.pending.clear();
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      pending.resolve(message);
    });
  }

  request(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(`Timed out waiting for ${method}.\n${this.stderr}`),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`,
    );
  }

  async close() {
    this.child.stdin.end();
    await this.exited;
  }
}

export function commandFromArguments(defaultCommand) {
  const separator = process.argv.indexOf("--");
  const command =
    separator >= 0 ? process.argv.slice(separator + 1) : defaultCommand;
  if (!command.length) {
    throw new Error("A command is required after '--'.");
  }
  return { executable: command[0], args: command.slice(1) };
}
