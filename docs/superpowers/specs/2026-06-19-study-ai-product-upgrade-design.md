# Study AI Product Upgrade Design

## Goal

Upgrade the current study assistant demo into a more polished AI learning workspace with a mature ChatGPT/Claude-like interface, stronger prompt design, and practical learning tools.

## Scope

This upgrade keeps the current lightweight architecture: a single `index.html` frontend and the existing Express backend. It does not introduce a frontend framework or database in this pass.

## Product Direction

The app should feel like a serious daily-use study cockpit rather than a playful contest demo. The interface uses restrained neutrals, subtle borders, compact navigation, and focused panels. The main screen becomes a three-column workspace:

- Left navigation for Chat, Solver, Plan, Review, and Tools.
- Center workspace for the active workflow.
- Right context panel for learning profile, exam countdown, weak points, and quick prompt modes.

## Features

- AI chat modes: Tutor, Socratic, Exam Sprint, Wrong Problem Diagnosis, and Note Polish.
- Learning profile stored locally: major, target exam, deadline, daily study time, weak points, and preferred mode.
- Improved system prompt: concise, mode-aware, practical, and less intrusive than the current long onboarding prompt.
- Utility tools: note summarizer, quiz generator, and exam strategy generator.
- Better wrong problem review: visible stats and review states.
- Safer frontend rendering: sanitize Markdown output before injecting it into the page.

## Backend Changes

- Replace the broken/garbled prompt text in `backend/services/aiService.js` with clear UTF-8 Chinese prompts.
- Add mode-aware chat behavior while keeping existing `/api/ai/chat`.
- Add tool endpoints under `/api/ai`: `/quiz`, `/strategy`, and improved `/summarize`.
- Keep fallback responses useful when no API key is configured.

## Frontend Changes

- Rewrite `index.html` as a professional single-page workspace.
- Preserve existing API settings, local API key headers, chat, solver, plan generation, and wrong problem flows.
- Add local profile persistence using `localStorage`.
- Add tool cards for summarization, quiz generation, and exam strategy.

## Verification

- Add a Node smoke test script that checks required frontend and backend capabilities.
- Run syntax checks for backend JavaScript.
- Run the smoke test after implementation.

