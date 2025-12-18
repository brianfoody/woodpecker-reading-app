import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";
import dotenv from "dotenv";

dotenv.config();

const elevenlabs = new ElevenLabsClient({
  //   apiKey: "YOUR_API_KEY", // Defaults to process.env.ELEVENLABS_API_KEY
});

const exec = async () => {
  const audio = await elevenlabs.textToSpeech.convertWithTimestamps(
    "Xb7hH8MSUJpSbSDYk0k2",
    {
      text: "Hello there my friend",
      modelId: "eleven_multilingual_v2",
    }
  );

  console.log("audio.alignment");
  console.log(JSON.stringify(audio.alignment, null, 2));

  console.log("\n\naudio.normalizedAlignment");
  console.log(JSON.stringify(audio.normalizedAlignment, null, 2));

  console.log("\n\naudio.alignment");
  console.log(JSON.stringify(audio.alignment, null, 2));
};

exec();
