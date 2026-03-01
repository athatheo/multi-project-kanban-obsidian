#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { load, dump } from "js-yaml";

// --- Types (mirrored from src/types.ts) ---

interface Card {
  id: string;
  title: string;
}

interface Column {
  id: string;
  name: string;
  cards: Card[];
}

interface Project {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  columns: Column[];
}

interface BoardData {
  "kanban-board": true;
  projects: Project[];
}

// --- Constants ---

const DONE_COLUMN_NAME = "Done";
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

// --- Utilities ---

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function isDoneColumn(column: Column): boolean {
  return column.name === DONE_COLUMN_NAME;
}

function findCardLocation(
  data: BoardData,
  cardId: string
): { project: Project; column: Column; cardIndex: number } | undefined {
  for (const project of data.projects) {
    for (const column of project.columns) {
      const cardIndex = column.cards.findIndex((c) => c.id === cardId);
      if (cardIndex !== -1) return { project, column, cardIndex };
    }
  }
  return undefined;
}

function findColumnLocation(
  data: BoardData,
  columnId: string
): { project: Project; columnIndex: number } | undefined {
  for (const project of data.projects) {
    const columnIndex = project.columns.findIndex((c) => c.id === columnId);
    if (columnIndex !== -1) return { project, columnIndex };
  }
  return undefined;
}

// --- File I/O ---

function getBoardFilePath(): string {
  const raw = process.argv[2] || process.env.KANBAN_FILE;
  if (!raw) {
    throw new Error(
      "Board file path required: pass as first argument or set KANBAN_FILE env var"
    );
  }
  return resolve(raw);
}

