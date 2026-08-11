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

The server runs a Jekyll build when it starts and after each save. It therefore needs the repository's Ruby dependencies installed (`bundle install`). If `_site` already exists and you only want to inspect the interface, start it with `python3 tools/local_editor.py --no-build`; saves will still attempt a rebuild.

## Safety boundary

The editing server:

- binds only to `127.0.0.1`;
- accepts writes only for Markdown files directly inside `_posts`;
- requires an unguessable per-session token and same-origin requests;
- detects if the selected block changed on disk before saving;
- writes through an atomic file replacement;
- injects the editor bootstrap only into HTML responses served locally.

Stopping the Python process removes all editing capability. The generated production HTML contains no editor configuration or authorization token.
