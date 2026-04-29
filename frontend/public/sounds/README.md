# Adding Custom Pencil Writing Sound

## Quick Setup

To add a real pencil writing sound effect:

### Option 1: Download from Freesound.org (Recommended - Free & Legal)

1. Go to https://freesound.org/people/rivernile7/sounds/234016/
2. Create a free account or log in
3. Download the file "Writing On Paper.wav"
4. Convert to MP3 (optional, for smaller file size): https://cloudconvert.com/wav-to-mp3
5. Rename the file to `writing.mp3`
6. Place it in: `frontend/public/sounds/writing.mp3`

The app also ships `writing.wav` (generated via `node scripts/generate-writing-ambient.mjs`). The player tries `writing.mp3` first, then `writing.wav`, then a soft procedural loop.

**License**: Creative Commons 0 (completely free, no attribution required)

### Option 2: Use Alternative Free Sound

Other good options from Freesound.org (all CC0 license):

- **MeanRaccoon's pencil notebook**: https://freesound.org/people/MeanRaccoon/sounds/816927/
- **InspectorJ's pencil close-up**: https://freesound.org/people/InspectorJ/sounds/398271/ (requires attribution)

### Option 3: Quick Test with Any Audio

For testing, you can use any short (2-5 second) audio file:
1. Find or record your own pencil writing sound
2. Convert to MP3 format
3. Save as `frontend/public/sounds/writing.mp3`

## Current Behavior

- If `/sounds/writing.mp3` exists: Uses your custom sound ✅
- If file doesn't exist: Automatically generates a fallback clicking sound

## File Requirements

- **Format**: MP3 (preferred) or WAV
- **Duration**: 2-5 seconds (will loop automatically)
- **File name**: Must be `writing.mp3`
- **Location**: `frontend/public/sounds/writing.mp3`

## Testing

After adding the file:
1. Restart the dev server if needed: `cd frontend && npm run dev`
2. Go to http://localhost:5173/interview-preview
3. Click "Processing" button
4. You should hear your custom sound!

## Troubleshooting

If the sound doesn't play:
- Check the browser console for errors
- Make sure the file is named exactly `writing.mp3`
- Try a different audio format (WAV instead of MP3)
- Check that the file isn't corrupted by playing it in a media player first
