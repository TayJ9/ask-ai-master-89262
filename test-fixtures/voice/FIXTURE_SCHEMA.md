# Voice Regression Test Fixtures

## Schema

Each fixture consists of:

| Field | Type | Description |
|-------|------|-------------|
| `level` | string | `freshman` \| `junior` \| `senior` |
| `prompt_question` | string | Interview question asked |
| `candidate_answer_text` | string | Ground-truth answer text (used for TTS) |
| `tts_audio_file` | string | Path to generated audio (e.g. `freshman_01.mp3`) |
| `stt_transcript_text_file` | string | Path to STT output (e.g. `freshman_01.txt`) |
| `transcript_word_count` | number | Word count of STT transcript |
| `clarity_score` | number | Heuristic: avg words per sentence (higher = more verbose) |

## File Naming

- `{level}_{index}.mp3` – TTS audio
- `{level}_{index}.txt` – STT transcript
- `{level}_{index}.meta.json` – Metadata (level, prompt, candidate_answer_text, paths, word_count, clarity_score)

## Levels (from yearToDifficulty.ts)

- **Freshman**: basic, introductory, 65% behavioral
- **Junior**: intermediate, moderate, 50% behavioral
- **Senior**: intermediate-advanced, advanced, 45% behavioral
