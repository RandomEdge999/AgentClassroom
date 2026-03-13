# Design-aware website interface scraping into agent-ready skillpacks

## Concept and success criteria

What you’re describing is best thought of as a **two-output pipeline**:

1) **High-fidelity capture** of a target page’s *rendered* front-end (DOM, styles, assets, responsive variants), similar to what offline copiers do, but with stronger guarantees for modern JS-heavy sites.

2) **Design-aware distillation** that turns the capture into a compact, structured “skillpack” for an AI agent: design tokens, component inventory, layout semantics, and an automatically generated, context-efficient Markdown briefing—without relying on a paid API or a local LLM.

A key insight: “download the front-end” and “teach an agent the design” are different problems. Traditional copiers focus on fidelity (grab everything). Your differentiator is **selectivity + structure**: keep what matters for reproducing the interface and patterns, and aggressively de-emphasise the site’s *content* (long text, article bodies, user data, unique images), while retaining enough shape and semantics to rebuild the UI.

To make this practical without an LLM, you need three things:

- **A robust rendered-page data source** (not just static HTML).
- **A deterministic filtering model** (heuristics + instrumentation, not generative).
- **A stable output contract** (folder structure + manifest + token schema + prompt template).

This aligns well with what we know from “main content extraction / boilerplate removal” research: **precision-oriented heuristic systems can perform very well**, and model-heavy approaches are not automatically better. citeturn7view0turn6view0  
You can reuse that lesson, but invert the goal: instead of “keep main text, remove layout,” you want “keep layout + component structure, remove unique content.”

## Prior art you can reuse

### Offline capture and archiving foundations

Several mature tools already solve parts of “download the front-end”:

- **Site mirroring / offline browsers**: entity["organization","HTTrack","offline browser utility"] downloads a website to a local directory, recursively fetching HTML and assets and rewriting links for offline browsing. citeturn3search3turn3search11turn3search15  
- **Single-file capture**:
  - entity["organization","SingleFile","web extension and cli"] saves a complete web page into a single HTML file (extension + CLI), designed for faithful offline copies. citeturn9view1turn0search12  
  - entity["organization","monolith","single html bundler"] similarly bundles a page into one HTML by embedding CSS/images/JS as data URLs. citeturn9view0turn0search0  

These are valuable reference implementations for **asset discovery, URL rewriting, deduplication**, and dealing with CDNs. They are *not* designed to produce a component/tokens breakdown, but they can anchor your “capture” layer.

For modern “sites that are apps,” high-fidelity crawlers tend to use real browsers plus DevTools instrumentation. For example, Browsertrix Crawler (from entity["organization","Webrecorder","web archiving tools"]) is a browser-based crawl system that runs in Docker, drives a browser using entity["organization","Puppeteer","headless browser automation"], and captures via the Chrome DevTools Protocol. citeturn4search6turn4search38turn4search2  
Even if you don’t adopt that exact stack, it’s a strong signal that **browser-in-the-loop** is the right approach for reliability.

### Extracting styles from rendered pages

To decide what’s “design” vs “garbage,” you need accurate style visibility:

- `extract-css-core` from Project Wallace renders a page in Chromium, then uses `document.styleSheets` plus scanning inline `[style]` attributes to collect styles including CSS-in-JS and inline styling—explicitly addressing the limitation of server-only HTML parsing. citeturn8view0turn3search28  
- Project Wallace’s wider CSS analysis tooling (their `css-analyzer`) demonstrates how to compute structured metrics and extract value distributions such as colours and font sizes from CSS. citeturn14view2turn14view1turn8view1  
- CSS Stats is another open source codebase oriented around “stats on stylesheets,” useful for ideas on token frequency analysis and reporting. citeturn3search0turn3search8  

### Removing unused CSS

Two families of approaches exist:

- **Static selector matching**: entity["organization","PurgeCSS","css selector remover"] matches selectors used in content files and removes unused selectors, producing smaller CSS. citeturn1search2turn1search6  
- **Browser-aware approaches**: entity["organization","UnCSS","unused css remover"] removes unused styles and explicitly supports JavaScript-injected CSS, typically by evaluating pages in a headless browser. citeturn3search2turn3search10  

