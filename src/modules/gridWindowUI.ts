import { getString } from "../utils/locale";
import { version } from "../../package.json";

type StylableElement = Element & { style: CSSStyleDeclaration };

export class GridWindowUI {
  readonly host: HTMLDivElement;
  private readonly itemTree: StylableElement;
  private readonly itemTreeDisplay: string;
  private readonly toggleButton: XULToolBarButtonElement;
  private readonly addBookButton: XULToolBarButtonElement;
  private readonly stylesheet: HTMLLinkElement;

  constructor(
    win: _ZoteroTypes.MainWindow,
    private readonly onToggle: () => void,
    private readonly onAddBook: () => void,
  ) {
    const itemTree = win.document.getElementById(
      "zotero-items-tree",
    ) as StylableElement | null;
    if (!itemTree) {
      throw new Error(
        "Cannot attach grid view: #zotero-items-tree was not found",
      );
    }
    const itemsToolbar = win.document.getElementById("zotero-items-toolbar");
    if (!itemsToolbar) {
      throw new Error(
        "Cannot attach grid view: #zotero-items-toolbar was not found",
      );
    }

    this.itemTree = itemTree;
    this.itemTreeDisplay = itemTree.style.display;
    this.stylesheet = ztoolkit.UI.createElement(win.document, "link", {
      namespace: "html",
      enableElementRecord: false,
      properties: {
        type: "text/css",
        rel: "stylesheet",
        // Gecko can reuse pre-update chrome CSS even after the link is removed.
        href: `chrome://${addon.data.config.addonRef}/content/coverView.css?version=${version}`,
      },
    });
    win.document.documentElement?.appendChild(this.stylesheet);

    this.toggleButton = ztoolkit.UI.createElement(
      win.document,
      "toolbarbutton",
      {
        enableElementRecord: false,
        attributes: {
          id: "cover-view-toggle",
          class: "zotero-tb-button",
          tabindex: "-1",
          type: "checkbox",
        },
      },
    );
    this.addBookButton = ztoolkit.UI.createElement(
      win.document,
      "toolbarbutton",
      {
        enableElementRecord: false,
        attributes: {
          id: "zetara-add-book",
          class: "zotero-tb-button",
          tabindex: "-1",
        },
      },
    );
    this.addBookButton.setAttribute("tooltiptext", getString("add-book"));
    // Sit at the right end of the buttons, beside other plugins' view toggles
    // and before Zotero's search box.
    const toolbarEnd =
      itemsToolbar.querySelector(':scope > spacer[flex="1"]') ??
      itemsToolbar.querySelector("#zotero-tb-search-spinner") ??
      null;
    itemsToolbar.insertBefore(this.addBookButton, toolbarEnd);
    itemsToolbar.insertBefore(this.toggleButton, toolbarEnd);
    this.toggleButton.addEventListener("command", this.onToggle);
    this.addBookButton.addEventListener("command", this.onAddBook);

    this.host = win.document.createElement("div");
    this.host.id = "cover-view-grid";
    this.host.hidden = true;
    itemTree.after(this.host);
  }

  setEnabled(enabled: boolean): void {
    this.itemTree.style.display = enabled ? "none" : this.itemTreeDisplay;
    this.host.hidden = !enabled;
    this.toggleButton.toggleAttribute("checked", enabled);
    this.toggleButton.setAttribute("aria-pressed", String(enabled));
    this.toggleButton.setAttribute(
      "tooltiptext",
      getString(
        enabled ? "cover-view-switch-to-list" : "cover-view-switch-to-grid",
      ),
    );
  }

  ownsTreeFocus(element: Element | null): boolean {
    return !!element && this.itemTree.contains(element);
  }

  ownsGridFocus(element: Element | null): boolean {
    return !!element && this.host.contains(element);
  }

  isToggle(element: Element | null): boolean {
    return !!element && this.toggleButton.contains(element);
  }

  destroy(): void {
    this.toggleButton.removeEventListener("command", this.onToggle);
    this.addBookButton.removeEventListener("command", this.onAddBook);
    this.itemTree.style.display = this.itemTreeDisplay;
    this.host.remove();
    this.toggleButton.remove();
    this.addBookButton.remove();
    this.stylesheet.remove();
  }
}
