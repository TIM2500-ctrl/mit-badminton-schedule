import { spawn } from "node:child_process";

const jobs = [
  ["MIT badminton", "scripts/update-schedule.mjs"],
  ["BU badminton", "scripts/update-bu-schedule.mjs"],
  ["MIT swim", "scripts/update-swim-schedule.mjs"],
];

function runJob([name, script]) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ name, ok: true });
        return;
      }

      console.warn(`::warning::${name} update failed with exit code ${code}; keeping the last successful data file.`);
      resolve({ name, ok: false });
    });

    child.on("error", (error) => {
      console.warn(`::warning::${name} update could not start: ${error.message}; keeping the last successful data file.`);
      resolve({ name, ok: false });
    });
  });
}

const results = [];

for (const job of jobs) {
  results.push(await runJob(job));
}

const failed = results.filter((result) => !result.ok);

if (failed.length > 0) {
  console.warn(
    `::warning::${failed.length} schedule update(s) failed: ${failed.map((result) => result.name).join(", ")}.`,
  );
  console.warn("::warning::The workflow is intentionally left successful to avoid failure-email spam.");
}

console.log(
  `Finished schedule updates: ${results
    .map((result) => `${result.name}=${result.ok ? "ok" : "kept_previous"}`)
    .join(", ")}`,
);
