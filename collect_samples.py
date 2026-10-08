"""Collect a few public IT-content samples to inspect available metadata.

Designed to run in Google Colab or locally. This is an exploratory data
collector for the future app, not its final ingestion implementation.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
import re

import feedparser
import requests

SOURCES = [
    {
        "id": "zenn",
        "kind": "article",
        "method": "rss",
        "url": "https://zenn.dev/feed",
    },
    {
        "id": "cloudflare_changelog",
        "kind": "article_release_note",
        "method": "rss",
        "url": "https://developers.cloudflare.com/changelog/rss/index.xml",
    },
    {
        "id": "youtube_google_developers",
        "kind": "video",
        "method": "atom",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw",
    },
    {
        "id": "syntax_podcast",
        "kind": "podcast",
        "method": "rss",
        "url": "https://feed.syntax.fm/rss",
    },
    {
        "id": "github_workers_sdk_releases",
        "kind": "software_release",
        "method": "github_api",
        "url": "https://api.github.com/repos/cloudflare/workers-sdk/releases",
    },
]

HEADERS = {"User-Agent": "ITDiscoveryMetadataProbe/0.1 (personal learning project)"}


def shorten(value: object, limit: int = 2500) -> object:
    """Keep collected samples small; preserve enough context for comparison."""
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:limit]
    if isinstance(value, dict):
        return {str(k): shorten(v, limit) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [shorten(v, limit) for v in value[:20]]
    return str(value)[:limit]


def feed_entry_to_sample(entry: dict) -> dict:
    media = []
    for field in ("media_thumbnail", "media_content", "enclosures", "links"):
        for item in entry.get(field, []):
            if isinstance(item, dict) and (item.get("href") or item.get("url")):
                media.append({"field": field, "url": item.get("href") or item.get("url"),
                              "type": item.get("type"), "rel": item.get("rel")})
    tags = [
        {"term": tag.get("term"), "label": tag.get("label"), "scheme": tag.get("scheme")}
        for tag in entry.get("tags", []) if isinstance(tag, dict)
    ]
    return {
        "title": entry.get("title"),
        "url": entry.get("link"),
        "published": entry.get("published"),
        "updated": entry.get("updated"),
        "author": entry.get("author"),
        "description": shorten(entry.get("summary")),
        "content": shorten([c.get("value") for c in entry.get("content", []) if isinstance(c, dict)]),
        "tags": tags,
        "media": media[:20],
        "raw_fields": sorted(entry.keys()),
        "raw_selected": shorten({
            k: v for k, v in entry.items()
            if k in ("id", "guidislink", "summary_detail", "title_detail", "itunes_duration",
                     "itunes_episode", "yt_videoid", "yt_channelid", "image")
        }),
    }


def collect_feed(source: dict, limit: int) -> dict:
    response = requests.get(source["url"], headers=HEADERS, timeout=25)
    response.raise_for_status()
    feed = feedparser.parse(response.content)
    if feed.bozo and not feed.entries:
        raise ValueError(f"Feed parse error: {feed.bozo_exception}")
    return {
        "feed_title": feed.feed.get("title"),
        "feed_fields": sorted(feed.feed.keys()),
        "reported_entry_count": len(feed.entries),
        "samples": [feed_entry_to_sample(entry) for entry in feed.entries[:limit]],
    }


def collect_github_releases(source: dict, limit: int) -> dict:
    response = requests.get(source["url"], headers={**HEADERS, "Accept": "application/vnd.github+json"},
                            params={"per_page": limit}, timeout=25)
    response.raise_for_status()
    releases = response.json()
    if not isinstance(releases, list):
        raise ValueError("GitHub returned an unexpected response shape")
    samples = []
    for item in releases[:limit]:
        samples.append({
            "title": item.get("name") or item.get("tag_name"),
            "url": item.get("html_url"),
            "published": item.get("published_at"),
            "updated": item.get("created_at"),
            "author": (item.get("author") or {}).get("login"),
            "description": shorten(item.get("body")),
            "tag_name": item.get("tag_name"),
            "prerelease": item.get("prerelease"),
            "draft": item.get("draft"),
            "assets": [{"name": a.get("name"), "size": a.get("size"), "content_type": a.get("content_type")}
                       for a in item.get("assets", [])[:10]],
            "raw_fields": sorted(item.keys()),
        })
    return {"reported_entry_count": len(releases), "samples": samples}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=3, help="Samples per source (default: 3)")
    parser.add_argument("--output", default="data/samples", help="Output directory")
    args = parser.parse_args()
    if not 1 <= args.limit <= 20:
        parser.error("--limit must be between 1 and 20")

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    summary = {"collected_at": datetime.now(timezone.utc).isoformat(), "limit": args.limit, "sources": []}
    for source in SOURCES:
        record = {**source, "collected_at": datetime.now(timezone.utc).isoformat()}
        try:
            result = (collect_github_releases(source, args.limit) if source["method"] == "github_api"
                      else collect_feed(source, args.limit))
            record.update(result)
            record["status"] = "ok"
            print(f"[OK] {source['id']}: {len(record['samples'])} sample(s)")
        except (requests.RequestException, ValueError, TypeError) as exc:
            record["status"] = "error"
            record["error"] = f"{type(exc).__name__}: {exc}"
            print(f"[ERROR] {source['id']}: {record['error']}")
        (output / f"{source['id']}.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        summary["sources"].append({
            "id": source["id"], "kind": source["kind"], "status": record["status"],
            "sample_count": len(record.get("samples", [])), "error": record.get("error")
        })
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nFiles saved to: {output.resolve()}")
    if os.environ.get("COLAB_RELEASE_TAG"):
        print("COLAB_RELEASE_TAG is not used; no publishing is performed.")


if __name__ == "__main__":
    main()
