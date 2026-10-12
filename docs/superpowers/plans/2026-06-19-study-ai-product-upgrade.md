# Study AI Product Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing study assistant into a polished AI learning workspace with mode-aware prompts and practical study tools.

**Architecture:** Keep the current static frontend and Express backend. Replace the frontend shell with a professional single-page workspace, and refactor AI service prompts into clean UTF-8 helper functions while preserving existing endpoints.

**Tech Stack:** Plain HTML/CSS/JavaScript, Express, Axios, Node built-in test runner.

## Global Constraints

- Do not introduce a frontend build system in this pass.
- Keep API base as `http://localhost:3000`.
- Store user-facing profile settings in `localStorage`.
- Keep fallback behavior useful when no AI API key is configured.
- Sanitize Markdown before rendering.

---

### Task 1: Add Smoke Tests

**Files:**
- Create: `backend/tests/product-upgrade-smoke.test.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `npm test` validates frontend shell text, AI tool exports, and route availability.

- [ ] Write a Node test that reads `../index.html`, imports `services/aiService.js`, and asserts the upgraded UI and backend functions exist.
- [ ] Add `"test": "node --test tests/*.test.js"` to `backend/package.json`.
- [ ] Run `npm test` and confirm it fails before implementation because the new shell and tool functions are missing.

### Task 2: Refactor AI Service

**Files:**
- Modify: `backend/services/aiService.js`
- Modify: `backend/controllers/aiController.js`
- Modify: `backend/routes/aiRoutes.js`

**Interfaces:**
- Produces: `chat`, `summarize`, `generateQuiz`, `generateStrategy`, `generateStudyPlan`, `analyzeQuestion`, `isApiKeyValid`.

- [ ] Replace garbled prompts with clear mode-aware Chinese prompts.
- [ ] Keep existing chat API compatible with `{ message, conversationId, mode, profile }`.
- [ ] Add quiz and strategy service/controller/route functions.
- [ ] Keep fallback responses structured and useful.
- [ ] Run `npm test` and `node --check` for changed backend files.

### Task 3: Rewrite Frontend Workspace

**Files:**
- Replace: `index.html`

**Interfaces:**
- Consumes: `/health`, `/api/ai/chat`, `/api/ai/generate-plan`, `/api/ai/summarize`, `/api/ai/quiz`, `/api/ai/strategy`, `/api/problem/solve`, `/api/problem/wrong`.

- [ ] Build a three-column AI learning workspace.
- [ ] Add local learning profile editor.
- [ ] Add chat modes and send them to the backend.
- [ ] Add tools for summary, quiz, and exam strategy.
- [ ] Sanitize Markdown rendering.
- [ ] Keep mobile responsive layout.
- [ ] Run `npm test`.

### Task 4: Final Verification

**Files:**
- No new files.

**Interfaces:**
- Produces: verified local project state.

- [ ] Run all backend syntax checks.
- [ ] Run `npm test`.
- [ ] Optionally start the backend and verify `/health`.

## Plan Self-Review

- Spec coverage: UI redesign, prompt upgrade, tools, profile, safer rendering, and tests are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: backend tool function names match controller and route plan.

