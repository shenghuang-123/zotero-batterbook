import { assert } from "chai";
import {
  GridFixture,
  onTeardown,
  openGrid,
  patch,
  selectBookFiles,
  track,
  until,
} from "./helpers/gridFixture";
import {
  imagePaint,
  inventBook,
  pdfBytes,
  scratchFile,
} from "./helpers/testEnvironment";

function pressAddBook(grid: GridFixture): void {
  const button = grid.win.document.getElementById("zetara-add-book");
  assert.exists(button, "the Add book toolbar button");
  assert.lengthOf(
    grid.win.document.querySelectorAll("#zetara-add-book"),
    1,
    "one Add book button",
  );
  assert.isTrue(button!.isConnected, "the Add book button is in the toolbar");
  assert.isFalse(
    (button as XULToolBarButtonElement).disabled,
    "the Add book button is enabled",
  );
  assert.include(
    grid.win.getComputedStyle(button!).listStyleImage,
    "add-book.svg",
    "the Add book button shows its icon",
  );
  button!.dispatchEvent(new grid.win.Event("command", { bubbles: true }));
}

async function importedBook(
  grid: GridFixture,
  title: string,
): Promise<Zotero.Item> {
  let book: Zotero.Item | undefined;
  await until(() => {
    book = Zotero.Collections.get(grid.collection.id)
      ?.getChildItems()
      .find((item) => item.isRegularItem() && item.getField("title") === title);
    return !!book;
  }, `the imported book ${title}`);
  track(book!);
  return book!;
}

describe("Manual book import", function () {
  this.timeout(30000);

  it("groups selected originals and translations under one book with a first-page cover", async function () {
    const grid = await openGrid();
    const title = inventBook().title;
    const original = await scratchFile(
      `${title}-original.pdf`,
      pdfBytes({
        width: 210,
        height: 297,
        content: "1 0 0 rg 0 0 210 297 re f",
        morePages: ["0 0 1 rg 0 0 210 297 re f"],
      }),
    );
    const translation = await scratchFile(
      `${title}-translation.pdf`,
      pdfBytes({ width: 210, height: 297 }),
    );
    const selection = selectBookFiles([original, translation]);
    pressAddBook(grid);
    await until(() => selection.opened, "the file picker to open");

    const book = await importedBook(grid, `${title}-original`);
    const importedAttachments = () =>
      book
        .getAttachments(true)
        .map((id) => Zotero.Items.get(id))
        .filter(
          (item): item is Zotero.Item => !!item && item.isFileAttachment(),
        );
    await until(
      () =>
        importedAttachments().length === 2 &&
        importedAttachments().every((item) => item.getDisplayTitle() !== ""),
      "both selected files to be imported",
      {
        observe: () =>
          book.getAttachments(true).map((id) => {
            const item = Zotero.Items.get(id);
            return item ? item.getDisplayTitle() : `missing item ${id}`;
          }),
      },
    );
    assert.equal(book.itemType, "book");
    assert.equal(book.libraryID, grid.collection.libraryID);
    const attachments = importedAttachments();
    assert.lengthOf(attachments, 2);
    assert.sameMembers(
      attachments.map((item) => item.getDisplayTitle()),
      [`${title}-original`, `${title}-translation`],
    );
    assert.isTrue(attachments.every((item) => item.parentItemID === book.id));
    assert.isTrue(Zotero.Collections.get(grid.collection.id)!.hasItem(book));

    await grid.showsItems([book]);
    await grid.settled();
    const cover = grid.currentCover(book);
    assert.equal(cover?.kind, "attachment");
    const {
      colour: [red, green, blue],
    } = await imagePaint(cover!.uri);
    assert.isAbove(red, 200, "the first page is red");
    assert.isBelow(green, 40, "the first page is not the blue second page");
    assert.isBelow(blue, 40, "the first page is not the blue second page");
    const frame = grid.coverImage(book).parentElement!.getBoundingClientRect();
    assert.isAbove(frame.height, frame.width, "the cover is vertical");
    assert.closeTo(frame.height / frame.width, 297 / 210, 0.02);

    const opened: number[][] = [];
    patch(
      grid.pane as unknown as {
        viewItems(items: Zotero.Item[], event?: Event): Promise<void>;
      },
      "viewItems",
      async (items: Zotero.Item[]) => {
        opened.push(items.map((item) => item.id));
      },
    );
    grid.doubleClick(book);
    await until(() => opened.length, "Zotero's native item activation");
    assert.deepEqual(opened[0], [book.id]);
  });

  it("does not create a book when the file selection is cancelled", async function () {
    const grid = await openGrid();
    const selection = selectBookFiles(null);
    pressAddBook(grid);
    await until(() => selection.opened, "the file picker to open");
    await grid.settled();
    assert.lengthOf(
      Zotero.Collections.get(grid.collection.id)!.getChildItems(),
      0,
    );
  });

  it("opens a double-clicked book in Zotero's native reader", async function () {
    const grid = await openGrid({ items: [{ itemType: "book" }] });
    const path = await scratchFile(
      "large-book.pdf",
      pdfBytes({
        width: 595,
        height: 842,
        content: "0.2 0.4 0.8 rg 0 0 595 842 re f",
        morePages: Array.from(
          { length: 999 },
          () => "0 0 0.2 rg 0 0 595 842 re f",
        ),
      }),
    );
    const [attachment] = track(
      await Zotero.Attachments.importFromFile({
        file: path,
        parentItemID: grid.items[0].id,
        title: "Original edition",
      }),
    );
    interface OpenReader {
      itemID: number;
      tabID: string;
      _isTabClosed?: boolean;
    }
    const readers = () =>
      (Zotero.Reader as unknown as { _readers: OpenReader[] })._readers.slice();
    const tabs = (
      grid.win as unknown as {
        Zotero_Tabs: {
          selectedID: string;
          _tabs: { id: string; type: string }[];
          close(id: string): void;
        };
      }
    ).Zotero_Tabs;
    const openedTabIDs = new Set<string>();
    onTeardown(async () => {
      for (const reader of readers()) {
        if (reader.itemID === attachment.id) openedTabIDs.add(reader.tabID);
      }
      for (const tabID of openedTabIDs) {
        if (tabs._tabs.some((tab) => tab.id === tabID)) tabs.close(tabID);
      }
      await until(
        () =>
          [...openedTabIDs].every(
            (tabID) => !tabs._tabs.some((tab) => tab.id === tabID),
          ),
        "the reader tabs to close",
      );
    });

    await grid.settled();
    grid.doubleClick(grid.items[0]);
    await until(
      () =>
        readers().some(
          (reader) => reader.itemID === attachment.id && !reader._isTabClosed,
        ),
      "Zotero's reader for the book's first attachment",
      { observe: () => readers().map((reader) => reader.itemID) },
    );
    assert.isTrue(
      tabs._tabs.some(
        (tab) => tab.id === tabs.selectedID && tab.type === "reader",
      ),
      "the reader tab is selected",
    );
  });
});
