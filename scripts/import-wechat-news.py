#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把你已有权使用的公众号文章，筛选后写入本站新闻中心。

本脚本不会登录微信、不会爬取公众号。
请先向宣传部门要授权转载的文稿，或从公众号后台导出，
把文章放到 content/import/ 后再运行。

支持两种来源（可混放）：
  1) JSON：一篇一个 .json，字段见 content/import/example.article.json
  2) 本地 HTML：用浏览器「另存为完整网页」保存的微信文章（.html + 同名_files）

筛选规则：
  - 日期在近 2 年内
  - 标题或正文含香港公司相关关键词（香港、港鐵、EEBHK、荃灣等）
  - 图片只收正文里的静态图（jpg/jpeg/png/webp），跳过 gif 等动图

用法（在仓库根目录）：
  python scripts/import-wechat-news.py --dry-run
  python scripts/import-wechat-news.py
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORT_DIR = ROOT / "content" / "import"
NEWS_JSON = ROOT / "content" / "news.json"
UPLOAD_DIR = ROOT / "uploads" / "news"

HK_KEYWORDS = [
    "香港",
    "港鐵",
    "港铁",
    "eebhk",
    "荃灣",
    "荃湾",
    "屯門",
    "屯门",
    "東涌",
    "东涌",
    "古洞",
    "觀塘",
    "观塘",
    "港島",
    "港岛",
    "沙中線",
    "沙中线",
    "hong kong",
    "hongkong",
    "mtr",
    "tsuen wan",
    "tuen mun",
    "tung chung",
    "kwu tung",
    "kwun tong",
]

STATIC_EXT = {".jpg", ".jpeg", ".png", ".webp"}
SKIP_EXT = {".gif", ".svg", ".mp4", ".webm"}

DATE_PATTERNS = [
    re.compile(r"(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})"),
    re.compile(r"(20\d{2})年(\d{1,2})月(\d{1,2})日"),
]

EDITOR_RE = re.compile(r"(?:编辑|編輯|责编|責編)\s*[:：]\s*([^\s，,。；;]+)")
REVIEWER_RE = re.compile(r"(?:审核|審核|核稿|审校|審校)\s*[:：]\s*([^\s，,。；;]+)")


def cutoff_date() -> date:
    today = date.today()
    try:
        return today.replace(year=today.year - 2)
    except ValueError:
        return today - timedelta(days=730)


def parse_date(text: str) -> date | None:
    if not text:
        return None
    text = str(text).strip()
    for pat in DATE_PATTERNS:
        m = pat.search(text)
        if m:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            try:
                return date(y, mo, d)
            except ValueError:
                return None
    return None


def is_hk_related(*parts: str) -> bool:
    blob = " ".join(p or "" for p in parts).lower()
    return any(k.lower() in blob for k in HK_KEYWORDS)


def is_static_image(path: Path) -> bool:
    ext = path.suffix.lower()
    if ext in SKIP_EXT or ext not in STATIC_EXT:
        return False
    if ext == ".gif":
        return False
    try:
        head = path.read_bytes()[:16]
    except OSError:
        return False
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return False
    return True


def slugify(text: str) -> str:
    ascii_part = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return ascii_part or "news"


def first_nonempty(*vals: str) -> str:
    for v in vals:
        if v and str(v).strip():
            return str(v).strip()
    return ""


