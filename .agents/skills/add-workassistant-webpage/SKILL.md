---
name: add-workassistant-webpage
description: Add, replace, remove, validate, build, and optionally publish standalone HTML pages linked from WorkAssistant's 「其他」 section. Use for webpage files under public/files or when the user asks to add another webpage to WorkAssistant.
---

# Add a WorkAssistant webpage

Work in the WorkAssistant repository. Preserve unrelated changes and inspect `git status` before editing.

## Add or update a page

1. Resolve the exact source file and verify that it exists. Default the destination to `public/files/<source filename>` unless the user specifies another name or folder.
2. Copy the HTML without rewriting its contents. If it depends on local CSS, JavaScript, images, fonts, or data files, preserve their relative directory structure under `public/files`. Do not copy unrelated source-directory contents.
3. Treat added pages as trusted same-origin code. If the source is untrusted or downloaded from a third party, warn that scripts in it may act with the WorkAssistant site's origin before integrating it.
4. Run `npm run files:index`. Never hand-edit `public/files/index.json`; it is generated from `.html` and `.htm` files and their `<title>` elements.
5. Run `npm run build`. This is required because the VPS serves `dist`, not `public`. Fix build errors before handing off.
6. Verify:
   - the page appears in `public/files/index.json`;
   - the corresponding file exists under `dist/files`;
   - the source and built copies match when the page is a standalone HTML file; and
   - `git diff --check` succeeds.

When mobile behavior is requested or the page changed responsively, test representative portrait, narrow portrait, and landscape viewports. Otherwise do not add browser QA beyond the normal build checks.

## Remove a page

Delete only the explicitly requested page and its page-specific assets. Regenerate the index and rebuild so stale copies are removed from `dist`. Report what was removed and whether Git can recover it.

## Commit, push, and deploy

Do not commit, push, or change the VPS unless the user requests it.

When commit and push are requested, prefer:

```bash
./scripts/commit-and-push.sh "feat: add <page name>"
```

This script rebuilds before committing. After it finishes, verify that the working tree is clean and `HEAD` matches `origin/main`.

For a user-operated VPS update, provide:

```bash
cd /var/www/work-assistant
bash deploy/update.sh
```

「其他」只展示链接列表，不在 WorkAssistant 内嵌网页。
