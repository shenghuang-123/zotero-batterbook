import { assert } from "chai";
import {
  GridFixture,
  openGrid,
  patch,
  selectBookFiles,
  track,
  until,
} from "./helpers/gridFixture";
import { inventBook, pdfBytes, scratchFile } from "./helpers/testEnvironment";

function filesSection(grid: GridFixture): HTMLElement {
  const section = grid.win.document.querySelector<HTMLElement>(
    "item-pane-custom-section:has(.zetara-book-files)",
  );
  assert.exists(section, "the Book files section");
  return section!;
}

async function showBookFiles(grid: GridFixture): Promise<void> {
  await grid.select([grid.items[0]]);
  const section = filesSection(grid);
  await until(
    () => !!section.dataset.pane,
    "the Book files section registration",
    { observe: () => section.dataset.pane },
  );
  const paneID = section.dataset.pane;
  const button = Array.from(
    grid.win.document.querySelectorAll<HTMLElement>("item-pane-sidenav .btn"),
  ).find((candidate) => candidate.dataset.pane === paneID);
  assert.exists(button, "the Book files sidenav button");
  button!.dispatchEvent(new grid.win.MouseEvent("click", { bubbles: true }));
  await until(
    () =>
      !section.hidden &&
      section.getBoundingClientRect().height > 0 &&
      grid.win.getComputedStyle(section).visibility !== "hidden",
    "the Book files section to be shown",
    { observe: () => section.getBoundingClientRect().height },
  );
}

async function attach(
  grid: GridFixture,
  title: string,
  filename = `${title}.pdf`,
): Promise<Zotero.Item> {
  const path = await scratchFile(filename, pdfBytes());
  const [attachment] = track(
    await Zotero.Attachments.importFromFile({
      file: path,
      parentItemID: grid.items[0].id,
      title,
    }),
  );
  return attachment;
}

function fileRow(grid: GridFixture, title: string): HTMLElement {
  const row = Array.from(
    filesSection(grid).querySelectorAll<HTMLElement>(".zetara-book-file"),
  ).find(
    (candidate) =>
      candidate.querySelector(".zetara-book-file-title")?.textContent === title,
  );
  assert.exists(row, `the attachment row ${title}`);
  return row!;
}

describe("Book files pane", function () {
  this.timeout(30000);

  it("lists the original and translated attachments of the selected book", async function () {
    const grid = await openGrid({ items: [{ itemType: "book" }] });
    await attach(grid, "Original edition");
    await attach(grid, "中译版", "translated.pdf");
    await showBookFiles(grid);
    await until(
      () =>
        filesSection(grid).querySelectorAll(".zetara-book-file").length === 2,
      "both attachment rows",
    );
    fileRow(grid, "Original edition");
    fileRow(grid, "中译版");
    assert.include(
      fileRow(grid, "中译版").querySelector(".zetara-book-file-meta")!
        .textContent,
      "PDF",
    );
  });

  it("opens a chosen attachment through Zotero's native item activation", async function () {
    const grid = await openGrid({ items: [{ itemType: "book" }] });
    const attachment = await attach(grid, "Original edition");
    await showBookFiles(grid);
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
    fileRow(grid, "Original edition")
      .querySelector<HTMLButtonElement>("[data-action=open]")!
      .click();
    await until(() => opened.length, "the chosen attachment to open");
    assert.deepEqual(opened[0], [attachment.id]);
  });

  it("renames an attachment title without renaming its stored file", async function () {
    const grid = await openGrid({ items: [{ itemType: "book" }] });
    const attachment = await attach(grid, "Original edition", "stored.pdf");
    await showBookFiles(grid);
    patch(grid.win, "prompt", () => "中译版（修订）");
    fileRow(grid, "Original edition")
      .querySelector<HTMLButtonElement>("[data-action=rename]")!
      .click();
    await until(
      () => attachment.getField("title") === "中译版（修订）",
      "the renamed attachment title",
    );
    assert.equal(attachment.attachmentFilename, "stored.pdf");
    await until(
      () =>
        Array.from(
          filesSection(grid).querySelectorAll<HTMLElement>(
            ".zetara-book-file-title",
          ),
        ).some((title) => title.textContent === "中译版（修订）"),
      "the renamed attachment row",
      {
        observe: () =>
          Array.from(
            filesSection(grid).querySelectorAll(".zetara-book-file-title"),
          ).map((title) => title.textContent),
      },
    );
    assert.equal(
      fileRow(grid, "中译版（修订）").dataset.itemId,
      String(attachment.id),
    );
  });

  it("adds another edition to the same book", async function () {
    const grid = await openGrid({ items: [{ itemType: "book" }] });
    await attach(grid, "Original edition");
    await showBookFiles(grid);
    const title = inventBook().title;
    const path = await scratchFile(`${title}.pdf`, pdfBytes());
    const selection = selectBookFiles([path]);
    const add = Array.from(
      filesSection(grid).querySelectorAll<XULToolBarButtonElement>(
        ".section-custom-button",
      ),
    ).find((button) => button.classList.contains("add"));
    assert.exists(add, "the Add files section button");
    add!.dispatchEvent(new grid.win.Event("command", { bubbles: true }));
    await grid.settled();
    await until(() => selection.opened, "the attachment file picker to open");
    await until(
      () =>
        filesSection(grid).querySelectorAll(".zetara-book-file").length === 2,
      "the added attachment row",
    );
    fileRow(grid, title);
    assert.lengthOf(grid.items[0].getAttachments(true), 2);
  });
});