class WeChatHTML(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._title_bits: list[str] = []
        self._body_bits: list[str] = []
        self._capture = ""
        self.title = ""
        self.date_text = ""
        self.body = ""
        self.images: list[str] = []
        self._in_content = False
        self._skip_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        eid = ad.get("id", "")
        cls = ad.get("class", "")
        if tag == "script":
            self._skip_script = True
            return
        if eid == "activity-name" or "rich_media_title" in cls:
            self._capture = "title"
        elif eid in {"publish_time", "publish_time_detail"} or "publish_time" in cls:
            self._capture = "date"
        elif eid == "js_content" or "rich_media_content" in cls:
            self._in_content = True
        if tag == "img" and self._in_content:
            src = first_nonempty(ad.get("data-src"), ad.get("data-original"), ad.get("src"))
            if src and "wx_fmt=gif" not in src.lower() and not src.lower().endswith(".gif"):
                self.images.append(src)
        if tag == "meta":
            prop = ad.get("property", "")
            name = ad.get("name", "")
            content = ad.get("content", "")
            if prop in {"og:title", "twitter:title"} and not self.title:
                self.title = content
            if prop in {"article:published_time", "og:release_date"} or name == "publish_date":
                self.date_text = self.date_text or content

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self._skip_script = False
        if tag in {"h1", "h2", "em", "span"} and self._capture:
            self._capture = ""
        if tag == "div" and self._in_content and not self._capture:
            self._in_content = False
            self._body_bits.append("\n\n")

    def handle_data(self, data: str) -> None:
        if self._skip_script:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if not text:
            return
        if self._capture == "title":
            self._title_bits.append(text)
        elif self._capture == "date":
            self.date_text += text
        elif self._in_content:
            self._body_bits.append(text)

    def finish(self) -> None:
        if self._title_bits:
            self.title = "".join(self._title_bits).strip() or self.title
        self.body = re.sub(r"\n{3,}", "\n\n", "\n".join(self._body_bits)).strip()


def resolve_local_image(html_path: Path, src: str) -> Path | None:
    if src.startswith("http://") or src.startswith("https://") or src.startswith("//"):
        return None
    src = src.split("?")[0]
    candidates = [
        html_path.parent / src,
        html_path.parent / Path(src).name,
        html_path.parent / (html_path.stem + "_files") / Path(src).name,
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def copy_static_images(paths: list[Path], prefix: str) -> list[str]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    out: list[str] = []
    for i, src in enumerate(paths, start=1):
        if not is_static_image(src):
            continue
        dest_name = f"{prefix}-{i}{src.suffix.lower()}"
        dest = UPLOAD_DIR / dest_name
        shutil.copy2(src, dest)
        out.append(f"uploads/news/{dest_name}")
    return out


def article_from_json(path: Path) -> dict | None:
    data = json.loads(path.read_text(encoding="utf-8"))
    title = first_nonempty(data.get("title"), (data.get("title_zh") or ""))
    body = first_nonempty(data.get("body"), data.get("body_zh"))
    dt = parse_date(str(data.get("date") or ""))
    images = []
    for raw in data.get("images") or []:
        p = Path(raw)
        if not p.is_absolute():
            p = path.parent / p
        if p.is_file():
            images.append(p)
    return {
        "source_file": path.name,
        "date": dt,
        "title": title,
        "title_en": first_nonempty(data.get("title_en"), data.get("en_title")),
        "body": body,
        "body_en": first_nonempty(data.get("body_en"), data.get("en_body")),
        "editor": first_nonempty(data.get("editor")),
        "reviewer": first_nonempty(data.get("reviewer")),
        "source": first_nonempty(data.get("source")),
        "image_files": images,
    }


def article_from_html(path: Path) -> dict | None:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    parser = WeChatHTML()
    parser.feed(raw)
    parser.finish()
    text_all = parser.title + "\n" + parser.body + "\n" + raw[-2000:]
    local_images = []
    for src in parser.images:
        found = resolve_local_image(path, src)
        if found:
            local_images.append(found)
    editor_m = EDITOR_RE.search(text_all)
    reviewer_m = REVIEWER_RE.search(text_all)
    return {
        "source_file": path.name,
        "date": parse_date(parser.date_text) or parse_date(raw[:3000]),
        "title": parser.title,
        "title_en": "",
        "body": parser.body,
        "body_en": "",
        "editor": editor_m.group(1) if editor_m else "",
        "reviewer": reviewer_m.group(1) if reviewer_m else "",
        "source": "",
        "image_files": local_images,
    }


def load_candidates() -> list[dict]:
    items: list[dict] = []
    if not IMPORT_DIR.is_dir():
        return items
    for path in sorted(IMPORT_DIR.iterdir()):
        name = path.name.lower()
        if name.startswith("_") or name.startswith("example"):
            continue
        if path.suffix.lower() == ".json":
            items.append(article_from_json(path))
        elif path.suffix.lower() in {".html", ".htm"}:
            items.append(article_from_html(path))
    return [x for x in items if x]


def to_news_item(raw: dict, copied: list[str]) -> dict:
    dt: date = raw["date"]
    title = raw["title"]
    news_id = f"{dt.isoformat()}-{slugify(raw['title_en'] or title)}"
    summary = (raw["body"] or "")[:80].replace("\n", " ")
    return {
        "id": news_id,
        "date": dt.isoformat(),
        "title": {"zh": title, "en": raw["title_en"] or title},
        "summary": {"zh": summary, "en": summary},
        "body": {"zh": raw["body"], "en": raw["body_en"] or raw["body"]},
        "image": copied[0] if copied else "",
        "images": copied,
        "video": "",
        "editor": raw["editor"],
        "reviewer": raw["reviewer"],
        "source": raw["source"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="筛选并导入已授权的公众号文章到新闻中心")
    parser.add_argument("--dry-run", action="store_true", help="只打印筛选结果，不写文件")
    args = parser.parse_args()

    since = cutoff_date()
    news = json.loads(NEWS_JSON.read_text(encoding="utf-8"))
    existing_ids = {x.get("id") for x in news.get("items") or []}
    existing_titles = {(x.get("title") or {}).get("zh") for x in news.get("items") or []}

    added = 0
    skipped = []
    for raw in load_candidates():
        why = None
        if not raw.get("title"):
            why = "无标题"
        elif not raw.get("date"):
            why = "无法识别日期"
        elif raw["date"] < since:
            why = f"早于 {since.isoformat()}"
        elif not is_hk_related(raw.get("title", ""), raw.get("body", "")):
            why = "与香港公司关键词不符"
        elif raw["title"] in existing_titles:
            why = "标题已存在"
        if why:
            skipped.append((raw.get("source_file"), why, raw.get("title") or ""))
            continue

        if args.dry_run:
            print(f"[预览] {raw['date']}  {raw['title']}  图{len(raw['image_files'])}张")
            added += 1
            continue

        copied = copy_static_images(raw["image_files"], f"{raw['date']}-{slugify(raw['title'])[:24]}")
        item = to_news_item(raw, copied)
        if item["id"] in existing_ids:
            skipped.append((raw.get("source_file"), "id 已存在", item["id"]))
            continue
        news["items"].insert(0, item)
        existing_ids.add(item["id"])
        existing_titles.add(item["title"]["zh"])
        added += 1
        print(f"[写入] {item['id']}")

    if not args.dry_run and added:
        NEWS_JSON.write_text(json.dumps(news, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n通过筛选：{added} 篇；跳过：{len(skipped)} 篇（截止日期 {since.isoformat()}）")
    for src, why, title in skipped:
        print(f"  - {src}: {why}  {title[:40]}")
    if args.dry_run:
        print("这是预览。确认无误后去掉 --dry-run 再运行。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
