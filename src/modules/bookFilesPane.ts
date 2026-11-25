import {
  openBookAttachment,
  pickAndAddFilesToBook,
  renameBookAttachment,
} from "./bookImport";
import { getLocaleID, getString } from "../utils/locale";

type SectionProps = _ZoteroTypes.ItemPaneManagerSection.SectionHookArgs;
interface SectionState {
  props?: SectionProps;
  generation: number;
  stop: () => void;
}

const sections = new Map<HTMLDivElement, SectionState>();
let paneID: string | undefined;
let notifierID: string | undefined;

function getBook(props: SectionProps): Zotero.Item | undefined {
  const { item, tabType, doc } = props;
  const selected = (
    doc.defaultView as _ZoteroTypes.MainWindow
  ).ZoteroPane.getSelectedItems(true);
  return tabType === "library" &&
    item.isRegularItem() &&
    selected.length === 1 &&
    selected[0] === item.id
    ? item
    : undefined;
}

function bookAttachments(item: Zotero.Item): Zotero.Item[] {
  return item
    .getAttachments(true)
    .map((id) => Zotero.Items.get(id))
    .filter(
      (attachment): attachment is Zotero.Item =>
        !!attachment && attachment.isFileAttachment(),
    );
}

async function renderBookFiles(props: SectionProps): Promise<void> {
  const state = sections.get(props.body);
  if (!state) return;
  state.props = props;
  const generation = ++state.generation;
  const book = getBook(props);
  props.setEnabled(!!book);
  if (!book) return;

  const attachments = bookAttachments(book);
  props.setSectionSummary(String(attachments.length));
  props.setSectionButtonStatus("add", { disabled: !props.editable });
  const list = props.body.querySelector<HTMLDivElement>(
    ".zetara-book-file-list",
  )!;
  const empty = props.body.querySelector<HTMLDivElement>(
    ".zetara-book-files-empty",
  )!;
  const doc = props.doc;
  list.replaceChildren();
  empty.hidden = attachments.length > 0;

  for (const attachment of attachments) {
    const row = doc.createElement("div");
    row.className = "zetara-book-file";
    row.dataset.itemId = String(attachment.id);

    const details = doc.createElement("div");
    details.className = "zetara-book-file-details";
    const title = doc.createElement("div");
    title.className = "zetara-book-file-title";
    title.textContent = attachment.getDisplayTitle();
    const meta = doc.createElement("div");
    meta.className = "zetara-book-file-meta";
    details.append(title, meta);

    const actions = doc.createElement("div");
    actions.className = "zetara-book-file-actions";
    const open = doc.createElement("button");
    open.type = "button";
    open.className = "zetara-book-file-open";
    open.textContent = getString("open-attachment");
    open.dataset.action = "open";
    open.dataset.itemId = String(attachment.id);
    const rename = doc.createElement("button");
    rename.type = "button";
    rename.className = "zetara-book-file-rename";
    rename.textContent = getString("rename-attachment");
    rename.dataset.action = "rename";
    rename.dataset.itemId = String(attachment.id);
    rename.disabled = !props.editable;
    actions.append(open, rename);
    row.append(details, actions);
    list.appendChild(row);

    void describeAttachment(attachment, meta).then((description) => {
      if (
        sections.get(props.body) !== state ||
        state.generation !== generation ||
        !row.isConnected
      )
        return;
      meta.textContent = description;
    });
  }
}

