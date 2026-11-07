import type { CommandRunner, RunResult } from "../src/runner.js";

export interface Call {
  cmd: string;
  args: string[];
}

export function fakeRunner(reply: (c: Call) => Partial<RunResult> = () => ({})): { run: CommandRunner; calls: Call[] } {
  const calls: Call[] = [];
  const run: CommandRunner = async (cmd, args) => {
    const c = { cmd, args: [...args] };
    calls.push(c);
    return { code: 0, stdout: "", stderr: "", ...reply(c) };
  };
  return { run, calls };
}
