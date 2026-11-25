import { getString } from "../utils/locale";

export interface BookFilePicker {
  modeOpenMultiple: number;
  returnOK: number;
  init(window: Window, title: string, mode: number): void;
  appendFilter(title: string, extensions: string): void;
  show(): Promise<number>;
  files: string[];
}

let filePickerFactory: (() => BookFilePicker) | undefined;

export function setBookFilePickerFactory(factory?: () => BookFilePicker): void {
  filePickerFactory = factory;
}

export interface ImportBookOptions {
  title?: string;
  collectionID?: number;
  libraryID?: number;
}

const busyWindows = new Set<Window>();

export function isBookImportBusy(win: Window): boolean {
  return busyWindows.has(win);
}

export async function pickAndImportBooks(
  win: _ZoteroTypes.MainWindow,
): Promise<void> {
  if (busyWindows.has(win)) return;
  busyWindows.add(win);
  try {
    const picker = await createFilePicker();
    picker.init(win, getString("add-book"), picker.modeOpenMultiple);
    picker.appendFilter(getString("book-files"), "*.pdf; *.epub");
    if ((await picker.show()) !== picker.returnOK) return;
    const collection = win.ZoteroPane.getSelectedCollection();
    await importBookFiles(win, picker.files, {
      collectionID: collection?.id,
      libraryID: win.ZoteroPane.getSelectedLibraryID(),
    });
  } catch (error) {
    showImportError(win, error);
  } finally {
    busyWindows.delete(win);
  }
}

interface ImportContext {
  libraryID: number;
  collectionID?: number;
  title?: string;
}

interface ImportProgress {
  setText(text: string): void;
  setProgress(percent: number): void;
}

export function isBookFilePath(path: string): boolean {
  return /\.(pdf|epub)$/i.test(path);
}

function bookContentType(
  path: string,
): "application/pdf" | "application/epub+zip" {
  return /\.epub$/i.test(path) ? "application/epub+zip" : "application/pdf";
}

function assertBookFiles(paths: string[]): void {
  const unsupported = paths.find((path) => !isBookFilePath(path));
  if (unsupported) {
    throw new Error(
      getString("unsupported-file", { args: { file: unsupported } }),
    );
  }
}

function resolveImportContext(
  win: _ZoteroTypes.MainWindow,
  options: ImportBookOptions,
): ImportContext {
  const libraryID = options.libraryID ?? win.ZoteroPane.getSelectedLibraryID();
  const library = Zotero.Libraries.get(libraryID);
  if (!library || !library.editable || !library.filesEditable) {
    throw new Error(getString("library-not-editable"));
  }
  if (options.collectionID !== undefined) {
    const collection = Zotero.Collections.get(options.collectionID);
    if (!collection || collection.libraryID !== libraryID) {
      throw new Error(getString("collection-unavailable"));
    }
  }
  return {
    libraryID,
    collectionID: options.collectionID,
    title: options.title,
  };
}

async function createBookFromFiles(
  paths: string[],
  context: ImportContext,
  progress?: ImportProgress,
): Promise<Zotero.Item> {
  const book = new Zotero.Item("book");
  book.libraryID = context.libraryID;
  book.setField("title", context.title?.trim() || titleFromPath(paths[0]));
  if (context.collectionID !== undefined)
    book.addToCollection(context.collectionID);
  await book.saveTx({ skipSelect: true });

  const attachments: Zotero.Item[] = [];
  try {
    for (const [index, file] of paths.entries()) {
      progress?.setText(titleFromPath(file));
      progress?.setProgress(Math.round((index / paths.length) * 100));
      attachments.push(
        await Zotero.Attachments.importFromFile({
          file,
          parentItemID: book.id,
          title: titleFromPath(file),
          contentType: bookContentType(file),
        }),
      );
    }
    return book;
  } catch (error) {
    for (const attachment of attachments.reverse()) {
      try {
        await attachment.erase();
      } catch (cleanupError) {
        ztoolkit.log(
          "Failed to clean up a partially imported book",
          cleanupError,
        );
      }
    }
    try {
      await book.erase();
    } catch (cleanupError) {
      ztoolkit.log("Failed to clean up an imported book", cleanupError);
    }
    throw error;
  }
}

export async function importBookFiles(
  win: _ZoteroTypes.MainWindow,
  paths: string[],
  options: ImportBookOptions = {},
): Promise<Zotero.Item | undefined> {
  if (!paths.length) return undefined;
  assertBookFiles(paths);
  const context = resolveImportContext(win, options);

  const progress = new Zotero.ProgressWindow({ window: win });
  const icon = `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`;
  const itemProgress = new progress.ItemProgress(
    icon,
    context.title?.trim() || titleFromPath(paths[0]),
  );
  progress.changeHeadline(getString("importing-book"));
  progress.show();
  try {
    const book = await createBookFromFiles(paths, context, itemProgress);
    itemProgress.setProgress(100);
    progress.startCloseTimer(1500);
    await win.ZoteroPane.selectItems([book.id]);
    return book;
  } catch (error) {
    itemProgress.setError();
    progress.close();
    throw error;
  }
}

