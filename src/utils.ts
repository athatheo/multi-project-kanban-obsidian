import { Project, Column, BoardData } from "./types";

export function generateId(prefix: string): string {
	return `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function findCardLocation(data: BoardData, cardId: string): { project: Project; column: Column; cardIndex: number } | undefined {
	for (const project of data.projects) {
		for (const column of project.columns) {
			const cardIndex = column.cards.findIndex(c => c.id === cardId);
			if (cardIndex !== -1) {
				return { project, column, cardIndex };
			}
		}
	}
	return undefined;
}

export function findColumnLocation(data: BoardData, columnId: string): { project: Project; columnIndex: number } | undefined {
	for (const project of data.projects) {
		const columnIndex = project.columns.findIndex(c => c.id === columnId);
		if (columnIndex !== -1) {
			return { project, columnIndex };
		}
	}
	return undefined;
}
