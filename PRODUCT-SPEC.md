# Markdown Preview Web Application — Product & Technical Specification

## 1. Overview

Build a minimalist web application for **viewing Markdown files**, with lightweight editing capabilities.

The primary purpose is to:

1. Open/import `.md` files.
2. Drag and drop `.md` files into the application.
3. Render Markdown into a clean preview.
4. Optionally edit the Markdown source.
5. Export/download the Markdown file.
6. Provide a light/dark theme.

The application should feel fast, simple, distraction-free, and suitable for quickly reading or editing Markdown documents.

---

## 2. Core Principles

- **Preview first** — the rendered Markdown is the primary experience.
- **Minimal UI** — avoid unnecessary buttons, panels, settings, accounts, or persistence.
- **Local-first** — files are processed entirely in the browser whenever possible.
- **No authentication.**
- **No backend database.**
- **Responsive** — desktop first, but usable on tablets and mobile.
- **Keyboard-friendly.**
- **Dark mode supported.**

---

# 3. Main User Flow

### Opening the application

The user sees:

- Application name/logo.
- Import/Open button.
- Theme toggle.
- Empty-state drop zone.

Example empty state:

> Drop a Markdown file here  
> or  
> Open a `.md` file

After loading a file, the preview becomes the main screen.

### Opening a Markdown file

Supported methods:

- File picker.
- Drag & drop.
- Optional paste of Markdown text.

Only `.md` and `.markdown` files should be accepted.

### Viewing

The Markdown document is rendered with support for common Markdown syntax:

- Headings
- Paragraphs
- Bold
- Italic
- Strikethrough
- Links
- Images
- Ordered lists
- Unordered lists
- Nested lists
- Blockquotes
- Inline code
- Code blocks
- Horizontal rules
- Tables
- Checkboxes/task lists

---

# 4. Application Layout

## Desktop

```text
┌──────────────────────────────────────────────────────────┐
│  Markdown Preview              Edit   Export   ☾          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│                  Rendered Markdown                       │
│                                                          │
│                  # My Document                           │
│                                                          │
│                  Markdown content...                     │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

The interface should remain visually sparse.

### Header

Contains:

- Application name.
- Current filename, when available.
- `Edit` button.
- `Export` button.
- Theme toggle.

Optional:

- Word count.
- Character count.

These should not dominate the interface.

---

# 5. Empty State

When no file is loaded:

```text
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                     Markdown Preview                     │
│                                                          │
│                  ┌───────────────────┐                   │
│                  │                   │                   │
│                  │  Drop .md here    │                   │
│                  │                   │                   │
│                  │   or Open File    │                   │
│                  │                   │                   │
│                  └───────────────────┘                   │
│                                                          │
│                  Supports Markdown files                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

The drop zone should visibly react when a file is dragged over it.

---

# 6. Editor Mode

Editing is secondary to previewing.

The user should be able to switch between:

- **Preview**
- **Edit**

A simple implementation can use a `<textarea>` rather than a complex code editor.

Example:

