import { spawn } from "node:child_process";
const children = [
  spawn(
    process.execPath,
    [
      "--env-file-if-exists=.env",
      "--experimental-strip-types",
      "server/index.ts",
    ],
    { stdio: "inherit", env: { ...process.env, PORT: "4174" } },
  ),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    { stdio: "inherit" },
  ),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((c) => c.kill(signal));
    process.exit(0);
  });
children.forEach((child) =>
  child.on("exit", () => children.forEach((c) => c.kill())),
);
