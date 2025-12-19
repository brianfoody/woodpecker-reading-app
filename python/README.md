# Python Audio Tools

This directory contains Python scripts for audio processing tasks.

## Setup

### Prerequisites

1. Python 3.7 - 3.12 (Note: Python 3.13+ has compatibility issues with pydub's audioop dependency)
2. FFmpeg installed on your system

#### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

### Install Python Dependencies

```bash
pip install -r requirements.txt
```

## Scripts

### extract_audio_segment.py

Extracts a specific time segment from an audio file.

**Usage:**
```bash
python extract_audio_segment.py <input_file> <start_time> <end_time> [output_file]
```

**Parameters:**
- `input_file`: Path to the input audio file (mp3, wav, ogg, flac)
- `start_time`: Start time in seconds (supports decimals, e.g., 10.5)
- `end_time`: End time in seconds (supports decimals, e.g., 25.3)
- `output_file`: (Optional) Output filename. If not provided, generates one automatically

**Examples:**

Extract a segment from 10.5 to 25.3 seconds:
```bash
python extract_audio_segment.py story.mp3 10.5 25.3
```

Extract with custom output name:
```bash
python extract_audio_segment.py story.mp3 10.5 25.3 word_segment.mp3
```

Extract first 5 seconds:
```bash
python extract_audio_segment.py audio.wav 0 5
```

**Supported Formats:**
- Input: MP3, WAV, OGG, FLAC, and most audio formats supported by FFmpeg
- Output: Same as input format, or specify via file extension

## Integration with the Reading App

This script can be used to extract individual word audio segments from the generated story audio files. The timestamps from the ElevenLabs API can be used as start/end times.

Example workflow:
1. Generate audio with the web app
2. Download the full audio file
3. Use word timestamps to extract individual words:
   ```bash
   python extract_audio_segment.py story.mp3 1.234 1.567 word_rabbit.mp3
   ```