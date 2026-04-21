import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appVersion = process.env.npm_package_version || "0.0.0-dev";
const appCommitSha =
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "dev";
const appRepoUrl = "https://github.com/FrancoisHUP/mouse-brain-viewer".replace(/\/$/, "");

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT_SHA__: JSON.stringify(appCommitSha),
    __APP_REPO_URL__: JSON.stringify(appRepoUrl),
  },
});