For your project, “unused CSS removal” is not just optimisation: it’s a way to **reduce noise** so your extracted “design layer” is closer to what’s actually used on the page states you care about.

### Instrumentation you can leverage for “what’s used”

Chrome DevTools can generate CSS/JS usage coverage and report used vs unused bytes. citeturn11view1turn0search34  
Under the hood, the Chrome DevTools Protocol exposes **CSS rule usage tracking**—start usage recording, then query deltas of used rules. citeturn13view0turn12view0  
Separately, the DevTools Protocol’s **DOMSnapshot** can return a document snapshot including DOM, layout, and a whitelist of computed style properties. citeturn11view2turn2search3  

This is extremely relevant: it enables a deterministic, non-LLM answer to:
- “Which CSS rules were actually exercised in this viewport/state?”
- “What are the computed styles of the elements that survived filtering?”

### Accessibility-tree snapshots as semantic structure

Playwright’s ARIA snapshots provide a YAML representation of the accessibility tree (roles, hierarchy, accessible names), useful for capturing page structure without copying all raw text and markup. citeturn10view1turn2search2  
This is a powerful ingredient for your prompt: it gives an agent a compact view of **what widgets exist and how they’re nested**, which is closer to “design intent” than raw HTML.

### Standardised design token interchange

The Design Tokens Community Group publishes a draft format spec for exchanging design tokens; it defines design tokens as name/value pairs with optional metadata, with the explicit goal of interoperability across tools. citeturn10view0turn1search0  
Style Dictionary is a widely used open-source build system for transforming design tokens into platform outputs. citeturn1search1turn1search13turn1search25  

For your output, adopting either:
- **DTCG-style token JSON**, or
- a DTCG-compatible subset  
is a strong choice because it means your “skillpack tokens” can plug into existing design-system tooling later.

## Reference architecture for your tool

A practical architecture (with no paid APIs, no local LLM) is:

**Local web app (optional) + CLI-first core**
- CLI is your “engine”: deterministic pipelines run locally, output a folder/zip.
- Web UI is a thin wrapper: submit a URL, choose options, show progress, download the generated skillpack.

**Core pipeline stages**

1) **Capture**
   - Launch a headless browser.
   - Load URL with configurable waiting strategy (network idle / DOMContentLoaded).
   - Record:
     - final rendered HTML (`page.content()` equivalent),
     - network responses (CSS/JS/images/fonts),
     - full-page screenshots per viewport,
     - optional video/trace for debugging.

   Rationale: JS-heavy pages won’t be captured well by purely static fetchers. Browser-based crawlers are the proven approach. citeturn4search6turn8view0turn2search1  

2) **Instrument**
   - **DOMSnapshot**: request computed styles for a curated property whitelist (colours, typography, box model, layout). citeturn11view2turn2search3  
   - **CSS usage**:
     - Either Puppeteer’s Coverage API (CSS/JS usage) citeturn0search2turn0search22  
     - Or CDP CSS rule usage tracking (`startRuleUsageTracking`, `takeCoverageDelta`). citeturn13view0turn12view0  
   - **ARIA snapshot** (optional but recommended): capture accessibility tree YAML for structural semantics. citeturn10view1turn2search2  

3) **Distil**
   - Produce a clean, local “design skeleton” representation:
     - Strip scripts, tracking, analytics beacons.
     - Replace long text blocks with placeholders.
     - Replace unique imagery with placeholders (optionally keep dimensions/alt).
   - Reduce CSS:
     - Keep only used CSS rules for recorded states, or
     - generate “critical UI CSS” per viewport using coverage/rule usage. citeturn11view1turn13view0  

4) **Extract design semantics**
   - Build:
     - **Token candidates** (colours, font families/sizes, radii, shadows, spacing).
     - **Component inventory** (navbars, hero sections, cards, buttons, forms…).
     - **Layout model** (primary columns, grids, breakpoints).
   - Output as JSON + Markdown prompt.

5) **Package**
   - Emit a stable folder structure with:
     - a single main `PROMPT.md`,
     - a machine-readable `manifest.json`,
     - assets and snapshots,
     - tokens format JSON.

**Suggested implementation stack**

