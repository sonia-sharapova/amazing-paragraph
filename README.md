# The Amazing Paragraph

A website for a literary magazine that only publishes paragraphs. It has no dependencies: one Node server, plain HTML/CSS/JS, and content stored in two JSON files.

```
npm start                         # http://localhost:4321
ADMIN_PASSWORD=… PORT=80 npm start
```

## Pages
- `/`: every paragraph, newest first. The latest is set large, older ones follow on a numbered timeline, and the list loads more as you scroll. A running index sits on the right on wide screens.
- `/archive`: a grid, or a numbered list ("Index"), with filters for issue and tag and a choice of order.
- `/about`: About, Formats, Submissions, Contact. The **Editor login** link is in the footer.
- `/p/12`: a single paragraph with links to the previous and next ones. This is the link to use from Instagram.
- `/admin`: the editor. It is protected by `ADMIN_PASSWORD`.

## How the customer updates the site
They log in through **About → Editor login** and use the form. No files, no code, no redeploy. Saving publishes immediately. A future publish date schedules a paragraph, and "Draft" keeps it hidden. **Download backup** saves everything as one JSON file.

## Storage format, and why
Content lives in `data/paragraphs.json`, with site text and settings in `data/site.json`.

- **JSON rather than a spreadsheet or Markdown:** the editor writes to it safely (atomic save plus a `.bak` of the previous version). It holds structured metadata without any parsing guesswork. It is one file to back up, and it is readable in any text editor if you ever need to fix something by hand.
- **Spreadsheet (Google Sheets/CSV):** familiar, but one stray edit breaks columns, and the site would depend on an outside service.
- **Markdown file per paragraph:** good for developers using git, but the customer would need to use git or FTP.

### Paragraph record
```json
{
  "id": "uuid",               // stable internal id
  "number": 12,               // publication order, auto-assigned
  "label": "",                // optional per-paragraph override, e.g. "No. 12 · Winter"
  "title": "", "author": "",
  "text": "One paragraph. *italic* and **bold** allowed.",
  "published": "2026-11-16",  // YYYY-MM-DD; future = scheduled
  "issue": "Issue 3", "series": "", "tags": ["night"],
  "appearedIn": ["Print", "Instagram"],
  "status": "published",      // or "draft"
  "notes": ""                 // private, never shown
}
```

### Flexible labelling
Labels come from `labelFormat` in `site.json`, which is editable in the editor under Site settings. A paragraph's own `label` overrides it.
Tokens: `{n}` → 12, `{n:3}` → 012, `{roman}` → XII, `{issue}`, `{series}`, `{year}`.
Examples: `No. {n}`, `{issue} / {n:2}`, `¶ {roman}`.

## Hosting notes
- Set `ADMIN_PASSWORD` (the dev default is `paragraph`).
- Run behind a reverse proxy (Caddy/nginx) with HTTPS, and pass `X-Forwarded-Proto` so the session cookie is marked Secure.
- Keep it running with pm2 or systemd. Back up the `data/` folder; it is the whole site.
