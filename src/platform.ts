// Native glue: storage, back button, sharing a backup file, system bar colors.
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { KV } from "./storage";

export const isNative = Capacitor.isNativePlatform();

/** Preferences is SharedPreferences on Android (and localStorage in the browser). */
export const preferencesKV: KV = {
  get: async (key) => (await Preferences.get({ key })).value,
  set: async (key, value) => {
    await Preferences.set({ key, value });
  },
  keys: async () => (await Preferences.keys()).keys,
};

/** The handler returns true when it consumed the press (closed a panel, etc.). Otherwise the app goes to background. */
export function onBackButton(handler: () => boolean): void {
  if (!isNative) return;
  void App.addListener("backButton", () => {
    if (!handler()) void App.minimizeApp();
  });
}

export function onAppPause(handler: () => void): void {
  if (!isNative) return;
  void App.addListener("pause", handler);
}

export async function shareBackup(json: string, filename: string): Promise<void> {
  if (isNative) {
    const file = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: "Backup do Grifo", files: [file.uri] });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function setSystemBars(theme: "system" | "light" | "dark"): void {
  if (!isNative) return;
  const style =
    theme === "dark" ? SystemBarsStyle.Dark : theme === "light" ? SystemBarsStyle.Light : SystemBarsStyle.Default;
  SystemBars.setStyle({ style }).catch(() => undefined);
}

export async function appVersion(): Promise<string> {
  if (!isNative) return import.meta.env.VITE_APP_VERSION ?? "dev";
  try {
    return (await App.getInfo()).version;
  } catch {
    return "";
  }
}
