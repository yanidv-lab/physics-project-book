"""Generate pre-rendered neural voice MP3 clips for all Physics Project Book audio cues.

Usage:
    python scripts/generate_audio_tours.py
"""

from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

import edge_tts

VOICE = "en-US-AndrewMultilingualNeural"
RATE = "+0%"
CONCURRENCY = 4
MAX_RETRIES = 3

ROOT_DIR = Path(__file__).resolve().parent.parent
TOURS_TS = ROOT_DIR / "src" / "data" / "audioTours.ts"
OUT_DIR = ROOT_DIR / "public" / "audio" / "tours"

CUE_PATTERN = re.compile(
    r"id:\s*'([^']+)'[\s\S]*?narration:\s*(?:\n\s*)?'([^']*)'",
    re.MULTILINE,
)


def extract_cues(source_text: str) -> list[tuple[str, str]]:
    cues = [(m.group(1).strip(), " ".join(m.group(2).split())) for m in CUE_PATTERN.finditer(source_text)]
    if not cues:
        raise RuntimeError(f"No cues found in {TOURS_TS}")
    return cues


async def synth_one(
    sem: asyncio.Semaphore,
    cue_id: str,
    text: str,
    out_path: Path,
) -> tuple[str, int]:
    async with sem:
        last_err: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                comm = edge_tts.Communicate(text=text, voice=VOICE, rate=RATE)
                await comm.save(str(out_path))
                size = out_path.stat().st_size
                if size < 1024:
                    raise RuntimeError(f"Generated file too small ({size} bytes): {out_path.name}")
                return cue_id, size
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(0.8 * attempt)
        raise RuntimeError(f"Failed to synthesize {cue_id} after {MAX_RETRIES} attempts: {last_err}")


async def main() -> int:
    source_text = TOURS_TS.read_text(encoding="utf-8")
    cues = extract_cues(source_text)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Synthesizing {len(cues)} audio tour clips using {VOICE} -> {OUT_DIR}")
    sem = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(
        *(synth_one(sem, cue_id, text, OUT_DIR / f"{cue_id}.mp3") for cue_id, text in cues)
    )

    total_bytes = sum(size for _, size in results)
    min_bytes = min(size for _, size in results)
    print(
        f"Done: {len(results)} clips written ({total_bytes / 1024:.1f} KB total, min clip {min_bytes} B)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
