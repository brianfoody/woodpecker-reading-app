// TODO - fetch all words and fetch the sentence
// Store locally.
// Store all words in a dictionary so that we can re-use for the next sentence (we never re-use whole sentences unless exact.)
import dotenv from "dotenv";
dotenv.config();
import Groq from "groq-sdk";
import fs from "fs";

const client = new Groq({
  apiKey: process.env["GROQ_API_KEY"], // This is the default and can be omitted
});

const createAudioFile = async (text: string) => {
  const response = await client.audio.speech.create({
    model: "playai-tts",
    voice: "Quinn-PlayAI",
    input: text,
    response_format: "wav",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(`./${+new Date()}.wav`, buffer);
};

/**
 * Breaks sentence up into words and in parallel creates an audio file for each word.
 *
 * @param sentence
 */
const createSentenceAudio = async (sentence: string) => {};

createAudioFile("I want some ice-cream");
