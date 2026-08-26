import { execSync, spawnSync } from "node:child_process";

const token = process.env.API_TOKEN?.trim();

if (token) {
  const result = spawnSync("npx", ["wrangler", "secret", "put", "API_TOKEN"], {
    input: token,
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

execSync("npx wrangler deploy", { stdio: "inherit" });
