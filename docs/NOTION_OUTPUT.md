# Notion Output Format

## Notes mode + page parent

Creates Notion blocks under the target page:

- one paragraph per note line
- lines starting with `Snippet:` are emphasized
- `Sources` section (bulleted links, deduplicated)
- optional screenshot link + image block
- optional tags paragraph

## To-Do mode + page parent

Creates:

- one `to_do` block with note text
- primary source link and optional screenshot link in the same item text
- additional source links as a `Sources` bulleted section
- optional screenshot image block

## Database parent (notes or todo)

Creates a Notion page in the database:

- `Name` title property
- `URL` property
- child blocks for:
  - `Sources`
  - optional screenshot link + image
  - optional tags

## Source Handling

Sources are extracted from:

- current page URL
- markdown links in text (`[label](https://...)`)
- raw URLs in text (`https://...`)

Duplicates are removed before writing.
