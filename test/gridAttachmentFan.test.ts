import { assert } from "chai";
import {
  createItems,
  createRenderer,
  RendererFixture,
  setAppPref,
  track,
  until,
} from "./helpers/gridFixture";
import { pdfBytes, scratchFile } from "./helpers/testEnvironment";

const TILE = 180;
const PADDING = 24;

/** A shelf of 180px tiles with 20px gaps, wide enough for `columns` columns. */
function shelf(columns: number, width: number): RendererFixture {
  return createRenderer({
    items: 0,
    width,
    height: 600,
    columns,
    tileSize: TILE,
    padding: `${PADDING}px`,
    gap: "20px",
  });
}

/**
 * Read the fan at its final spread: reduced motion removes the 320ms
 * transition, so a hidden test window cannot suspend it mid-animation.
 */
async function settleMotion(view: RendererFixture): Promise<void> {
  setAppPref("ui.prefersReducedMotion", 1);
  const win = view.grid.ownerDocument.defaultView!;
  await until(
    () => win.matchMedia("(prefers-reduced-motion: reduce)").matches,
    "the fan animations to be disabled",
  );
}

async function bookWithFiles(count: number): Promise<Zotero.Item> {
  const [book] = await createItems([{ itemType: "book" }]);
  for (let index = 0; index < count; index++) {
    const file = await scratchFile(`fan-${index}.pdf`, pdfBytes());
    track(
      await Zotero.Attachments.importFromFile({
        file,
        parentItemID: book.id,
        title: `Edition ${index + 1}`,
      }),
    );
  }
  return book;
}

/** Open the fan and return the boxes of every card it shows. */
async function openFan(
  view: RendererFixture,
  book: Zotero.Item,
): Promise<DOMRect[]> {
  view.hover(book);
  const tile = view.tile(book);
  const cards = Array.from(
    tile.querySelectorAll<HTMLElement>(".grid-view-fan-card"),
  );
  assert.isAtLeast(cards.length, 2, "the fan has file cards");
  const win = view.grid.ownerDocument.defaultView!;
  await until(
    () => parseFloat(win.getComputedStyle(cards[0]).opacity) > 0.9,
    "the fan to open",
  );
  return Array.from(
    tile.querySelectorAll<HTMLElement>(
      ".grid-view-fan-card, .grid-view-fan-more",
    ),
  ).map((card) => card.getBoundingClientRect());
}

function shelfBounds(view: RendererFixture): { left: number; right: number } {
  const box = view.grid.getBoundingClientRect();
  const left = box.left + view.grid.clientLeft;
  return { left, right: left + view.grid.clientWidth };
}

function centreX(box: DOMRect): number {
  return (box.left + box.right) / 2;
}

describe("attachment fan inside the shelf", function () {
  this.timeout(30000);

  it("opens to the right and keeps every file card off the shelf edge", async function () {
    const view = shelf(3, 720);
    await settleMotion(view);
    const book = await bookWithFiles(2);
    view.setItems([book]);
    const boxes = await openFan(view, book);
    const tile = view.tile(book).getBoundingClientRect();
    const bounds = shelfBounds(view);
    for (const box of boxes) {
      assert.isAtLeast(
        box.left,
        bounds.left - 0.5,
        "a file card off the left edge",
      );
      assert.isAtMost(
        box.right,
        bounds.right + 0.5,
        "a file card off the right edge",
      );
    }
    assert.isAbove(centreX(boxes[0]), centreX(tile), "opens to the right");
  });

  it("mirrors and tightens the fan when the right edge leaves no room", async function () {
    const view = shelf(2, 480);
    await settleMotion(view);
    const [other] = await createItems([{ itemType: "book" }]);
    const book = await bookWithFiles(4);
    view.setItems([other, book]);
    const boxes = await openFan(view, book);
    const tile = view.tile(book).getBoundingClientRect();
    const bounds = shelfBounds(view);
    for (const box of boxes) {
      assert.isAtLeast(
        box.left,
        bounds.left - 0.5,
        "a file card off the left edge",
      );
      assert.isAtMost(
        box.right,
        bounds.right + 0.5,
        "a file card off the right edge",
      );
    }
    assert.isBelow(centreX(boxes[0]), centreX(tile), "opens to the left");
  });
});
