# AgentClassroom

AgentClassroom is a local-first MVP that turns:

`URL -> rendered browser capture -> design distillation -> skillpack`

The app captures a page in real Chromium, records structural and style signals, reduces content-heavy noise, and writes an agent-ready output package to `storage/jobs/<job-id>/`.

## Stack

- Frontend: React + Vite + Tailwind utilities
- Backend: Node.js + TypeScript + Express
- Browser capture: Playwright + Chromium + CDP
- Storage: local filesystem job folders

## What the MVP does

- Accepts a URL from the UI
- Creates a local extraction job
- Captures rendered HTML, screenshots, accessibility tree, DOM snapshot, CSS usage, and network log
- Extracts heuristic design data:
  - palette
  - typography
  - spacing
  - layout regions
  - repeated component candidates
  - responsive differences
- Generates distilled artifacts:
  - `PROMPT.md`
  - `manifest.json`
  - `skeleton.html`
  - `skeleton.css`
  - placeholders map
  - component fragments
- Packages the result as a downloadable zip

## Run

1. Install dependencies:

```bash
npm install
```

2. Install the Playwright browser if needed:

```bash
npx playwright install chromium
```

3. Start the app:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`.

Backend runs on `http://localhost:8787`.

## Production build

```bash
npm run build
npm start
```

For a single Bash entrypoint that installs dependencies if needed, ensures Playwright Chromium is available, builds the client and server, and then starts the production server, run:

```bash
bash start.sh
```

Optional flags:

```bash
BUILD_ONLY=1 bash start.sh
SKIP_PLAYWRIGHT_INSTALL=1 bash start.sh
```

## Output structure

Each job is written to:

```text
storage/jobs/<job-id>/
  manifest.json
  PROMPT.md
  capture/
    rendered.html
    aria_snapshot.yaml
    dom_snapshot.json
    css_usage.json
    source_metadata.json
    screenshots/
      desktop.png
      mobile.png
    network/
      requests.json
  distill/
    skeleton.html
    skeleton.css
    placeholders.json
    components/
      index.json
      <component-id>/
        component.json
        fragment.html
        fragment.css
        preview.png
  design/
    tokens.json
    palette.json
    typography.json
    spacing.json
    layout.json
    components.json
  package/
    agentclassroom-skillpack.zip
```

## Notes

- The concept document currently lives at `project_code_conecpt.md`.
- Safe mode keeps useful UI labels but replaces content-heavy copy with placeholders.
- The heuristics are intentionally deterministic and local. There are no external AI model calls.
- The MVP is single-page oriented. It does not crawl multi-page site structures yet.
