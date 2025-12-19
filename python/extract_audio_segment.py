#!/usr/bin/env python3
"""
Audio Segment Extractor

This script extracts a specific segment from an audio file based on start and end times.

Usage:
    python extract_audio_segment.py <input_file> <start_time> <end_time> [output_file]
    
Arguments:
    input_file: Path to the input audio file (mp3, wav, etc.)
    start_time: Start time in seconds (e.g., 10.5 for 10.5 seconds)
    end_time: End time in seconds (e.g., 25.3 for 25.3 seconds)
    output_file: (Optional) Path for the output file. If not provided, 
                 defaults to input_file_segment_start-end.ext

Examples:
    python extract_audio_segment.py "/Users/brianfoody/Downloads/littlerabbit.mp3" 1.217 1.277
    python extract_audio_segment.py audio.mp3 10.5 25.3 output.mp3
    python extract_audio_segment.py story.wav 0 5.5 word1.wav
"""

import sys
import os
from pathlib import Path
from pydub import AudioSegment
import argparse


def extract_audio_segment(input_file, start_time, end_time, output_file=None):
    """
    Extract a segment from an audio file.
    
    Args:
        input_file (str): Path to input audio file
        start_time (float): Start time in seconds
        end_time (float): End time in seconds
        output_file (str, optional): Path to output file
    
    Returns:
        str: Path to the created output file
    """
    # Validate input file exists
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")
    
    # Validate times
    if start_time < 0:
        raise ValueError(f"Start time must be non-negative, got {start_time}")
    
    if end_time <= start_time:
        raise ValueError(f"End time ({end_time}) must be greater than start time ({start_time})")
    
    # Get file extension
    input_path = Path(input_file)
    file_extension = input_path.suffix.lower()[1:]  # Remove the dot
    
    # Load audio file
    print(f"Loading audio file: {input_file}")
    
    try:
        if file_extension == 'mp3':
            audio = AudioSegment.from_mp3(input_file)
        elif file_extension == 'wav':
            audio = AudioSegment.from_wav(input_file)
        elif file_extension == 'ogg':
            audio = AudioSegment.from_ogg(input_file)
        elif file_extension == 'flac':
            audio = AudioSegment.from_file(input_file, "flac")
        else:
            # Try to load with generic method
            audio = AudioSegment.from_file(input_file)
    except Exception as e:
        raise Exception(f"Failed to load audio file: {e}")
    
    # Convert times to milliseconds (pydub uses milliseconds)
    start_ms = int(start_time * 1000)
    end_ms = int(end_time * 1000)
    
    # Get audio duration in milliseconds
    duration_ms = len(audio)
    duration_s = duration_ms / 1000
    
    print(f"Audio duration: {duration_s:.2f} seconds")
    
    # Validate times against audio duration
    if end_ms > duration_ms:
        print(f"Warning: End time ({end_time}s) exceeds audio duration ({duration_s}s)")
        print(f"Adjusting end time to audio duration")
        end_ms = duration_ms
        end_time = duration_s
    
    # Extract segment
    print(f"Extracting segment from {start_time}s to {end_time}s")
    segment = audio[start_ms:end_ms]
    
    # Determine output file path
    if output_file is None:
        # Create default output filename
        stem = input_path.stem
        output_file = f"{stem}_segment_{start_time}-{end_time}{input_path.suffix}"
    
    # Export the segment
    print(f"Saving segment to: {output_file}")
    
    output_path = Path(output_file)
    output_extension = output_path.suffix.lower()[1:]
    
    try:
        if output_extension == 'mp3':
            segment.export(output_file, format="mp3")
        elif output_extension == 'wav':
            segment.export(output_file, format="wav")
        elif output_extension == 'ogg':
            segment.export(output_file, format="ogg")
        elif output_extension == 'flac':
            segment.export(output_file, format="flac")
        else:
            # Default to mp3 if unknown extension
            segment.export(output_file, format="mp3")
    except Exception as e:
        raise Exception(f"Failed to save audio segment: {e}")
    
    segment_duration = len(segment) / 1000
    print(f"Successfully created segment: {segment_duration:.2f} seconds")
    
    return output_file


def main():
    parser = argparse.ArgumentParser(
        description='Extract a segment from an audio file based on start and end times.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python extract_audio_segment.py audio.mp3 10.5 25.3
    python extract_audio_segment.py audio.mp3 10.5 25.3 output.mp3
    python extract_audio_segment.py story.wav 0 5.5 word1.wav
        """
    )
    
    parser.add_argument('input_file', help='Path to the input audio file')
    parser.add_argument('start_time', type=float, help='Start time in seconds')
    parser.add_argument('end_time', type=float, help='End time in seconds')
    parser.add_argument('output_file', nargs='?', default=None, 
                       help='(Optional) Path for the output file')
    parser.add_argument('--format', choices=['mp3', 'wav', 'ogg', 'flac'], 
                       help='Force output format (overrides file extension)')
    parser.add_argument('--bitrate', default='192k',
                       help='Output bitrate for mp3 (default: 192k)')
    parser.add_argument('--sample-rate', type=int,
                       help='Output sample rate in Hz (e.g., 44100)')
    
    args = parser.parse_args()
    
    try:
        output = extract_audio_segment(
            args.input_file,
            args.start_time,
            args.end_time,
            args.output_file
        )
        print(f"\n✅ Success! Segment saved to: {output}")
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()