```text
┌──────────────────────────────────────────────────────────┐
│  README.md                     Preview   Edit   Export ☾ │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  # My Project                                            │
│                                                          │
│  This is my project documentation.                       │
│                                                          │
│  ## Installation                                         │
│                                                          │
│  npm install                                             │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Editor requirements

- Monospace font.
- Line wrapping.
- Reasonable padding.
- Full available height.
- No need for syntax highlighting in the MVP.
- Changes should immediately update the preview when switching back.

---

# 7. Split Editor / Preview

A future enhancement can provide a split mode:

```text
┌──────────────────────────┬───────────────────────────────┐
│ Markdown                 │ Preview                      │
├──────────────────────────┼───────────────────────────────┤
│ # Hello                  │ # Hello                      │
│                          │                               │
│ This is **Markdown**.    │ This is Markdown.            │
│                          │                               │
└──────────────────────────┴───────────────────────────────┘
```

This is **not required for the MVP**.

---

# 8. Import

The application must support importing local Markdown files.

### Requirements

- `<input type="file">`
- Accept `.md` and `.markdown`.
- Read using the browser `FileReader` API.
- Store the document contents in React state.
- Display the filename.

No file should be uploaded to a server.

### Invalid files

If the user attempts to open an unsupported file:

> Please select a Markdown file (.md).

---

# 9. Drag & Drop

The entire application should act as a drop target when appropriate.

Supported behavior:

1. User drags `.md` file over application.
2. UI highlights the drop area.
3. User releases the file.
4. Application reads the file.
5. Preview is displayed.
6. Filename is shown in the header.

Dragging an unsupported file should produce a small non-blocking error message.

---

# 10. Export

The user should be able to download the current Markdown document.

### Export behavior

Clicking `Export` downloads:

```text
filename.md
```

If the document was edited, the exported file must contain the **current editor contents**.

If no filename exists:

```text
document.md
```

Use the browser `Blob` API and a temporary download link.

No backend is required.

---

# 11. Theme

Support:

- Light
- Dark
- System

The minimum implementation can simply provide a light/dark toggle.

### Dark theme

The dark theme should use:

- Dark background.
- Slightly lighter surfaces.
- High-contrast text.
- Muted secondary text.
- Subtle borders.
- Comfortable Markdown typography.

Avoid excessive gradients, neon colors, shadows, or "AI SaaS" visual styling.

The design should feel closer to a modern developer tool.

Theme preference should be stored in:

```text
localStorage
```

---

# 12. Markdown Rendering

Use a mature Markdown parser instead of implementing Markdown parsing manually.

Recommended stack:

- `react-markdown`
- `remark-gfm`

`remark-gfm` provides support for GitHub-Flavored Markdown features such as:

- Tables
- Task lists
- Strikethrough
- Autolinks

The renderer should have custom styling for:

- `h1`–`h6`
- paragraphs
- links
- lists
- blockquotes
- code
- preformatted blocks
- tables
- images
- horizontal rules

---

# 13. Security

Markdown content must be treated as untrusted input.

The application must prevent arbitrary HTML/JavaScript from being executed through imported Markdown.

If raw HTML support is added later, it must be explicitly sanitized.

For the MVP:

- Do not execute scripts from Markdown.
- Avoid blindly injecting Markdown into the DOM using `dangerouslySetInnerHTML`.
- Prefer `react-markdown`.

---

# 14. Persistence

The MVP does **not** need a database.

Optional local persistence:

### Current document

Save the current Markdown contents to `localStorage` or IndexedDB.

However, this should be optional because the simplest implementation can simply keep the document in memory.

### Theme

Theme preference should persist through `localStorage`.

---

# 15. Recommended Tech Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

Recommended libraries:

```text
react-markdown
remark-gfm
lucide-react
```

Optional:

```text
react-dropzone
```

Although native drag-and-drop APIs are simple enough that `react-dropzone` is not necessary.

## Backend

**None required for the MVP.**

The application can be entirely client-side.

If a Node backend is desired for architectural purposes:

- Node.js
- Fastify or Express
- TypeScript

But the backend should initially only serve the frontend.

There is no reason to upload Markdown files to Node.

---

# 16. Suggested Project Structure

```text
markdown-preview/
│
├── src/
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── EmptyState.tsx
│   │   ├── MarkdownPreview.tsx
│   │   ├── MarkdownEditor.tsx
│   │   ├── FileDropZone.tsx
│   │   └── ThemeToggle.tsx
│   │
│   ├── hooks/
│   │   ├── useMarkdownFile.ts
│   │   └── useTheme.ts
│   │
│   ├── lib/
│   │   └── file.ts
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── public/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

# 17. Application State

Keep state deliberately small.

```typescript
type ViewMode = "preview" | "edit";

interface MarkdownDocument {
  filename: string;
  content: string;
}
```

Main application state:

