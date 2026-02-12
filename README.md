# Multi-Project Kanban Board

An Obsidian plugin for managing multiple projects on a single kanban board. Each project is a collapsible row with custom columns and draggable cards — all stored as YAML frontmatter in a standard markdown file.

## Features

- **Multiple projects** on one board, each as a collapsible row
- **Custom columns** per project (no fixed defaults)
- **Drag & drop** cards between columns and between projects
- **Drag & drop** columns to reorder within a project
- **Inline editing** for project names, column names, and card titles
- **Project colors** with a native color picker
- **Persistent state** — collapse/expand, colors, and ordering saved in YAML frontmatter
- **Standard markdown** — board files are regular `.md` files you can edit manually

## Usage

1. **Create a board**: Use the ribbon icon or run the command "Create new kanban board"
2. **Add a project**: Click the "Add Project" button at the top
3. **Add columns**: Click "Add Column" at the end of a project's row
4. **Add cards**: Click the "+" button at the bottom of any column
5. **Drag cards**: Drag cards between columns or between projects
6. **Reorder columns**: Drag columns by their grip handle
7. **Collapse/expand**: Click the chevron on a project header
8. **Change color**: Click the color swatch on a project header
9. **Rename**: Click any project name, column name, or card title to edit inline

## Data Format

Board data is stored as YAML frontmatter in a `.md` file:

```yaml
---
kanban-board: true
projects:
  - id: "proj-1707000000000"
    name: "Project Alpha"
    color: "#4a90d9"
    collapsed: false
    columns:
      - id: "col-1707000000001"
        name: "Backlog"
        cards:
          - id: "card-1707000000010"
            title: "Design the login page"
      - id: "col-1707000000002"
        name: "In Progress"
        cards: []
---
```

## Local Installation (Development)

```bash
cd /path/to/kanban-board-obsidian-plugin
npm install
npm run dev  # Watch mode

# Symlink into vault
ln -s "$(pwd)" "/path/to/vault/.obsidian/plugins/multi-project-kanban"
```

Then enable in Obsidian: Settings > Community Plugins > Enable "Multi-Project Kanban Board". Use Cmd+R (or Ctrl+R) to reload after code changes.

## Publishing to Community Plugins

1. Push code to a public GitHub repo
2. Create a GitHub release (tag = version, no `v` prefix) with `main.js`, `manifest.json`, `styles.css` as release assets:
   ```bash
   git tag 1.0.0 && git push origin 1.0.0
   gh release create 1.0.0 main.js manifest.json styles.css --title "1.0.0"
   ```
3. Fork `obsidianmd/obsidian-releases`, add entry to `community-plugins.json`:
   ```json
   {
     "id": "multi-project-kanban",
     "name": "Multi-Project Kanban Board",
     "author": "athatheo",
     "description": "Manage multiple projects on a single kanban board with collapsible rows, custom columns, and draggable cards.",
     "repo": "athatheo/kanban-board-obsidian-plugin"
   }
   ```
4. Open PR to `obsidianmd/obsidian-releases` and complete the self-assessment checklist

## License

MIT