async function describeAttachment(
  attachment: Zotero.Item,
  meta: HTMLElement,
): Promise<string> {
  const extension =
    attachment.attachmentFilename.split(".").at(-1)?.toUpperCase() ?? "";
  const path = await attachment.getFilePathAsync();
  if (!path) return getString("attachment-missing");
  try {
    const { size } = await IOUtils.stat(path);
    return [extension, typeof size === "number" ? formatBytes(size) : ""]
      .filter(Boolean)
      .join(" · ");
  } catch {
    return getString("attachment-missing");
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

async function handleClick(
  props: SectionProps,
  event: MouseEvent,
): Promise<void> {
  const button = (event.target as Element | null)?.closest(
    "button[data-action]",
  ) as HTMLButtonElement | null;
  const book = getBook(props);
  if (!button || !book) return;
  const win = props.doc.defaultView as _ZoteroTypes.MainWindow;
  try {
    if (button.dataset.action === "add") {
      await pickAndAddFilesToBook(win, book);
    } else {
      const attachment = Zotero.Items.get(Number(button.dataset.itemId));
      if (!attachment) return;
      if (button.dataset.action === "open")
        await openBookAttachment(win, attachment);
      if (button.dataset.action === "rename")
        await renameBookAttachment(win, attachment);
    }
    const current = sections.get(props.body)?.props;
    if (current) await renderBookFiles(current);
  } catch (error) {
    reportError(win, error);
  }
}

function reportError(win: _ZoteroTypes.MainWindow, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  ztoolkit.log("Zetara book file action failed", error);
  Services.prompt.alert(
    win as unknown as mozIDOMWindowProxy,
    getString("book-files-error"),
    message,
  );
}

function refreshSections(): void {
  for (const state of sections.values()) {
    if (state.props) void renderBookFiles(state.props);
  }
}

function notify(event: string, type: string): void {
  if (type !== "item" || !["add", "modify", "delete"].includes(event)) return;
  refreshSections();
}

export function registerBookFilesPane(): void {
  if (paneID) return;
  const icons = `chrome://${addon.data.config.addonRef}/content/icons`;
  const registered = Zotero.ItemPaneManager.registerSection({
    paneID: "zetara-book-files",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("item-pane-book-files"),
      icon: `${icons}/book-files-16.svg`,
    },
    sidenav: {
      l10nID: getLocaleID("item-pane-book-files"),
      icon: `${icons}/book-files-20.svg`,
    },
    sectionButtons: [
      {
        type: "add",
        icon: `${icons}/add-book.svg`,
        l10nID: getLocaleID("add-attachments"),
        onClick: (props) => {
          const book = getBook(props);
          if (!book) return;
          const win = props.doc.defaultView as _ZoteroTypes.MainWindow;
          void pickAndAddFilesToBook(win, book)
            .then(() => {
              const current = sections.get(props.body)?.props;
              if (current) void renderBookFiles(current);
            })
            .catch((error) => reportError(win, error));
        },
      },
    ],
    bodyXHTML: `<div class="zetara-book-files">
      <div class="zetara-book-files-empty" data-l10n-id="zetara-no-book-files"></div>
      <div class="zetara-book-file-list"></div>
    </div>`,
    onInit: ({ body, doc }) => {
      const click = (event: MouseEvent) => {
        const state = sections.get(body);
        if (state?.props) void handleClick(state.props, event);
      };
      body.addEventListener("click", click);
      sections.set(body, {
        generation: 0,
        stop: () => body.removeEventListener("click", click),
      });
    },
    onItemChange: (props) => void renderBookFiles(props),
    onRender: () => {},
    onDestroy: ({ body }) => {
      sections.get(body)?.stop();
      sections.delete(body);
    },
  });
  if (!registered) return;
  paneID = registered;
  const order = ((Zotero.Prefs.get("sidenav.order") as string) || "info").split(
    ",",
  );
  if (!order.includes(paneID)) {
    const attachments = order.indexOf("attachments");
    order.splice(attachments < 0 ? order.length : attachments, 0, paneID);
    Zotero.Prefs.set("sidenav.order", order.join(","));
  }
  notifierID = Zotero.Notifier.registerObserver(
    { notify },
    ["item"],
    "zetara-book-files",
  );
}

export function unregisterBookFilesPane(): void {
  if (notifierID) Zotero.Notifier.unregisterObserver(notifierID);
  notifierID = undefined;
  for (const state of sections.values()) state.stop();
  sections.clear();
  if (paneID) Zotero.ItemPaneManager.unregisterSection(paneID);
  paneID = undefined;
}
