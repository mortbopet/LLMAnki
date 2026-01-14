# LLMAnki Development Guidelines

## Project Overview
LLMAnki is a React + TypeScript web application for improving Anki flashcards using LLMs.

## Tech Stack
- React 18 with TypeScript
- Vite for bundling
- Tailwind CSS for styling
- sql.js for SQLite parsing in browser
- JSZip for .apkg file handling
- Zustand for state management

## Key Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint

## Architecture Notes
- State is managed with Zustand in `src/store/useAppStore.ts`
- APKG parsing uses sql.js to read SQLite databases in the browser
- LLM integration supports multiple providers (OpenAI, Anthropic, Groq, etc.)
- Card rendering handles Basic, Cloze, and reversed card types

## Code Style
- Use functional components with hooks
- Prefer TypeScript strict mode
- Use Tailwind CSS for styling
- Keep components focused and single-responsibility
