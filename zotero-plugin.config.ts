import { defineConfig } from "zotero-plugin-scaffold";
import { readFileSync } from "node:fs";
import { releaseNotes } from "./scripts/release-notes.mjs";
import pkg from "./package.json";

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: "https://invalid.example/zetara-update.json",
  xpiDownloadLink: "",

  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: "",
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox115",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
      {
        entryPoints: ["src/preferencesPane.ts"],
        bundle: true,
        target: "firefox115",
        outfile: ".scaffold/build/addon/content/scripts/preferences.js",
      },
    ],
  },

  test: {
    entries: process.env.ZETARA_TEST_ENTRIES || "test",
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },

  release: {
    github: {
      repository: "",
      releaseNote: (ctx) =>
        releaseNotes(
          readFileSync("CHANGELOG.md", "utf8"),
          ctx.version,
          ctx.release.changelog,
        ),
    },
  },

  // If you need to see a more detailed log, uncomment the following line:
  // logLevel: "trace",
});
