import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.grifo.leiseca",
  appName: "Grifo",
  webDir: "dist",
  android: { backgroundColor: "#ffffff" },
  plugins: {
    SystemBars: { insetsHandling: "native" },
  },
};

export default config;
