// Builds a signed release APK into release/Grifo-<version>.apk.
// Reads signing settings and JAVA21_HOME from .env; versionName/versionCode come from package.json.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = { ...readEnv(".env"), ...process.env };
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const [major, minor, patch] = version.split(".").map((n) => parseInt(n, 10));
const versionCode = major * 10000 + minor * 100 + patch;

if (!env.GRIFO_KEYSTORE || !env.GRIFO_KEYSTORE_PASSWORD) {
  console.error(
    "Missing GRIFO_KEYSTORE / GRIFO_KEYSTORE_PASSWORD (see .env.example). Refusing to build an unsigned release.",
  );
  process.exit(1);
}
const childEnv = { ...env, GRIFO_KEYSTORE: resolve(env.GRIFO_KEYSTORE) };
if (env.JAVA21_HOME) childEnv.JAVA_HOME = env.JAVA21_HOME;

const gradlew = resolve("android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
execFileSync(
  gradlew,
  ["assembleRelease", `-PgrifoVersionName=${version}`, `-PgrifoVersionCode=${versionCode}`, "--console=plain"],
  { cwd: "android", stdio: "inherit", env: childEnv, shell: process.platform === "win32" },
);

mkdirSync("release", { recursive: true });
const out = `release/Grifo-${version}.apk`;
copyFileSync("android/app/build/outputs/apk/release/app-release.apk", out);
console.log(`\nAPK ready: ${out} (versionCode ${versionCode})`);
