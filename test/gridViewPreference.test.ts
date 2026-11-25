import { assert } from "chai";
import { config } from "../package.json";
import {
  getPref,
  GridWindow,
  onTeardown,
  openGrid,
  openMainWindow,
  openPreferences,
  setPref,
  until,
} from "./helpers/gridFixture";

function shownView(view: GridWindow): "grid" | "list" {
  assert.notEqual(
    view.showsGrid,
    view.showsItemTree,
    "either the grid view or the item tree is shown",
  );
  return view.showsGrid ? "grid" : "list";
}

describe("grid view preference", function () {
  this.timeout(30000);

  it("shows the grid view or the item tree in every main window, as the preference says", async function () {
    const grid = await openGrid({ items: 1 });
    const second = await openMainWindow();

    setPref("enableGridView", false);
    await grid.settled();
    await second.settled();
    assert.equal(shownView(grid), "list");
    assert.equal(shownView(second), "list");

    setPref("enableGridView", true);
    await grid.settled();
    await second.settled();
    assert.equal(shownView(grid), "grid");
    assert.equal(shownView(second), "grid");
  });

  it("switches views with the toolbar button and remembers the choice", async function () {
    const grid = await openGrid({ items: 1 });
    assert.equal(shownView(grid), "grid");
    assert.isTrue(grid.togglePressed);

    grid.pressToggle();
    await grid.settled();
    assert.equal(shownView(grid), "list");
    assert.isFalse(getPref("enableGridView"));
    assert.isFalse(grid.togglePressed);

    grid.pressToggle();
    await grid.settled();
    assert.equal(shownView(grid), "grid");
    assert.isTrue(getPref("enableGridView"));
    assert.isTrue(grid.togglePressed);
  });

  it("sits at the right end of the toolbar buttons, before the search box", async function () {
    const grid = await openGrid();
    const toolbar = grid.win.document.getElementById(
      "zotero-items-toolbar",
    ) as XULToolBarElement;
    const search = toolbar.querySelector<HTMLElement>(
      ':scope > spacer[flex="1"], #zotero-tb-search-spinner',
    );
    assert.exists(search, "the toolbar's search area");
    assert.strictEqual(
      search!.previousElementSibling,
      grid.toggleButton,
      "the bookshelf button is the last toolbar button",
    );
  });

  it("shows the bookshelf icon in the toolbar and the list icon once inside", async function () {
    const grid = await openGrid({ items: 1 });
    const icon = () =>
      grid.win.getComputedStyle(grid.toggleButton).listStyleImage;
    assert.include(icon(), "list-view.svg", "the way back to the list");
    await grid.showList();
    await grid.settled();
    assert.include(icon(), "bookshelf.svg", "the way into the bookshelf");
  });

  it("closes Ethereal Style's gallery before showing the bookshelf", async function () {
    const grid = await openGrid({ items: 1 });
    const doc = grid.win.document;
    const toolbar = doc.getElementById(
      "zotero-items-toolbar",
    ) as XULToolBarElement;
    const spacer = toolbar.querySelector<HTMLElement>(
      ':scope > spacer[flex="1"]',
    );
    const gallery = doc.createXULElement(
      "toolbarbutton",
    ) as XULToolBarButtonElement;
    gallery.id = "zotero-style-gallery-view";
    gallery.setAttribute("aria-pressed", "true");
    let closed = 0;
    gallery.addEventListener("command", () => {
      closed++;
      gallery.setAttribute("aria-pressed", "false");
    });
    if (spacer) toolbar.insertBefore(gallery, spacer);
    else toolbar.appendChild(gallery);
    onTeardown(() => gallery.remove());

    // Already in the bookshelf: clicking still brings it forward.
    grid.pressToggle();
    await grid.settled();
    assert.equal(closed, 1);
    assert.equal(shownView(grid), "grid");
    assert.isTrue(grid.togglePressed);

    // From the list, the same click opens the bookshelf.
    await grid.showList();
    gallery.setAttribute("aria-pressed", "true");
    grid.pressToggle();
    await grid.settled();
    assert.equal(closed, 2);
    assert.equal(shownView(grid), "grid");
    assert.isTrue(grid.togglePressed);
  });

  it("switches views from the settings pane", async function () {
    const grid = await openGrid({ items: 1 });
    const prefs = await openPreferences();
    const checkbox = prefs.document.getElementById(
      `zotero-prefpane-${config.addonRef}-enable-grid-view`,
    ) as XULCheckboxElement;
    await until(() => checkbox.checked, "the checkbox to be checked");

    checkbox.click();
    await until(
      () => getPref("enableGridView") === false,
      "the preference to be turned off",
    );
    await grid.settled();
    assert.equal(shownView(grid), "list");
  });
});