If you want the fastest MVP with best ecosystem support for CSS parsing and CDP work:

- Node.js + TypeScript
- Playwright (navigation, network interception, screenshots, ARIA snapshots) citeturn2search1turn10view1  
- CDP access (Chromium) for DOMSnapshot + CSS rule usage citeturn11view2turn13view0  
- Optionally reuse `extract-css-core` for CSS harvesting ideas or as a dependency. citeturn8view0  
- PostCSS ecosystem for CSS parsing, plus optional PurgeCSS/UnCSS for reduction. citeturn1search2turn3search2  

Python is possible (Playwright has Python bindings), but most “CSS tooling” gravity is in Node.

## Design-vs-content classification without an LLM

You want an “intelligent enough” filter that keeps design signal and removes noise. Without an LLM, you can still get surprisingly far by combining **three orthogonal signals**:

### Structural signals from the DOM and accessibility tree

- Prefer semantic containers: `header`, `nav`, `main`, `footer`, `aside`, sectioning elements.
- Identify interactive controls via roles (`button`, `link`, `textbox`, `checkbox`, menus) and hierarchy; ARIA snapshots were designed to represent that structure in a compact way. citeturn10view1  

**Rule of thumb**: if it is reachable as a named control in the accessibility tree, it’s likely “UI” not “content.”

### Visual/layout signals from DOMSnapshot + computed styles

Using DOMSnapshot, you can request a whitelist of computed styles and layout rectangles, giving you a consistent feature set across sites. citeturn11view2  

Heuristic features (per node/component candidate):
- bounding box area (hero vs small text),
- font size/weight and line-height (headings, buttons),
- background colour vs transparent,
- border radius / shadow presence (cards),
- display type (flex/grid blocks),
- z-index (sticky headers, overlays),
- whitespace distribution (UI components tend to have consistent padding/margins).

### “Used CSS” signal to reduce garbage

Coverage/rule-usage tells you what was exercised in your recorded states. That enables two important filters:

- remove CSS rules never used during page load + minimal interactions,
- identify *which selectors are actually binding* to visible nodes. citeturn11view1turn13view0turn0search2  

This is the non-LLM way to implement your “don’t train on garbage” constraint.

### Concrete distillation behaviours

A good deterministic distiller typically does these transformations:

- **Text placeholdering**:
  - Large paragraph blocks → `{{lorem}}` placeholder
  - Headlines → keep short text or replace with `{{headline}}`
  - Buttons/labels → keep text (it’s functional UI)
- **Image handling**:
  - Replace content images with placeholders, preserve size/aspect ratio
  - Keep icons/logos optionally if they’re integral to UI
- **Link normalisation**:
  - Keep nav structure (link count, grouping), redact URLs to `#` or local route tokens
- **Component deduplication**:
  - Detect repeated DOM subtrees (cards in a grid) and store:
    - one canonical template
    - plus a count and a list of “variants” (e.g., first card has badge, others don’t)

### Why heuristics are a reasonable bet

The web content extraction evaluation by Bevendorff et al. explicitly notes that **precision-oriented heuristics perform quite well** and that some neural approaches perform poorly “so far.” citeturn7view0turn6view0  
While that work focuses on extracting *main text*, the broader lesson applies: deterministic, well-engineered heuristics can be strong when you have good instrumentation—and you do (coverage, DOMSnapshot, accessibility tree).

## Skillpack output contract and file structure

The most important “agent usability” feature is a **predictable structure** and a **manifest-first workflow**: the agent reads `manifest.json` and `PROMPT.md`, then selectively opens only the artefacts it needs.

Below is a file structure designed for:
- minimal context waste,
- easy selective loading,
- future expansion (multi-page crawls, multiple viewports, interaction states).

### Proposed folder layout

```text
skillpacks/
  <domain>__<path>__<timestamp>/
    manifest.json
    PROMPT.md
    LICENSE_NOTICES.md
    capture/
      options.json
      pages/
        page_<slug>/
          rendered.html
          aria_snapshot.yaml
          dom_snapshot.json
          screenshots/
            desktop.png
            mobile.png
          network/
            requests.har
            responses/
              <hash>.<ext>
    distill/
      pages/
        page_<slug>/
          skeleton.html
          skeleton.css
          placeholders.json
          components/
            component_<id>/
              component.json
              fragment.html
              fragment.css
              preview.png
    design/
      tokens/
        tokens.dtcg.json
        tokens.summary.json
      typography/
        fonts_detected.json
      colour/
        palette.json
      spacing/
        spacing_scale.json
    indexes/
      component_index.json
      selector_index.json
      route_index.json
```

