export interface BookFile {
  id: number;
  /** Zotero's CSS icon name for the attachment, e.g. attachmentPDF. */
  iconName: string;
  title: string;
}

export interface AttachmentIndicator {
  files: BookFile[];
}

/** The book files a card can open, excluding notes, links and snapshots. */
export function getAttachmentIndicator(
  item: Zotero.Item,
): AttachmentIndicator | undefined {
  if (!item.isRegularItem()) return undefined;
  const attachments = item
    .getAttachments()
    .map((id) => Zotero.Items.get(id))
    .filter(
      (attachment): attachment is Zotero.Item =>
        !!attachment && attachment.isFileAttachment(),
    );
  if (!attachments.length) return undefined;
  return {
    files: attachments.map((attachment) => ({
      id: attachment.id,
      iconName: attachment.getItemTypeIconName?.() || "",
      title: attachment.getDisplayTitle(),
    })),
  };
}
