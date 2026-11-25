import { config } from "../package.json";
import { attachTileSizePreference } from "./modules/tileSizePreference";

declare const document: Document;

const SLIDER_ID = `zotero-prefpane-${config.addonRef}-tile-size`;
const PERCENT_ID = `${SLIDER_ID}-percent`;

// Zotero loads pane scripts before inserting the XHTML, then dispatches `load`
// on each top-level element of the newly inserted pane.
document.addEventListener(
  "load",
  (event) => {
    const root = event.target;
    if (!(root instanceof Element)) return;
    const slider = root.querySelector<HTMLInputElement>(`#${SLIDER_ID}`);
    const percentage = root.querySelector<HTMLInputElement>(`#${PERCENT_ID}`);
    if (!slider || !percentage) return;
    const detach = attachTileSizePreference(slider, percentage);
    root.addEventListener("unload", detach, { once: true });
  },
  true,
);