function readBoard(): BoardData {
  const filePath = getBoardFilePath();
  if (!existsSync(filePath)) {
    throw new Error(`Board file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    throw new Error("Invalid board file: no YAML frontmatter found");
  }

  const parsed = load(match[1]) as Record<string, unknown>;
  if (!parsed || parsed["kanban-board"] !== true) {
    throw new Error("Invalid board file: missing kanban-board: true");
  }

  const data: BoardData = { "kanban-board": true, projects: [] };

  if (Array.isArray(parsed.projects)) {
    data.projects = parsed.projects.map((p: any) => ({
      id: p.id || generateId("proj"),
      name: p.name || "Untitled Project",
      color: p.color || "#4a90d9",
      collapsed: p.collapsed === true,
      columns: Array.isArray(p.columns)
        ? p.columns.map((c: any) => ({
            id: c.id || generateId("col"),
            name: c.name || "Untitled Column",
            cards: Array.isArray(c.cards)
              ? c.cards.map((card: any) => ({
                  id: card.id || generateId("card"),
                  title: card.title || "",
                }))
              : [],
          }))
        : [],
    }));
  }

  return ensureDoneColumns(data);
}

function writeBoard(data: BoardData): void {
  const filePath = getBoardFilePath();
  const yamlStr = dump(data, { lineWidth: -1, noRefs: true, sortKeys: false });
  writeFileSync(filePath, `---\n${yamlStr}---\n`, "utf-8");
}

// --- Data Operations ---

function ensureDoneColumns(data: BoardData): BoardData {
  let changed = false;
  const projects = data.projects.map((p) => {
    if (p.columns.some((c) => isDoneColumn(c))) return p;
    changed = true;
    return {
      ...p,
      columns: [
        ...p.columns,
        { id: generateId("col"), name: DONE_COLUMN_NAME, cards: [] },
      ],
    };
  });
  return changed ? { ...data, projects } : data;
}

function addProject(
  data: BoardData,
  name: string,
  color?: string
): { data: BoardData; project: Project } {
  const project: Project = {
    id: generateId("proj"),
    name,
    color: color || "#4a90d9",
    collapsed: false,
    columns: [{ id: generateId("col"), name: DONE_COLUMN_NAME, cards: [] }],
  };
  return {
    data: { ...data, projects: [...data.projects, project] },
    project,
  };
}

function removeProject(data: BoardData, projectId: string): BoardData {
  return { ...data, projects: data.projects.filter((p) => p.id !== projectId) };
}

function updateProject(
  data: BoardData,
  projectId: string,
  updates: Partial<Pick<Project, "name" | "color" | "collapsed">>
): BoardData {
  return {
    ...data,
    projects: data.projects.map((p) =>
      p.id === projectId ? { ...p, ...updates } : p
    ),
  };
}

function addColumn(
  data: BoardData,
  projectId: string,
  name: string
): { data: BoardData; column: Column } {
  const column: Column = { id: generateId("col"), name, cards: [] };
  return {
    data: {
      ...data,
      projects: data.projects.map((p) => {
        if (p.id !== projectId) return p;
        const doneIndex = p.columns.findIndex((c) => isDoneColumn(c));
        if (doneIndex === -1) return { ...p, columns: [...p.columns, column] };
        const newColumns = [...p.columns];
        newColumns.splice(doneIndex, 0, column);
        return { ...p, columns: newColumns };
      }),
    },
    column,
  };
}

function removeColumn(
  data: BoardData,
  projectId: string,
  columnId: string
): BoardData {
  const project = data.projects.find((p) => p.id === projectId);
  const column = project?.columns.find((c) => c.id === columnId);
  if (column && isDoneColumn(column))
    throw new Error("Cannot remove the Done column");
  return {
    ...data,
    projects: data.projects.map((p) =>
      p.id === projectId
        ? { ...p, columns: p.columns.filter((c) => c.id !== columnId) }
        : p
    ),
  };
}

function updateColumn(
  data: BoardData,
  projectId: string,
  columnId: string,
  updates: Partial<Pick<Column, "name">>
): BoardData {
  const project = data.projects.find((p) => p.id === projectId);
  const column = project?.columns.find((c) => c.id === columnId);
  if (column && isDoneColumn(column))
    throw new Error("Cannot rename the Done column");
  return {
    ...data,
    projects: data.projects.map((p) =>
      p.id === projectId
        ? {
            ...p,
            columns: p.columns.map((c) =>
              c.id === columnId ? { ...c, ...updates } : c
            ),
          }
        : p
    ),
  };
}

function addCard(
  data: BoardData,
  projectId: string,
  columnId: string,
  title: string
): { data: BoardData; card: Card } {
  const card: Card = { id: generateId("card"), title };
  return {
    data: {
      ...data,
      projects: data.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              columns: p.columns.map((c) =>
                c.id === columnId ? { ...c, cards: [...c.cards, card] } : c
              ),
            }
          : p
      ),
    },
    card,
  };
}

function removeCard(data: BoardData, cardId: string): BoardData {
  return {
    ...data,
    projects: data.projects.map((p) => ({
      ...p,
      columns: p.columns.map((c) => ({
        ...c,
        cards: c.cards.filter((card) => card.id !== cardId),
      })),
    })),
  };
}

function updateCard(
  data: BoardData,
  cardId: string,
  updates: Partial<Pick<Card, "title">>
): BoardData {
  return {
    ...data,
    projects: data.projects.map((p) => ({
      ...p,
      columns: p.columns.map((c) => ({
        ...c,
        cards: c.cards.map((card) =>
          card.id === cardId ? { ...card, ...updates } : card
        ),
      })),
    })),
  };
}

function moveCard(
  data: BoardData,
  cardId: string,
  targetProjectId: string,
  targetColumnId: string,
  targetIndex: number
): BoardData {
  const location = findCardLocation(data, cardId);
  if (!location) throw new Error(`Card not found: ${cardId}`);

  const card = location.column.cards[location.cardIndex];

  let newData: BoardData = {
    ...data,
    projects: data.projects.map((p) => ({
      ...p,
      columns: p.columns.map((c) => ({
        ...c,
        cards: c.cards.filter((cd) => cd.id !== cardId),
      })),
    })),
  };

  newData = {
    ...newData,
    projects: newData.projects.map((p) =>
      p.id === targetProjectId
        ? {
            ...p,
            columns: p.columns.map((c) => {
              if (c.id !== targetColumnId) return c;
              const newCards = [...c.cards];
              newCards.splice(Math.min(targetIndex, newCards.length), 0, card);
              return { ...c, cards: newCards };
            }),
          }
        : p
    ),
  };

  return newData;
}

function moveColumn(
  data: BoardData,
  columnId: string,
  targetProjectId: string,
  targetIndex: number
): BoardData {
  const location = findColumnLocation(data, columnId);
  if (!location) throw new Error(`Column not found: ${columnId}`);
  if (location.project.id !== targetProjectId)
    throw new Error("Columns can only be reordered within the same project");

  const column = location.project.columns[location.columnIndex];
  if (isDoneColumn(column)) throw new Error("Cannot move the Done column");

  return {
    ...data,
    projects: data.projects.map((p) => {
      if (p.id !== targetProjectId) return p;
      const newColumns = p.columns.filter((c) => c.id !== columnId);
      const doneIndex = newColumns.findIndex((c) => isDoneColumn(c));
      const maxIndex = doneIndex !== -1 ? doneIndex : newColumns.length;
      newColumns.splice(Math.min(targetIndex, maxIndex), 0, column);
      return { ...p, columns: newColumns };
    }),
  };
}

// --- MCP Server Setup ---

const server = new McpServer({
  name: "kanban-board",
  version: "1.0.0",
});

function errorResponse(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function jsonResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// --- Tool Registration ---

server.tool(
  "get_board",
  "Get the full kanban board data including all projects, columns, and cards",
  async () => {
    try {
      return jsonResponse(readBoard());
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "list_projects",
  "List all projects with their IDs, names, colors, and column/card counts",
  async () => {
    try {
      const data = readBoard();
      const summary = data.projects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        collapsed: p.collapsed,
        columnCount: p.columns.length,
        cardCount: p.columns.reduce((sum, c) => sum + c.cards.length, 0),
      }));
      return jsonResponse(summary);
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "get_project",
  "Get a specific project with all its columns and cards",
  { projectId: z.string().describe("The project ID") },
  async ({ projectId }) => {
    try {
      const data = readBoard();
      const project = data.projects.find((p) => p.id === projectId);
      if (!project) return errorResponse(`Project not found: ${projectId}`);
      return jsonResponse(project);
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "add_project",
  "Add a new project to the board. Each project starts with a Done column.",
  {
    name: z.string().describe("Project name"),
    color: z
      .string()
      .optional()
      .describe("Project color as hex code (default: #4a90d9)"),
  },
  async ({ name, color }) => {
    try {
      const data = readBoard();
      const result = addProject(data, name, color);
      writeBoard(result.data);
      return jsonResponse({
        message: "Project created",
        project: result.project,
      });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "remove_project",
  "Remove a project and all its columns and cards from the board",
  { projectId: z.string().describe("The project ID to remove") },
  async ({ projectId }) => {
    try {
      const data = readBoard();
      if (!data.projects.find((p) => p.id === projectId))
        return errorResponse(`Project not found: ${projectId}`);
      writeBoard(removeProject(data, projectId));
      return jsonResponse({ message: "Project removed", projectId });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "update_project",
  "Update a project's name, color, or collapsed state",
  {
    projectId: z.string().describe("The project ID to update"),
    name: z.string().optional().describe("New project name"),
    color: z.string().optional().describe("New project color as hex code"),
    collapsed: z
      .boolean()
      .optional()
      .describe("Whether the project is collapsed"),
  },
  async ({ projectId, name, color, collapsed }) => {
    try {
      const data = readBoard();
      if (!data.projects.find((p) => p.id === projectId))
        return errorResponse(`Project not found: ${projectId}`);
      const updates: Partial<Pick<Project, "name" | "color" | "collapsed">> =
        {};
      if (name !== undefined) updates.name = name;
      if (color !== undefined) updates.color = color;
      if (collapsed !== undefined) updates.collapsed = collapsed;
      const newData = updateProject(data, projectId, updates);
      writeBoard(newData);
      return jsonResponse({
        message: "Project updated",
        project: newData.projects.find((p) => p.id === projectId),
      });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "add_column",
  "Add a new column to a project. The column is inserted before the Done column.",
  {
    projectId: z.string().describe("The project ID to add the column to"),
    name: z.string().describe("Column name"),
  },
  async ({ projectId, name }) => {
    try {
      const data = readBoard();
      if (!data.projects.find((p) => p.id === projectId))
        return errorResponse(`Project not found: ${projectId}`);
      const result = addColumn(data, projectId, name);
      writeBoard(result.data);
      return jsonResponse({
        message: "Column created",
        column: result.column,
      });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "remove_column",
  "Remove a column from a project. The Done column cannot be removed.",
  {
    projectId: z.string().describe("The project ID"),
    columnId: z.string().describe("The column ID to remove"),
  },
  async ({ projectId, columnId }) => {
    try {
      const data = readBoard();
      writeBoard(removeColumn(data, projectId, columnId));
      return jsonResponse({ message: "Column removed", columnId });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "update_column",
  "Rename a column. The Done column cannot be renamed.",
  {
    projectId: z.string().describe("The project ID"),
    columnId: z.string().describe("The column ID to update"),
    name: z.string().describe("New column name"),
  },
  async ({ projectId, columnId, name }) => {
    try {
      const data = readBoard();
      const newData = updateColumn(data, projectId, columnId, { name });
      writeBoard(newData);
      return jsonResponse({ message: "Column updated", columnId, name });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "add_card",
  "Add a new card to a column in a project",
  {
    projectId: z.string().describe("The project ID"),
    columnId: z.string().describe("The column ID to add the card to"),
    title: z.string().describe("Card title/description"),
  },
  async ({ projectId, columnId, title }) => {
    try {
      const data = readBoard();
      const result = addCard(data, projectId, columnId, title);
      writeBoard(result.data);
      return jsonResponse({ message: "Card created", card: result.card });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "remove_card",
  "Remove a card from the board",
  { cardId: z.string().describe("The card ID to remove") },
  async ({ cardId }) => {
    try {
      const data = readBoard();
      if (!findCardLocation(data, cardId))
        return errorResponse(`Card not found: ${cardId}`);
      writeBoard(removeCard(data, cardId));
      return jsonResponse({ message: "Card removed", cardId });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "update_card",
  "Update a card's title",
  {
    cardId: z.string().describe("The card ID to update"),
    title: z.string().describe("New card title"),
  },
  async ({ cardId, title }) => {
    try {
      const data = readBoard();
      if (!findCardLocation(data, cardId))
        return errorResponse(`Card not found: ${cardId}`);
      const newData = updateCard(data, cardId, { title });
      writeBoard(newData);
      return jsonResponse({ message: "Card updated", cardId, title });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "move_card",
  "Move a card to a different column or project at a specific position index",
  {
    cardId: z.string().describe("The card ID to move"),
    targetProjectId: z.string().describe("The target project ID"),
    targetColumnId: z.string().describe("The target column ID"),
    targetIndex: z
      .number()
      .int()
      .min(0)
      .describe("Position index in the target column (0-based)"),
  },
  async ({ cardId, targetProjectId, targetColumnId, targetIndex }) => {
    try {
      const data = readBoard();
      const newData = moveCard(
        data,
        cardId,
        targetProjectId,
        targetColumnId,
        targetIndex
      );
      writeBoard(newData);
      return jsonResponse({
        message: "Card moved",
        cardId,
        targetProjectId,
        targetColumnId,
        targetIndex,
      });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

server.tool(
  "move_column",
  "Reorder a column within a project. The Done column cannot be moved and always stays last.",
  {
    columnId: z.string().describe("The column ID to move"),
    targetProjectId: z
      .string()
      .describe("The project ID (must be the same project the column is in)"),
    targetIndex: z
      .number()
      .int()
      .min(0)
      .describe("New position index (0-based)"),
  },
  async ({ columnId, targetProjectId, targetIndex }) => {
    try {
      const data = readBoard();
      const newData = moveColumn(data, columnId, targetProjectId, targetIndex);
      writeBoard(newData);
      return jsonResponse({
        message: "Column moved",
        columnId,
        targetProjectId,
        targetIndex,
      });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
