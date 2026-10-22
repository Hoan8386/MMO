"""Text-to-speech with word timings via edge-tts.

Usage: python tts_words.py jobs.json
jobs.json: [{"text": ..., "voice": ..., "rate": "+0%", "pitch": "+0Hz" (optional), "mp3": "out.mp3", "words": "out.words.json"}]
Writes each mp3 plus a JSON list of {"t": start_s, "d": dur_s, "w": word}.
"""
import asyncio
import json
import sys

import edge_tts


async def one(job):
    last = None
    for attempt in range(6):
        try:
            comm = edge_tts.Communicate(job["text"], job["voice"], rate=job.get("rate", "+0%"), pitch=job.get("pitch", "+0Hz"), boundary="WordBoundary")
            words, size = [], 0
            with open(job["mp3"], "wb") as f:
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
                        size += len(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        words.append({"t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7, "w": chunk["text"]})
            if size == 0:
                raise RuntimeError("empty audio")
            with open(job["words"], "w", encoding="utf-8") as f:
                json.dump(words, f, ensure_ascii=False)
            return
        except ValueError:  # bad voice/rate: retrying cannot help
            raise
        except Exception as e:  # edge-tts occasionally drops a request; retry
            last = e
            await asyncio.sleep(2 ** attempt)  # 1, 2, 4, 8, 16s: the service throttles bursts
    raise RuntimeError(f"TTS failed for {job['mp3']}: {last}")


async def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        jobs = json.load(f)
    gate = asyncio.Semaphore(2)  # edge-tts throttles more parallel requests

    async def guarded(job):
        async with gate:
            await one(job)
            print("ok", job["mp3"], flush=True)

    # Finish every scene we can before reporting failures; the caller keeps the finished ones.
    results = await asyncio.gather(*(guarded(j) for j in jobs), return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        raise errors[0]


asyncio.run(main())
