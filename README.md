# LLMAnki - AI-Powered Anki Card Improvement

LLMAnki is a web application that helps you improve your Anki flashcards using Large Language Models (LLMs). It analyzes your cards against evidence-based learning principles and suggests improvements.

## Features

- **📂 Load Anki Decks**: Import your exported `.apkg` files directly in the browser
- **🌳 Deck Browser**: Navigate through your deck hierarchy and subdecks
- **📇 Card Viewer**: View all card types (Basic, Cloze, Basic Reversed, etc.)
- **🤖 AI Analysis**: Get feedback on card quality based on:
  - **Unambiguous**: Only one reasonable answer
  - **Atomic**: One fact per card
  - **Recognizable**: Uses original learning context
  - **Active Recall**: Requires genuine recall, not recognition
- **✏️ Card Editor**: Edit suggested cards before committing with rich text support
- **🔄 Multiple LLM Providers**: Choose from OpenAI, Anthropic, Groq, Together AI, OpenRouter, or local Ollama
- **⚙️ Customizable Prompts**: Adjust the system prompt for different analysis criteria

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm, pnpm, or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Usage

1. **Load a Deck**: Click "Load .apkg" to import your Anki deck
2. **Configure LLM**: Click the Settings icon to configure your LLM provider and API key
3. **Browse Cards**: Select a deck from the sidebar, then click on a card
4. **Analyze**: Click "Analyze with AI" to get feedback and suggestions
5. **Review & Edit**: Review suggestions, edit if needed, then commit changes
6. **Export**: Download your modified deck

## Supported LLM Providers

| Provider | Free Tier | API Key Required |
|----------|-----------|------------------|
| OpenAI | No | Yes |
| Anthropic | No | Yes |
| Groq | Yes | Yes |
| Together AI | Yes (limited) | Yes |
| OpenRouter | Yes (some models) | Yes |
| Ollama | Yes (local) | No |

### Getting API Keys

- **OpenAI**: [platform.openai.com](https://platform.openai.com)
- **Anthropic**: [console.anthropic.com](https://console.anthropic.com)
- **Groq**: [console.groq.com](https://console.groq.com) - Free tier available!
- **Together AI**: [api.together.xyz](https://api.together.xyz)
- **OpenRouter**: [openrouter.ai](https://openrouter.ai) - Aggregates multiple providers

## Card Analysis Criteria

The AI evaluates cards based on these principles:

### 1. Unambiguous
The question should have only one reasonable answer. Avoid vague or open-ended questions.

### 2. Atomic
Each card should test exactly one fact or concept. Break complex information into multiple cards.

### 3. Recognizable
Cards should connect to the original context where you learned the information.

### 4. Active Recall
Cards should require genuine recall, not just recognition. The answer shouldn't be guessable from the question.

### Card Type Guidelines

- **Terminology/Definitions**: Use "What is X?" format
- **Description → Term**: Use Jeopardy-style cards
- **Concepts, formulas, lists**: Use cloze deletions

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **Tailwind CSS** for styling
- **sql.js** for SQLite in browser
- **JSZip** for handling .apkg files
- **Zustand** for state management
- **Lucide React** for icons

## Project Structure

```
src/
├── components/          # React components
│   ├── AnalysisPanel.tsx
│   ├── CardEditor.tsx
│   ├── CardList.tsx
│   ├── CardViewer.tsx
│   ├── DeckBrowser.tsx
│   ├── FileUpload.tsx
│   ├── PendingChanges.tsx
│   └── SettingsPanel.tsx
├── store/
│   └── useAppStore.ts   # Zustand state management
├── types/
│   └── index.ts         # TypeScript types
├── utils/
│   ├── ankiParser.ts    # APKG file parsing
│   ├── cardRenderer.ts  # Card rendering logic
│   └── llmService.ts    # LLM API integration
├── App.tsx              # Main application
├── main.tsx             # Entry point
└── index.css            # Global styles
```

## Development

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Notes

- API keys are stored locally in your browser's localStorage
- The app runs entirely in your browser - no backend required
- Large decks may take a moment to load as SQLite parsing happens in-browser
- Images in cards are preserved when analyzing and editing

## License

MIT License
