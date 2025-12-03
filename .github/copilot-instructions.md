# Detect - Fake News Detection App Instructions

## Project Overview
This is an Electron-based application for detecting fake news using LLM analysis. The application extracts content from URLs, analyzes text and images, and provides a credibility assessment.

## Architecture
The project follows a standard Electron main/renderer architecture but with a specific implementation:

- **Main Process** (`src/main/`): Handles application lifecycle, native integrations, content extraction, and LLM communication.
- **Renderer Process** (`public/code.html`): A **monolithic HTML/Vanilla JS** implementation. Despite `package.json` listing React dependencies, the current active UI is entirely contained within `public/code.html` using embedded scripts and direct DOM manipulation.

## Key Components

### Main Process (`src/main/`)
- **`main.js`**: Entry point. Manages `DetectApp` class, `WindowManager`, and IPC setup.
- **`llmService.js`**: Handles interaction with Volcengine (Doubao) API for content analysis. Returns strict JSON.
- **`extractionManager.js`**: Manages URL content extraction.
- **`preload.js`**: Exposes `electronAPI` to the renderer via `contextBridge`.

### Renderer Process (`public/`)
- **`code.html`**: Contains the entire UI structure, styles (CSS variables), and logic (JavaScript).
- **Interaction**: Uses `window.electronAPI` to communicate with the main process.

## Data Flow & IPC Patterns
Communication relies on the `electronAPI` bridge:

1.  **Async Requests (Request/Response)**:
    -   Renderer: `await window.electronAPI.invoke('channel', data)`
    -   Main: `ipcMain.handle('channel', async (event, data) => { ... })`
    -   *Examples*: `analyze-content`, `open-image-dialog`, `set-theme`.

2.  **Event-Based (Fire-and-Forget / Push)**:
    -   Renderer: `window.electronAPI.send('channel', data)`
    -   Main: `ipcMain.on('channel', (event, data) => { ... })`
    -   *Examples*: `extract-content` (triggers async result later), `window-minimize`.

3.  **Main-to-Renderer Events**:
    -   Main: `mainWindow.webContents.send('channel', data)`
    -   Renderer: `window.electronAPI.on('channel', (event, data) => { ... })`
    -   *Examples*: `extract-content-result`, `theme-changed`.

## Critical Workflows

### Development
- **Start Dev Server**: `npm run dev`
    - Runs `webpack serve` for the renderer (port 8080).
    - Runs `electron .` concurrently.

### Building
- **Build Renderer**: `npm run build:renderer` (Webpack)
- **Build App**: `npm run build:electron` (Electron Builder)

## Coding Conventions
- **Renderer UI**: Do **not** introduce React/Vue components unless explicitly asked to refactor. Maintain the existing Vanilla JS + DOM manipulation style in `code.html`.
- **LLM Integration**: Ensure `LLMService` prompts request strict JSON output to avoid parsing errors.
- **Styling**: Use CSS variables defined in `code.html` (`:root` and `[data-theme="dark"]`) for theming.
- **Error Handling**: Main process should catch errors and return `{ success: false, error: 'msg' }` objects for `invoke` handlers.

## Important Files
- `src/main/main.js`: IPC handlers registry.
- `src/main/llmService.js`: AI prompt engineering and API calls.
- `public/code.html`: The complete frontend implementation.
