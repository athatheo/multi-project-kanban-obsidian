import { parseYaml, stringifyYaml } from "obsidian";
import { BoardData, Project, Column, Card } from "./types";
import { generateId, findCardLocation, findColumnLocation } from "./utils";

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

export function parseBoardData(fileContent: string): BoardData | null {
	const match = fileContent.match(FRONTMATTER_REGEX);
	if (!match) return null;

	try {
		const yaml = parseYaml(match[1]);
		if (!yaml || yaml["kanban-board"] !== true) return null;

		const data: BoardData = {
			"kanban-board": true,
			projects: [],
		};

		if (Array.isArray(yaml.projects)) {
			data.projects = yaml.projects.map((p: any) => ({
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

		return data;
	} catch {
		return null;
	}
}

export function serializeBoardData(data: BoardData): string {
	const yaml = stringifyYaml(data);
	return `---\n${yaml}---\n`;
}

export function createEmptyBoardData(): BoardData {
	return {
		"kanban-board": true,
		projects: [],
	};
}

export function addProject(data: BoardData, name: string): BoardData {
	const project: Project = {
		id: generateId("proj"),
		name,
		color: "#4a90d9",
		collapsed: false,
		columns: [],
	};
	return {
		...data,
		projects: [...data.projects, project],
	};
}

export function removeProject(data: BoardData, projectId: string): BoardData {
	return {
		...data,
		projects: data.projects.filter(p => p.id !== projectId),
	};
}

export function updateProject(data: BoardData, projectId: string, updates: Partial<Pick<Project, "name" | "color" | "collapsed">>): BoardData {
	return {
		...data,
		projects: data.projects.map(p =>
			p.id === projectId ? { ...p, ...updates } : p
		),
	};
}

export function addColumn(data: BoardData, projectId: string, name: string): BoardData {
	const column: Column = {
		id: generateId("col"),
		name,
		cards: [],
	};
	return {
		...data,
		projects: data.projects.map(p =>
			p.id === projectId
				? { ...p, columns: [...p.columns, column] }
				: p
		),
	};
}

export function removeColumn(data: BoardData, projectId: string, columnId: string): BoardData {
	return {
		...data,
		projects: data.projects.map(p =>
			p.id === projectId
				? { ...p, columns: p.columns.filter(c => c.id !== columnId) }
				: p
		),
	};
}

export function updateColumn(data: BoardData, projectId: string, columnId: string, updates: Partial<Pick<Column, "name">>): BoardData {
	return {
		...data,
		projects: data.projects.map(p =>
			p.id === projectId
				? {
					...p,
					columns: p.columns.map(c =>
						c.id === columnId ? { ...c, ...updates } : c
					),
				}
				: p
		),
	};
}

export function addCard(data: BoardData, projectId: string, columnId: string, title: string): BoardData {
	const card: Card = {
		id: generateId("card"),
		title,
	};
	return {
		...data,
		projects: data.projects.map(p =>
			p.id === projectId
				? {
					...p,
					columns: p.columns.map(c =>
						c.id === columnId
							? { ...c, cards: [...c.cards, card] }
							: c
					),
				}
				: p
		),
	};
}

export function removeCard(data: BoardData, cardId: string): BoardData {
	return {
		...data,
		projects: data.projects.map(p => ({
			...p,
			columns: p.columns.map(c => ({
				...c,
				cards: c.cards.filter(card => card.id !== cardId),
			})),
		})),
	};
}

export function updateCard(data: BoardData, cardId: string, updates: Partial<Pick<Card, "title">>): BoardData {
	return {
		...data,
		projects: data.projects.map(p => ({
			...p,
			columns: p.columns.map(c => ({
				...c,
				cards: c.cards.map(card =>
					card.id === cardId ? { ...card, ...updates } : card
				),
			})),
		})),
	};
}

export function moveCard(data: BoardData, cardId: string, targetProjectId: string, targetColumnId: string, targetIndex: number): BoardData {
	const location = findCardLocation(data, cardId);
	if (!location) return data;

	const card = location.column.cards[location.cardIndex];

	// Remove card from source
	let newData: BoardData = {
		...data,
		projects: data.projects.map(p => ({
			...p,
			columns: p.columns.map(c => ({
				...c,
				cards: c.cards.filter(cd => cd.id !== cardId),
			})),
		})),
	};

	// Insert card at target
	newData = {
		...newData,
		projects: newData.projects.map(p =>
			p.id === targetProjectId
				? {
					...p,
					columns: p.columns.map(c => {
						if (c.id !== targetColumnId) return c;
						const newCards = [...c.cards];
						const insertAt = Math.min(targetIndex, newCards.length);
						newCards.splice(insertAt, 0, card);
						return { ...c, cards: newCards };
					}),
				}
				: p
		),
	};

	return newData;
}

export function moveColumn(data: BoardData, columnId: string, targetProjectId: string, targetIndex: number): BoardData {
	const location = findColumnLocation(data, columnId);
	if (!location) return data;

	// Only allow reorder within the same project
	if (location.project.id !== targetProjectId) return data;

	const column = location.project.columns[location.columnIndex];

	return {
		...data,
		projects: data.projects.map(p => {
			if (p.id !== targetProjectId) return p;
			const newColumns = p.columns.filter(c => c.id !== columnId);
			const insertAt = Math.min(targetIndex, newColumns.length);
			newColumns.splice(insertAt, 0, column);
			return { ...p, columns: newColumns };
		}),
	};
}
