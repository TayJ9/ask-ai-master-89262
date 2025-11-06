# UI Preview Guide

## 🎨 What You'll See

### 1. **Role Selection Page** (`RoleSelection.tsx`)
- **Header**: "Choose Your Role" with gradient text
- **Mode Selector**: Card with "Text Chat" and "Voice" buttons (NEW!)
- **Role Cards**: 3 cards for Software Engineer, Product Manager, Marketing
- Each card has:
  - Icon with gradient background
  - Role title and description
  - Difficulty selector (Easy/Medium/Hard buttons)
  - "Start Practice" button
  - "Ask Coach" button

### 2. **Resume Upload Page** (`ResumeUpload.tsx`)
- **Card Layout**: Centered card with shadow
- **Header**: "Upload Your Resume (Optional)"
- **File Upload**: Button to upload PDF
- **Divider**: "Or" separator
- **Text Area**: Large textarea to paste resume text
- **Preview**: Shows resume preview with character count
- **Buttons**: "Skip" and "Continue with Resume"

### 3. **Voice Interview Page** (`VoiceInterview.tsx`)
- **Header**: "Voice Interview" with role and difficulty
- **End Interview Button**: Top right corner
- **Status Indicator**: Shows current state:
  - 🎤 "AI is speaking..." (with animated volume icon)
  - 🔴 "Recording... MM:SS" (with pulsing red dot)
  - ⏳ "Processing..." (with spinner)
  - ✅ "Ready to speak" (with green dot)
- **Large Microphone Button**: 
  - 128x128px circular button
  - Red when recording (pulsing animation)
  - Grayed out when AI is speaking
  - Gradient primary color when ready
  - Shows Mic or MicOff icon
- **Transcript Display**: Shows your last response
- **Instructions**: Helpful tips at bottom

## 🚀 How to Preview

### Option 1: Run Dev Server (Recommended)
```bash
# Terminal 1: Start Node.js backend
npm run dev

# Terminal 2: Start Python Flask server (if not already running)
cd python_backend
python app.py
```

Then open your browser to: `http://localhost:5173` (or the port shown in terminal)

### Option 2: Build for Production
```bash
npm run build
npm run preview
```

## 📱 User Flow Preview

1. **Login/Auth** → User authentication page
2. **Role Selection** → Choose role, difficulty, and mode (Text/Voice)
3. **Resume Upload** → Upload PDF or paste text (or skip)
4. **Interview**:
   - **Text Mode**: Chat interface with messages
   - **Voice Mode**: Large mic button, status indicators, audio playback

## 🎯 Key Visual Features

### Voice Interview Interface:
- **Centered Layout**: Everything centered on screen
- **Large Mic Button**: 128px circular button, easy to click
- **Real-time Status**: Always shows what's happening
- **Smooth Animations**: Pulse effects, scale on hover
- **Responsive Design**: Works on mobile and desktop

### Color Scheme:
- Primary gradient for buttons
- Red for recording state
- Green for ready state
- Muted colors for disabled states
- Shadow effects for depth

## 🔍 Visual Elements to Check

1. ✅ Mode selector appears on role selection
2. ✅ Voice button has microphone icon
3. ✅ Resume upload shows preview
4. ✅ Voice interview shows large mic button
5. ✅ Status changes when recording/playing
6. ✅ Animations work smoothly
7. ✅ Buttons are properly sized and clickable

## 📸 Expected Screenshots

### Role Selection:
```
┌─────────────────────────────────────────┐
│        Choose Your Role                 │
│  [Text Chat] [🎤 Voice]                 │
│                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐   │
│  │ 💼 SE  │  │ 📦 PM  │  │ 📈 MKT │   │
│  │ Easy   │  │ Easy   │  │ Easy   │   │
│  │ Medium │  │ Medium │  │ Medium │   │
│  │ Hard   │  │ Hard   │  │ Hard   │   │
│  │ [Start]│  │ [Start]│  │ [Start]│   │
│  └────────┘  └────────┘  └────────┘   │
└─────────────────────────────────────────┘
```

### Voice Interview:
```
┌─────────────────────────────────────────┐
│ Voice Interview          [End Interview]│
│ Software Engineer • Medium              │
│                                         │
│        ✅ Ready to speak                │
│                                         │
│          ┌─────────┐                   │
│          │   🎤    │                   │
│          │ (128px) │                   │
│          └─────────┘                   │
│                                         │
│   🎤 Click the microphone to start      │
│   The AI will respond with voice        │
└─────────────────────────────────────────┘
```

## 🐛 Troubleshooting Preview

If you can't see the preview:
1. Check that dev server is running
2. Check browser console for errors
3. Verify all dependencies are installed: `npm install`
4. Check that port isn't already in use
5. Try clearing browser cache