/**
 * Add each dropped book file as its own book, so that dropping one PDF onto
 * the empty bookshelf shows exactly one new card.
 */
export async function importBookPerFile(
  win: _ZoteroTypes.MainWindow,
  paths: string[],
): Promise<Zotero.Item[]> {
  const unique = [...new Set(paths)];
  if (!unique.length) return [];
  assertBookFiles(unique);
  const collection = win.ZoteroPane.getSelectedCollection();
  const context = resolveImportContext(win, {
    collectionID: collection?.id,
    libraryID: win.ZoteroPane.getSelectedLibraryID(),
  });

  const progress = new Zotero.ProgressWindow({ window: win });
  const icon = `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`;
  progress.changeHeadline(getString("importing-book"));
  progress.show();
  const books: Zotero.Item[] = [];
  try {
    for (const path of unique) {
      const itemProgress = new progress.ItemProgress(icon, titleFromPath(path));
      books.push(await createBookFromFiles([path], context, itemProgress));
      itemProgress.setProgress(100);
    }
    progress.startCloseTimer(1500);
  } catch (error) {
    progress.close();
    for (const book of books.reverse()) {
      try {
        await book.erase();
      } catch (cleanupError) {
        ztoolkit.log(
          "Failed to clean up a partially imported book drop",
          cleanupError,
        );
      }
    }
    throw error;
  }
  await win.ZoteroPane.selectItems(books.map((book) => book.id));
  return books;
}

export async function addFilesToBook(
  win: _ZoteroTypes.MainWindow,
  book: Zotero.Item,
  paths: string[],
): Promise<Zotero.Item[]> {
  if (!book.isRegularItem() || book.deleted || !book.isEditable())
    throw new Error(getString("book-not-editable"));
  if (!paths.length) return [];
  assertBookFiles(paths);
  const attachments: Zotero.Item[] = [];
  try {
    for (const file of paths) {
      attachments.push(
        await Zotero.Attachments.importFromFile({
          file,
          parentItemID: book.id,
          title: titleFromPath(file),
          contentType: bookContentType(file),
        }),
      );
    }
    return attachments;
  } catch (error) {
    for (const attachment of attachments.reverse()) {
      try {
        await attachment.erase();
      } catch (cleanupError) {
        ztoolkit.log(
          "Failed to clean up a partially added attachment",
          cleanupError,
        );
      }
    }
    throw error;
  }
}

export async function pickAndAddFilesToBook(
  win: _ZoteroTypes.MainWindow,
  book: Zotero.Item,
): Promise<void> {
  if (busyWindows.has(win)) return;
  busyWindows.add(win);
  try {
    const picker = await createFilePicker();
    picker.init(win, getString("add-attachments"), picker.modeOpenMultiple);
    picker.appendFilter(getString("book-files"), "*.pdf; *.epub");
    if ((await picker.show()) !== picker.returnOK) return;
    await addFilesToBook(win, book, picker.files);
  } catch (error) {
    showImportError(win, error);
  } finally {
    busyWindows.delete(win);
  }
}

export async function openBookAttachment(
  win: _ZoteroTypes.MainWindow,
  attachment: Zotero.Item,
): Promise<void> {
  if (!attachment.isFileAttachment())
    throw new Error(getString("attachment-unavailable"));
  const current = await Zotero.Items.getAsync(attachment.id);
  if (!current) throw new Error(getString("attachment-unavailable"));
  await win.ZoteroPane.viewItems([current], new win.MouseEvent("dblclick"));
}

export async function renameBookAttachment(
  win: _ZoteroTypes.MainWindow,
  attachment: Zotero.Item,
): Promise<void> {
  const current = await Zotero.Items.getAsync(attachment.id);
  if (!current || !current.isFileAttachment() || !current.isEditable())
    throw new Error(getString("book-not-editable"));
  const title = win.prompt(
    `${getString("rename-attachment")}\n${getString("rename-attachment-description")}`,
    current.getDisplayTitle(),
  );
  if (
    title === null ||
    !title.trim() ||
    title.trim() === current.getDisplayTitle()
  )
    return;
  current.setField("title", title.trim());
  await current.saveTx();
}

async function createFilePicker(): Promise<BookFilePicker> {
  if (filePickerFactory) return filePickerFactory();
  const { FilePicker } = (await ChromeUtils.importESModule(
    "chrome://zotero/content/modules/filePicker.mjs",
  )) as { FilePicker: new () => BookFilePicker };
  return new FilePicker();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function titleFromPath(path: string): string {
  const filename = path.replaceAll("\\", "/").split("/").at(-1) ?? path;
  return filename.replace(/\.(pdf|epub)$/i, "") || filename;
}

function showImportError(win: _ZoteroTypes.MainWindow, error: unknown): void {
  const message = errorMessage(error);
  ztoolkit.log("Zetara book import failed", { message, error });
  Services.prompt.alert(
    win as unknown as mozIDOMWindowProxy,
    getString("import-failed"),
    message,
  );
}

export function reportBookImportError(
  win: _ZoteroTypes.MainWindow,
  error: unknown,
): void {
  showImportError(win, error);
}