### What each top-level file does

- `manifest.json`: single source of truth for:
  - original URL(s),
  - timestamps,
  - tool version,
  - viewports captured,
  - which extraction features ran (coverage? DOMSnapshot? ARIA?),
  - pointers to key outputs (tokens, components, skeleton files).

- `PROMPT.md`: your context-efficient, human-readable briefing. It should be **generated from the manifest + extracted artefacts**, not handwritten. (You can still allow user edits.)

- `LICENSE_NOTICES.md`: enumerates which third-party artefacts were captured (fonts, images), and provides a “do not redistribute” warning by default.

### Token format recommendation

Use a DTCG-style JSON document for tokens, because it’s designed as an interchange file format for design tokens. citeturn10view0turn1search0  
Then, optionally provide transforms via Style Dictionary if you later want to export tokens to CSS variables, Tailwind config, etc. citeturn1search1turn1search25  

Your `tokens.dtcg.json` can be a pragmatic subset (colours, typography, radii, shadows, spacing). The extraction methods are grounded in existing open tooling approaches that compute value distributions (e.g., colours, font sizes). citeturn14view1turn14view2  

### The Markdown prompt template

A deterministic `PROMPT.md` that stays context-efficient usually has these sections:

- **Scope**: what page, what viewports, what states captured.
- **Design tokens**: top palette, typography scale, radii/shadows, spacing.
- **Layout map**: a short description of page-level regions and grids.
- **Component catalogue**: list of key components with:
  - component id,
  - selector hints,
  - file references (`fragment.html`, `fragment.css`, preview image),
  - token references.
- **Agent instructions**:
  - How to import into its own “skills” directory,
  - When to open which artefacts (manifest first, then tokens, then components),
  - Redaction policy (don’t copy text/images; use placeholders).

ARIA snapshots can serve as a compact “structure truth” section inside the prompt because they represent the accessibility tree as YAML. citeturn10view1  

CSS rule usage tracking is the basis for explicitly saying “this skeleton.css is a minimised subset of the used rules measured during capture.” citeturn13view0turn11view1  

## MVP definition with a working plan

Below is a tight MVP that still fulfils your core promise: “enter URL → get an intelligent design-only skillpack.”

### MVP feature set

**Input**
- URL
- Viewports: default `{desktop: 1440x900, mobile: 390x844}`
- Capture depth: single page only (MVP); internal links later
- Mode toggles:
  - “Safe design mode” (redact text + replace images)
  - “Include assets” (store images/fonts locally)

**Capture**
- Headless navigation + screenshots
- Save rendered HTML
- Capture ARIA snapshot YAML citeturn10view1  
- Capture DOMSnapshot (computed style whitelist + layout rects) citeturn11view2  
- Capture CSS rule usage deltas and extract “used CSS subset” citeturn13view0turn11view1  

**Distil**
- Generate `skeleton.html`:
  - remove scripts,
  - redact long text,
  - replace images with placeholders.
- Generate `skeleton.css`:
  - keep selectors/rules measured as used (best-effort),
  - keep relevant `@media` blocks tied to viewports.

**Extract**
- Generate tokens:
  - colours: background, text, borders
  - typography: families, sizes, weights
  - radii + shadows
  - spacing candidates (padding/margin/gap bins)
- Generate components:
  - identify repeated subtrees (cards, nav items)
  - always extract: header/nav, hero, primary CTA, card grids, forms, footer (if present)

**Package**
- Write folder layout + `manifest.json` + `PROMPT.md`

### MVP implementation sequence

**Step A: Capture engine**
- Build a single `capture(url, options)` that writes:
  - `rendered.html`,
  - screenshots,
  - `aria_snapshot.yaml`,
  - `dom_snapshot.json`,
  - network HAR.

