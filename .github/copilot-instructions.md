# Detect — AI Coding Agent Instructions

## Project Overview
**Detect** is a Fake News Detection application built with **Electron** and **Vanilla JavaScript**.
- **Core Stack**: Electron (Main), Vanilla JS + HTML + CSS (Renderer), Node.js.
- **AI Provider**: Volcengine (Doubao) via OpenAI SDK.
- **Build System**: Webpack (for HTML processing) + Electron Builder.

## Architecture & Key Components

### Main Process (`src/main/`)
Modular architecture managed by `DetectApp` class.
- **Entry**: `src/main/index.js` (Startup) -> `src/main/main.js` (Controller).
- **`src/main/main.js`**: Central hub. Manages lifecycle, IPC routing, and service instantiation.
- **`src/main/llmService.js`**: Handles AI interactions.
    - **Model**: `doubao-seed-1-6-lite-251015`.
    - **Protocol**: **Strict JSON** output required.
- **`src/main/extractionManager.js`**: Orchestrates content extraction.
    - **Technique**: Spawns a **hidden BrowserWindow** to load dynamic content before parsing with `Readability`/`JSDOM`.
- **`src/main/preload.js`**: Security bridge. Exposes `electronAPI` to renderer.

### Renderer Process (`public/` & `dist/`)
**Monolithic Single-File Architecture**.
- **`public/Main.html`**: The entire frontend application (~8000 lines).
    - Contains HTML structure, CSS (in `<style>`), and UI Logic (in `<script>`).
    - **Constraint**: **NO** React/Vue/Angular. Use standard DOM APIs (`document.getElementById`, `addEventListener`).
    - **Navigation**: Search for DOM IDs (e.g., `btn-analyze`, `input-url`) to find logic.

## Development Workflow

### Commands
- **Start Dev**: `npm run dev`
    - Runs `webpack --watch` (hot reload for HTML) and `electron .` concurrently.
    - **Note**: If you modify `src/main/*`, you must restart the terminal process. If you modify `public/Main.html`, refresh the Electron window (Ctrl+R).
- **Build**: `npm run build` (Production build for Windows).

### Debugging
- **Main Process**: Logs appear in the terminal where `npm run dev` is running.
- **Renderer**: Open DevTools in the app window (`Ctrl+Shift+I` or `Cmd+Option+I`).

## Coding Conventions

### Frontend (Vanilla JS)
- **DOM Access**: Cache elements at the top of script or function.
- **State Management**: Use simple global variables or data attributes within `Main.html`.
- **Styling**:
    - Use CSS Variables defined in `:root` for theming.
    - Dark mode: `[data-theme="dark"]` overrides variables.
    - **Do not** introduce SCSS/Less/Tailwind. Keep CSS inside `<style>`.

### IPC Communication
Follow the `preload.js` pattern:
1.  **Renderer**: `window.electronAPI.invoke('channel', data)` (Async/Result) or `send` (Fire-and-forget).
2.  **Main**: `ipcMain.handle('channel', handler)` or `ipcMain.on('channel', handler)`.
3.  **Error Handling**: Handlers MUST return `{ success: boolean, data?: any, error?: string }` to prevent crashes.

### LLM Integration (`llmService.js`)
- **Prompting**: Always instruct the model to return **JSON** and **exclude Markdown formatting** (e.g., "Do not use ```json blocks").
- **Parsing**: Wrap `JSON.parse()` in `try-catch`. Handle cases where the model might wrap output in code blocks despite instructions.

## Critical Implementation Details

### Content Extraction
- The app supports both **URL** and **Image** inputs.
- **URL Processing**:
    1. `URLProcessor` checks validity/type (e.g., WeChat articles).
    2. `ExtractionManager` opens a hidden window to render JS.
    3. `Readability` parses the DOM from the hidden window.
- **Image Processing**: Handled by `ImageExtractor`.

### File Structure
```
src/
  main/
    index.js          # Electron entry point
    main.js           # App Controller
    llmService.js     # AI Logic
    extractionManager.js # Scraper Logic
    preload.js        # IPC Bridge
public/
  Main.html           # THE Frontend (HTML/CSS/JS)
webpack.config.js     # Copies public/ -> dist/
```
