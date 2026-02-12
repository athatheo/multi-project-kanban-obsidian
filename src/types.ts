export interface Card {
	id: string;
	title: string;
}

export interface Column {
	id: string;
	name: string;
	cards: Card[];
}

export interface Project {
	id: string;
	name: string;
	color: string;
	collapsed: boolean;
	columns: Column[];
}

export interface BoardData {
	"kanban-board": true;
	projects: Project[];
}

export interface DragPayload {
	type: "card" | "column";
	cardId?: string;
	columnId?: string;
	sourceProjectId: string;
	sourceColumnId?: string;
}

export interface RenderCallbacks {
	onDataChanged: (data: BoardData) => void;
	getData: () => BoardData;
}
