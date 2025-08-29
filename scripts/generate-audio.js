#!/usr/bin/env node

import dotenv from "dotenv";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// The default sentence
const sentence = "The silly monkey lost his banana";
const words = sentence.toLowerCase().split(" ");

// Create public/audio directory if it doesn't exist
const audioDir = path.join(__dirname, "..", "public", "audio");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

async function generateAudioForWord(word) {
  try {
    console.log(`Generating audio for: "${word}"`);

    const response = await client.audio.speech.create({
      model: "playai-tts",
      voice: "Jennifer-PlayAI",
      input: word,
      response_format: "wav",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `${word.replace(/[^a-z0-9]/gi, "_")}.wav`;
    const filepath = path.join(audioDir, filename);

    await fs.promises.writeFile(filepath, buffer);
    console.log(`✓ Saved: ${filename}`);

    return filename;
  } catch (error) {
    console.error(`Failed to generate audio for "${word}":`, error);
    throw error;
  }
}

async function main() {
  console.log("🎵 Generating audio files for default sentence...\n");
  console.log(`Sentence: "${sentence}"\n`);

  const manifest = {
    sentence: sentence,
    words: {},
    generated: new Date().toISOString(),
  };

  // Generate audio for each unique word
  const uniqueWords = [...new Set(words)];

  for (const word of uniqueWords) {
    try {
      const filename = await generateAudioForWord(word);
      manifest.words[word] = `/audio/${filename}`;

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Skipping word "${word}" due to error`);
    }
  }

  // Save manifest file
  const manifestPath = path.join(audioDir, "manifest.json");
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n✅ Audio generation complete!");
  console.log(`📁 Files saved to: ${audioDir}`);
  console.log(`📋 Manifest saved to: ${manifestPath}`);
}

main().catch(console.error);