```text
document
viewMode
theme
error
isDragging
```

No Redux or other global state manager is necessary.

React state/context is sufficient.

---

# 18. UX Requirements

### Keyboard shortcuts

Recommended:

```text
Ctrl/Cmd + O  → Open file
Ctrl/Cmd + S  → Export
Ctrl/Cmd + E  → Toggle editor/preview
```

The application should prevent browser defaults where appropriate.

### Unsaved changes

If the user imports a file, edits it, and attempts to leave the page, optionally show a browser confirmation.

This can be added after the MVP.

---

# 19. Responsive Behavior

### Desktop

Use a centered document with a comfortable maximum width:

```text
max-width: 900px
```

The preview should not stretch across an ultra-wide monitor.

### Mobile

- Header becomes compact.
- Buttons can use icons with tooltips.
- Preview uses almost the entire screen width.
- Editor uses the full viewport.
- Drag & drop is naturally unavailable on most mobile devices, so file picker remains the primary import method.

---

# 20. Visual Design

The application should be:

- Minimalist
- Developer-oriented
- Quiet
- Fast
- Typography-focused

Avoid:

- Large hero sections.
- Excessive cards.
- Gradients.
- Complex navigation.
- Sidebars unless needed.
- User accounts.
- Dashboards.
- Excessive animations.

Suggested visual hierarchy:

```text
Application
    ↓
File / actions
    ↓
Markdown document
```

The document itself should receive the majority of the visual attention.

---

# 21. MVP Feature List

### Required

- [ ] React + TypeScript application
- [ ] Markdown preview
- [ ] `.md` file import
- [ ] `.markdown` file import
- [ ] Drag & drop
- [ ] Filename display
- [ ] Basic Markdown rendering
- [ ] GFM support
- [ ] Edit mode
- [ ] Export/download `.md`
- [ ] Light theme
- [ ] Dark theme
- [ ] Theme persistence
- [ ] Responsive layout
- [ ] Client-side file processing
- [ ] Basic error handling

### Nice-to-have

- [ ] Split editor/preview
- [ ] Keyboard shortcuts
- [ ] Word count
- [ ] Character count
- [ ] Auto-save
- [ ] Recent files
- [ ] Table of contents
- [ ] Copy rendered HTML
- [ ] Copy Markdown
- [ ] Print/PDF support
- [ ] Custom Markdown CSS

---

# 22. Explicitly Out of Scope

Do **not** build these in the first version:

- Authentication
- User accounts
- Cloud storage
- Database
- Collaboration
- Real-time editing
- Comments
- Version history
- AI features
- Rich-text/WYSIWYG editor
- Complex settings
- Plugin system
- Full document management

The goal is a **small Markdown utility**, not a document platform.

---

# 23. Acceptance Criteria

The MVP is complete when a user can:

1. Open the application.
2. Drag a `.md` file onto it.
3. See the Markdown rendered correctly.
4. Open a file using the file picker.
5. Switch to an editor.
6. Modify the Markdown.
7. Switch back to preview and see the changes.
8. Export the modified Markdown.
9. Toggle between light and dark themes.
10. Reload the page and retain the selected theme.
11. Use the application without an internet connection after the application itself has loaded.
12. Never have the contents of their Markdown file uploaded to a server.

---

# 24. Architecture Summary

The simplest architecture is:

```text
                 Browser
                    │
        ┌───────────┴───────────┐
        │                       │
     File API               React App
        │                       │
        │              ┌────────┴────────┐
        │              │                 │
        ▼           Editor           Markdown
     .md text          │              Renderer
                       │                 │
                       └────────┬────────┘
                                │
                              Preview
```

No database and no API are necessary.

If Node.js is required, use it purely as the application/server layer:

```text
Browser
   │
   ▼
Node.js
   │
   └── serves React application

Markdown files
   │
   └── never leave the browser
```

This keeps the application extremely cheap to host, easy to deploy, and easy to maintain.