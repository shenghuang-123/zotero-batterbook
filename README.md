# Zetara

[![zotero target version](https://img.shields.io/badge/Zotero-10-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)

Zetara is a [Zotero](https://www.zotero.org) extension for storing, managing
and reading PDF books, including files of a thousand pages or more. It shows
books as a bookshelf of vertical cover cards and leaves reading to Zotero's own
reader.

## Features

- **Bookshelf view**
  - replaces the item list with a grid of vertical book cards
  - the cover is the first page of the book's PDF attachment, cropped to the
    aspect ratio of a book cover
  - hovering a book card fans out its attached book files, each opening on click
  - the bookshelf button at the right end of the item toolbar switches between
    the bookshelf and Zotero's list
  - drag PDF/EPUB files from the file manager onto the empty shelf to add them
    as books, or onto a book card to add them as further editions
- **Manual import**
  - the toolbar add-book button imports several PDF/EPUB files as one book
    with several attachments, such as the original and a translation
- **Native reading**
  - double-clicking a book opens its first PDF attachment in Zotero's reader,
    exactly as Zotero does for a regular item
  - annotations, tabs, search and layout stay native
- **Large books**
  - only the first page is rendered for covers
  - large files are read in small byte ranges instead of whole
  - rendered covers are cached in memory and on disk
- **Several editions per book**
  - add a book with one or more PDF/EPUB files, such as the original and a
    Chinese translation
  - attach further editions later from the **Book files** item pane section
  - open or rename each attachment there
- **Works alongside other plugins**
  - styles are scoped to Zetara's own views
  - Ethereal Style's list-view columns, item pane sections and native reader
    behaviour are left untouched
  - opening the bookshelf closes Ethereal Style's gallery overlay so the two
    cover views do not hide each other

## Installation

Build the plugin and install the resulting `.xpi` in Zotero:

```sh
npm install
npm run build
```

Then in Zotero open `Tools` → `Plugins` → gear icon → `Install Plugin From
File…` and choose the `.xpi` from `.scaffold/build/`.

## Development

```sh
npm start          # development build with hot reload
npm test -- --no-watch
npm run lint:check
```

On Windows, set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` to the Zotero executable and
`ZOTERO_PLUGIN_KILL_COMMAND` to a cleanup command that only terminates the
scaffold's isolated test profile before running `npm test`.

## Acknowledgements

- Based on [Cover View for Zotero](https://github.com/paulluis-roehl/zotero-cover-view)
  by Paul Luis Röhl, which in turn uses the
  [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
  by [@windingwind](https://github.com/windingwind).
- Inspired by [this](https://forums.zotero.org/discussion/121736/feature-request-cover-flow-or-book-jacket-image-display-view)
  discussion on the Zotero forum.
- Optional ISBN and metadata cover lookup is provided by
  [Open Library](https://openlibrary.org/) through its
  [Covers API](https://openlibrary.org/dev/docs/api/covers).
- Some performance improvements are based on
  [ZoteroThumbLibrary](https://github.com/gchapron/ZoteroThumbLibrary).

## License

AGPL-3.0-or-later. See the upstream Cover View license and attribution above.
