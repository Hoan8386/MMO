import asyncio, json, sys, edge_tts
VOICE = "vi-VN-HoaiMyNeural"
async def one(s):
    c = edge_tts.Communicate(s["text"], VOICE, rate="-6%", boundary="WordBoundary")
    sub = []
    with open(f"assets/vo/{s['id']}.mp3", "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio": f.write(ch["data"])
            elif ch["type"] in ("WordBoundary", "SentenceBoundary"):
                sub.append({"t": ch["offset"]/1e7, "d": ch["duration"]/1e7, "w": ch["text"]})
    json.dump(sub, open(f"assets/vo/{s['id']}.words.json", "w", encoding="utf-8"), ensure_ascii=False)
async def main():
    for s in json.load(open("script/narration.json", encoding="utf-8")):
        await one(s); print("ok", s["id"])
asyncio.run(main())
