# Local browser editing

The browser editor is provided by a separate loopback-only preview server. It is never loaded by the published site.

Start it from the repository root:

```sh
python3 tools/local_editor.py
```

Then open <http://127.0.0.1:4010> and navigate to a post. Editable headings, paragraphs, quotations and list items receive a faint dashed outline when hovered.

- Click a block to edit its original Markdown.
- Press **Enter** to save and rebuild the site.
- Press **Shift+Enter** to add a line inside the block.
- Press **Escape** to cancel.
- Click **↑** or **↓** at the left corners to swap a block with the text block above or below it.
- Click **+** at the middle of the bottom border to insert a new block below and open a five-line editor.
- Click **−** at the middle of the right border to mark a proofread block as final; it changes to **✓**. Click it again to clear the mark. This status is stored only in the local browser and never enters the Markdown or published site.
- Click the small **×** at a block's top-right corner to delete that block immediately.

The local editing notice shows approved blocks against the current total (for example, `4/35`) and a progress bar. The count updates when approval marks change and is recalculated after blocks are inserted or deleted. Use the adjacent **prev** and **next** links to jump between blocks that have not yet been marked final.

The server runs a Jekyll build when it starts and after each save. It therefore needs the repository's Ruby dependencies installed (`bundle install`). If `_site` already exists and you only want to inspect the interface, start it with `python3 tools/local_editor.py --no-build`; saves will still attempt a rebuild.

The editor interface itself is injected directly from the source tree, so changes to its JavaScript and CSS are available after restarting the Python server even when `--no-build` is used.

## Safety boundary

The editing server:

- binds only to `127.0.0.1`;
- accepts writes only for Markdown files directly inside `_posts`;
- requires an unguessable per-session token and same-origin requests;
- detects if the selected block changed on disk before saving;
- writes through an atomic file replacement;
- injects the editor bootstrap only into HTML responses served locally.

Stopping the Python process removes all editing capability. The generated production HTML contains no editor configuration or authorization token.