Playwright’s network tooling and interception patterns are well documented (glob patterns, routing, waiting for responses). citeturn2search1  

**Step B: DOMSnapshot + CSS usage**
- For Chromium targets:
  - call `DOMSnapshot.captureSnapshot` with a computed style whitelist. citeturn11view2  
  - enable CSS rule usage tracking, visit the page, query `takeCoverageDelta`, then stop tracking. citeturn13view0  

This yields a directly measurable “what CSS mattered” substrate, similar in spirit to Chrome’s own Coverage panel. citeturn11view1  

**Step C: Distiller**
- Implement deterministic HTML transformations:
  - remove scripts/iframes by default,
  - redact text nodes exceeding thresholds,
  - preserve labels for interactive elements (role-based),
  - preserve DOM structure and class attributes.

**Step D: Token extractor**
- Start simple:
  - compute frequency tables from computed styles and/or parsed CSS,
  - pick “top N” per category + cluster near-duplicates (e.g., multiple greys).
- Optionally incorporate existing approaches from CSS analysis libraries that already produce colour/font size distributions. citeturn14view1turn14view2  

**Step E: Component extractor**
- Structural hashing:
  - hash DOM subtrees (tag sequence + class/role signatures),
  - pick repeated hashes as component candidates,
  - extract `fragment.html` + used CSS rules affecting that subtree.

**Step F: Prompt generator**
- Template `PROMPT.md` from extracted artefacts:
  - the agent reads `manifest.json` first,
  - uses token files as the shared vocabulary,
  - loads component fragments on demand.

### “Perfecting” beyond MVP

Once MVP works, the biggest quality leaps usually come from:

- **Interaction state capture** (menu open, modal open, hover/focus styles).  
  CDP can force pseudo states for style computation (e.g., via CSS agent methods); this helps you capture hover/focus tokens and rules deterministically. citeturn12view0turn2search6  
- **Multi-page templates**: crawl a small set of internal pages (home, pricing, docs) and build shared tokens/components across them.
- **WARC/WACZ optional output** for reproducibility and auditability (store the exact capture as an archival artefact). The Library of Congress describes WARC as an aggregate archival file format designed to store multiple harvested web resources together with related information. citeturn4search1turn4search25  

## Constraints, compliance, and testing

### Robots and site constraints

If you crawl arbitrary sites, you need a policy for robots directives. The Robots Exclusion Protocol is now specified in RFC 9309, and it explicitly notes that robots rules are **requested** instructions and **not** a form of access authorisation. citeturn11view0turn4search0  
From a product perspective: respect `robots.txt` by default, but allow an explicit override for sites you own or have permission to analyse.

### Copyright and safe defaults

Your “design distillation” goal is helped by a cautious default: **redact text and replace images** unless the user explicitly enables “include assets.”

Two grounding points from entity["organization","U.S. Copyright Office","copyright agency"] guidance:

- Copyright does not protect ideas/methods/systems, but does protect specific creative expression. citeturn15view0  
- Their Circular 61 discusses that HTML can be registered as a literary work if human-created and sufficiently creative, and it also notes that copyright law does not protect functional aspects such as algorithms or system design. citeturn16view1turn16view0  

This is not legal advice, but it supports the engineering conclusion: **don’t ship a tool whose default output is a redistributable clone**. Ship a tool whose default output is a **design study artefact**.

### Testing and quality gates

You can borrow a QA idea from high-fidelity crawling practice: compare what the browser encountered during crawling against the replay or the produced artefacts using **screenshots and resource comparisons**. citeturn4search14turn4search2  

For your MVP, define quantitative gates:

- Skeleton renders without fatal console errors.
- Visual similarity:
  - compare screenshots of original vs skeleton for layout similarity (tolerant threshold).
- Token coverage:
  - percent of visible nodes whose computed styles map to extracted tokens.
- CSS reduction safety:
  - skeleton retains layout at both viewports.

### Security for local execution

Because you will execute third-party JavaScript in a browser engine, treat it as untrusted:
- run in a sandbox/container where feasible,
- block requests to private network ranges if you ever expose this via a server,
- store captures locally by default.

This is one of the core reasons many browser-based crawlers ship as Dockerised systems. citeturn4search6turn4search2