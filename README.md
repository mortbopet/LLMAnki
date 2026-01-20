# LLMAnki - AI-Powered Anki Deck Improvement

LLMAnki is a web application that helps you improve your Anki flashcards using Large Language Models (LLMs). It analyzes your cards and decks against learning principles and suggests improvements.

## Features

- **📂 Load Anki Decks**: Import your exported `.apkg` files directly in the browser
- **🌳 Deck Browser**: Navigate through your deck hierarchy and subdecks
- **📇 Card Viewer**: View all card types (Basic, Cloze, Basic Reversed, etc.)
- **🤖 AI Analysis**:
    * Get feedback on card quality based on a configurable card evaluation prompt;
    * Get suggestions for new and/or replacement cards;
    * Generate deck-wide analyses, such as deck score, and deck "knowledge coverage" - an attempt to qualitatively determine if your deck covers its subject matter well;
    * Based on the deck-level analysis, generate new cards to "fill in the gaps" of the deck.
- **✏️ Card Editor**: Edit suggested cards before committing with rich text support
- **🔄 Multiple LLM Providers**: Choose from OpenAI, Anthropic, Groq, Together AI, OpenRouter
- **⚙️ Customizable Prompts**: Adjust the system prompt for different analysis criteria

### Usage

Before doing anything, you need to configure an LLM provider. To do so, click the Settings icon to configure your LLM provider and API key (see section below for further details).

The app has mainly been tested using Groq's free tier, so using other models may be flaky or non-functional.


1. **Export from Anki**: In the Anki app, select a deck for export
    * Select format "Anki Deck Package (.apkg)
    * Remember to select "Include scheduling information", "Include deck presets" and "Include media" for the best experience
2. **Load a Deck**: Click "Load .apkg" to import your Anki deck into LLMAnki
3. **Browse Cards**: Select a deck from the sidebar, then click on a card
4. **Analyze**: Click "Analyze" to get feedback and suggested alternative cards
5. **Review & Edit**: Review suggestions, edit if needed, and add new suggested cards
6. **Export**: Download your modified deck
7. **Re-import to Anki**: Start the Anki app on your computer, press `File->Import`, and select the exported `.apkg` file.
    * Remember to select:
      * ✅ "Import any learning progress"
      * ✅ "Import any deck presets"
    * Do not select:
      * ❌ "Merge note types"
    * This will **merge** any _new_ cards from the imported deck to your collection.
    * This will **not** remove any cards. When you export a deck from LLMAnki, and you have cards marked for deletion, a filter string will be shown to you. This filter string can then be copied into the Anki app's card browser, showing you all of the cards which you marked for deletion (which can then be manually bulk-deleted).

⚠️ Note: Always back up your Anki collection before importing modified decks! ⚠️.  
This app is **highly experimental** and thus provides no guarantees of the integrity of the exported deck. However, as mentioned in 8. above, Anki doesn't do destructive edits on imports, so your decks should be pretty safe.

## Supported LLM Providers

| Provider | Free Tier | API Key Required |
|----------|-----------|------------------|
| Groq | Yes | Yes |
| OpenAI | No | Yes |
| Anthropic | No | Yes |
| Together AI | Yes (limited) | Yes |
| OpenRouter | Yes (some models) | Yes |
| Ollama | Yes (local) | No |

### Getting API Keys

- **Groq**: [console.groq.com](https://console.groq.com) - Free tier available
- **OpenAI**: [platform.openai.com](https://platform.openai.com)
- **Anthropic**: [console.anthropic.com](https://console.anthropic.com)
- **Together AI**: [api.together.xyz](https://api.together.xyz)
- **OpenRouter**: [openrouter.ai](https://openrouter.ai) - Aggregates multiple providers

## Card Analysis Criteria

The AI evaluates cards based on these principles. They are encoded into the system prompt that is sent to the LLM alongside the card content.
The system prompt can be adjusted in the settings to tailor the analysis to your own preferences.

The default system prompt is built around evaluating a card given the following criteria:

### 1. Unambiguous
The question should have only one reasonable answer. Avoid vague or open-ended questions.

### 2. Atomic
Each card should test exactly one fact or concept. Break complex information into multiple cards.

### 3. Recognizable
Cards should connect to the original context where you learned the information.

### 4. Active Recall
Cards should require genuine recall, not just recognition. The answer shouldn't be guessable from the question.

The system prompt contains a specification of a JSON schema which the LLM should return its answer in, s.t., LLMAnki is able to parse and provide UI elements for the response. When modifying the system prompt **do not change or remove this part**.

### Card Type Guidelines

- **Terminology/Definitions**: Use "What is X?" format
- **Description → Term**: Use Jeopardy-style cards
- **Concepts, formulas, lists**: Use cloze deletions

## Development

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build
```

## Notes

- API keys are stored locally in your browser's localStorage
- The app runs entirely in your browser - no backend required
- Large decks may take a moment to load as SQLite parsing happens in-browser
- This app has been entirely [vibe-coded](https://en.wikipedia.org/wiki/Vibe_coding) so expect rough edges!

## License

MIT License
