import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { run, probeDuration } from "./proc.js";

export const VOICES = [
  { id: "vi-VN-HoaiMyNeural", label: "Tiếng Việt — Nữ (Hoài My)" },
  { id: "vi-VN-NamMinhNeural", label: "Tiếng Việt — Nam (Nam Minh)" },
  { id: "en-US-JennyNeural", label: "English — Female (Jenny)" },
  { id: "en-US-GuyNeural", label: "English — Male (Guy)" },
];

// Synthesizes one line with edge-tts (Microsoft neural voices). The service
// occasionally returns no audio, so retry a few times before giving up.
export async function synthesize(text, voice, rate, outFile) {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await run(config.pythonBin, [
        "-m", "edge_tts", "--voice", voice, `--rate=${rate}`, "--text", text, "--write-media", outFile,
      ]);
      const duration = await probeDuration(outFile);
      if (duration > 0) return duration;
      throw new Error("empty audio");
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`TTS thất bại: ${lastErr.message}`);
}
