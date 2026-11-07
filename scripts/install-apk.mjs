// Installs the current release APK on every phone adb can see (USB or wireless debugging).
// Usage: node scripts/install-apk.mjs [device-serial]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const apk = `release/Grifo-${version}.apk`;
if (!existsSync(apk)) {
  console.error(`${apk} not found. Run "npm run android:apk" first.`);
  process.exit(1);
}
const listed = execFileSync("adb", ["devices"], { encoding: "utf8" })
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.trim().split(/\s+/))
  .filter(([serial, state]) => serial && state === "device")
  .map(([serial]) => serial);
const devices = process.argv[2] ? [process.argv[2]] : listed;
if (!devices.length) {
  console.error("No phone found. Turn on wireless debugging and run: adb connect <ip>:<port>");
  process.exit(1);
}
// The same phone can show up twice (IP and mDNS name); install once per physical device.
const seen = new Set();
for (const serial of devices) {
  const id = execFileSync("adb", ["-s", serial, "shell", "getprop", "ro.serialno"], { encoding: "utf8" }).trim();
  if (seen.has(id)) continue;
  seen.add(id);
  console.log(`Installing ${apk} on ${serial}…`);
  execFileSync("adb", ["-s", serial, "install", "-r", apk], { stdio: "inherit" });
}
