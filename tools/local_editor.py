#!/usr/bin/env python3
"""Loopback-only preview server with in-browser Markdown block editing."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
POSTS = (ROOT / "_posts").resolve()
SITE = (ROOT / "_site").resolve()
EDITOR_SCRIPT = ROOT / "assets" / "js" / "local-editor.js"
EDITOR_STYLES = ROOT / "assets" / "css" / "local-editor.scss"
TOKEN = secrets.token_urlsafe(32)
BUILD_COMMAND = ["bundle", "exec", "jekyll", "build"]
EMPTY_BLOCK_PLACEHOLDER = "\u200b"


def split_front_matter(text: str) -> tuple[str, str]:
    match = re.match(r"\A(---\s*\n.*?\n---\s*\n)(.*)\Z", text, re.DOTALL)
    return (match.group(1), match.group(2)) if match else ("", text)


def markdown_blocks(text: str) -> list[dict[str, object]]:
    """Return editable headings, paragraphs, quotes, and individual list items."""
    front_matter, body = split_front_matter(text)
    offset = len(front_matter)
    lines = body.splitlines(keepends=True)
    blocks: list[dict[str, object]] = []
    position = 0
    index = 0
    fenced = False
    html_block = False
    paragraph_start: Optional[int] = None
    paragraph_lines: list[str] = []

    def add(start: int, end: int, raw: str, kind: str) -> None:
        nonlocal index
        blocks.append({
            "index": index,
            "start": offset + start,
            "end": offset + end,
            "markdown": raw.rstrip("\n"),
            "kind": kind,
            "revision": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        })
        index += 1

    def flush_paragraph(end: int) -> None:
        nonlocal paragraph_start, paragraph_lines
        if paragraph_start is not None:
            raw = "".join(paragraph_lines)
            add(paragraph_start, end, raw, "paragraph")
        paragraph_start = None
        paragraph_lines = []

    for line in lines:
        start = position
        position += len(line)
        stripped = line.strip()

        if stripped.startswith("```") or stripped.startswith("~~~"):
            flush_paragraph(start)
            fenced = not fenced
            continue
        if fenced:
            continue

        if html_block:
            if not stripped:
                html_block = False
            continue
        if stripped.startswith("<") and not stripped.startswith("<!--"):
            flush_paragraph(start)
            html_block = True
            continue

        heading = re.match(r"^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$", line.rstrip("\n"))
        if heading:
            flush_paragraph(start)
            add(start, position, line, "heading")
            continue

        list_item = re.match(r"^\s*(?:[-*+] |\d+[.)] )", line)
        if list_item:
            flush_paragraph(start)
            add(start, position, line, "list-item")
            continue

        if re.match(r"^\s*>\s?", line):
            flush_paragraph(start)
            add(start, position, line, "quote")
            continue

        if not stripped or re.match(r"^\s*(?:---+|___+|\*\*\*+)\s*$", line):
            flush_paragraph(start)
            continue

        if paragraph_start is None:
            paragraph_start = start
        paragraph_lines.append(line)

    flush_paragraph(position)
    return blocks


def safe_post(relative: str) -> Path:
    candidate = (ROOT / unquote(relative)).resolve()
    if candidate.parent != POSTS or candidate.suffix.lower() not in {".md", ".markdown"}:
        raise ValueError("Only Markdown files directly inside _posts may be edited")
    if not candidate.is_file():
        raise ValueError("Post source does not exist")
    return candidate


def source_for_url(url_path: str) -> Optional[Path]:
    clean = unquote(url_path).rstrip("/")
    for source in POSTS.glob("*.*"):
        match = re.match(r"(\d{4})-(\d{2})-(\d{2})-(.+)\.(?:md|markdown)$", source.name)
        if not match:
            continue
        year, month, day, slug = match.groups()
        defaults = {
            f"/{year}/{month}/{day}/{slug}.html",
            f"/{year}/{month}/{day}/{slug}",
        }
        text = source.read_text(encoding="utf-8")
        front, _ = split_front_matter(text)
        permalink = re.search(r"^permalink:\s*['\"]?([^'\"\n]+)", front, re.MULTILINE)
        if permalink:
            defaults.add(permalink.group(1).strip().rstrip("/"))
        if clean in defaults:
            return source
    return None


def build_site() -> tuple[bool, str]:
    environment = os.environ.copy()
    environment["JEKYLL_ENV"] = "development"
    result = subprocess.run(
        BUILD_COMMAND,
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    output = (result.stdout + "\n" + result.stderr).strip()
    return result.returncode == 0, output[-4000:]


class EditorHandler(SimpleHTTPRequestHandler):
    server_version = "DM2K9LocalEditor/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def end_headers(self) -> None:
        # Local editing should always reflect the latest Jekyll build, including
        # overwritten assets whose public URL has not changed.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _is_loopback_request(self) -> bool:
        host = (self.headers.get("Host") or "").split(":", 1)[0]
        return self.client_address[0] in {"127.0.0.1", "::1"} and host in {
            "127.0.0.1", "localhost", "[::1]"
        }

    def _authorized(self) -> bool:
        if not self._is_loopback_request():
            return False
        if self.headers.get("X-Local-Editor-Token") != TOKEN:
            return False
        origin = self.headers.get("Origin")
        return not origin or origin == f"http://{self.headers.get('Host')}"

    def _json(self, status: int, payload: dict[str, object]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/__editor/blocks":
            if not self._authorized():
                self._json(403, {"error": "Local editor authorization failed"})
                return
            try:
                source = safe_post(parse_qs(parsed.query).get("source", [""])[0])
                blocks = markdown_blocks(source.read_text(encoding="utf-8"))
                public = [
                    {key: block[key] for key in ("index", "markdown", "kind", "revision")}
                    for block in blocks
                ]
                self._json(200, {"blocks": public})
            except (OSError, ValueError) as error:
                self._json(400, {"error": str(error)})
            return

        source = source_for_url(parsed.path)
        if source and self._is_loopback_request():
            self._serve_editable_html(parsed.path, source)
            return
        super().do_GET()

    def _serve_editable_html(self, request_path: str, source: Path) -> None:
        relative = request_path.lstrip("/")
        candidates = [SITE / relative]
        if not Path(relative).suffix:
            candidates.extend([SITE / f"{relative}.html", SITE / relative / "index.html"])
        target = next((path for path in candidates if path.is_file()), None)
        if not target:
            self.send_error(404)
            return

        document = target.read_text(encoding="utf-8")
        config = html.escape(json.dumps({
            "token": TOKEN,
            "source": source.relative_to(ROOT).as_posix(),
        }), quote=True)
        editor_script = EDITOR_SCRIPT.read_text(encoding="utf-8").replace("</script", "<\\/script")
        editor_styles = EDITOR_STYLES.read_text(encoding="utf-8")
        editor_styles = re.sub(r"\A---\s*\n---\s*\n", "", editor_styles)
        editor_styles = editor_styles.replace("</style", "<\\/style")
        injection = (
            f'<style id="local-editor-styles">{editor_styles}</style>'
            f'<script id="local-editor-config" type="application/json" data-config="{config}"></script>'
            f'<script id="local-editor-script">{editor_script}</script>'
        )
        document = document.replace("</body>", f"{injection}</body>", 1)
        data = document.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        endpoints = {
            "/__editor/save", "/__editor/delete", "/__editor/move", "/__editor/insert"
        }
        if self.path not in endpoints or not self._authorized():
            self._json(403, {"error": "Local editor authorization failed"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 1_000_000:
                raise ValueError("Invalid request size")
            payload = json.loads(self.rfile.read(length))
            source = safe_post(str(payload.get("source", "")))
            block_index = int(payload.get("index", -1))
            revision = str(payload.get("revision", ""))

            current = source.read_text(encoding="utf-8")
            blocks = markdown_blocks(current)
            if block_index < 0 or block_index >= len(blocks):
                raise ValueError("The source block no longer exists; reload and try again")
            block = blocks[block_index]
            if block["revision"] != revision:
                self._json(409, {"error": "This block changed on disk; reload before editing it"})
                return

            deleting = self.path == "/__editor/delete"
            inserted_index: Optional[int] = None

            if self.path == "/__editor/move":
                target_index = int(payload.get("targetIndex", -1))
                target_revision = str(payload.get("targetRevision", ""))
                if target_index < 0 or target_index >= len(blocks) or target_index == block_index:
                    raise ValueError("The adjacent text block no longer exists")
                target = blocks[target_index]
                if target["revision"] != target_revision:
                    self._json(409, {"error": "The adjacent block changed on disk; reload first"})
                    return

                first, second = sorted(
                    (block, target), key=lambda candidate: int(candidate["start"])
                )
                first_start, first_end = int(first["start"]), int(first["end"])
                second_start, second_end = int(second["start"]), int(second["end"])
                first_raw = current[first_start:first_end]
                second_raw = current[second_start:second_end]
                updated = (
                    current[:first_start]
                    + second_raw
                    + current[first_end:second_start]
                    + first_raw
                    + current[second_end:]
                )
            elif self.path == "/__editor/insert":
                end = int(block["end"])
                separator = "\n" if current[:end].endswith("\n") else "\n\n"
                updated = current[:end] + separator + EMPTY_BLOCK_PLACEHOLDER + "\n" + current[end:]
                inserted_index = block_index + 1
            else:
                replacement = "" if deleting else str(payload.get("markdown", "")).rstrip("\n")
                if not deleting and not replacement.strip():
                    raise ValueError("A text block cannot be empty; use its delete control instead")
                original = current[int(block["start"]):int(block["end"])]
                trailing_newline = "" if deleting else ("\n" if original.endswith("\n") else "")
                updated = (
                    current[:int(block["start"])]
                    + replacement
                    + trailing_newline
                    + current[int(block["end"]):]
                )

            with tempfile.NamedTemporaryFile(
                "w", encoding="utf-8", dir=source.parent, delete=False
            ) as temporary:
                temporary.write(updated)
                temporary_path = Path(temporary.name)
            os.replace(temporary_path, source)

            built, output = build_site()
            status = 200 if built else 500
            self._json(status, {
                "saved": True,
                "built": built,
                "index": inserted_index,
                "message": (
                    "Deleted and rebuilt" if deleting and built else
                    "Deleted, but the Jekyll rebuild failed" if deleting else
                    "Moved and rebuilt" if self.path == "/__editor/move" and built else
                    "Moved, but the Jekyll rebuild failed" if self.path == "/__editor/move" else
                    "Added and rebuilt" if self.path == "/__editor/insert" and built else
                    "Added, but the Jekyll rebuild failed" if self.path == "/__editor/insert" else
                    "Saved and rebuilt" if built else
                    "Saved, but the Jekyll rebuild failed"
                ),
                "buildOutput": output,
            })
        except (json.JSONDecodeError, OSError, TypeError, ValueError) as error:
            self._json(400, {"error": str(error)})

    def log_message(self, format: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4010)
    parser.add_argument(
        "--no-build", action="store_true",
        help="serve the existing _site directory without the initial Jekyll build",
    )
    args = parser.parse_args()

    if not args.no_build:
        ok, output = build_site()
        if not ok:
            raise SystemExit(f"Initial Jekyll build failed:\n{output}")
    if not SITE.is_dir():
        raise SystemExit("_site does not exist; run a Jekyll build first")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), EditorHandler)
    print(f"Local post editor: http://127.0.0.1:{args.port}")
    print("Press Ctrl-C to stop. The editor is available only through this server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local editor.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
