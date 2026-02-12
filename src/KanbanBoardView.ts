import { TextFileView, WorkspaceLeaf } from "obsidian";
import { BoardData } from "./types";
import { parseBoardData, serializeBoardData, createEmptyBoardData } from "./dataManager";
import { renderBoard } from "./renderer";

export const VIEW_TYPE_KANBAN = "kanban-board-view";

export class KanbanBoardView extends TextFileView {
	private boardData: BoardData;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.boardData = createEmptyBoardData();
	}

	getViewType(): string {
		return VIEW_TYPE_KANBAN;
	}

	getDisplayText(): string {
		return this.file?.basename ?? "Kanban Board";
	}

	getIcon(): string {
		return "kanban";
	}

	getViewData(): string {
		return serializeBoardData(this.boardData);
	}

	setViewData(data: string, clear: boolean): void {
		const parsed = parseBoardData(data);
		if (parsed) {
			this.boardData = parsed;
		} else {
			this.boardData = createEmptyBoardData();
		}
		this.refresh();
	}

	clear(): void {
		this.boardData = createEmptyBoardData();
	}

	private refresh() {
		const container = this.contentEl;
		container.empty();
		container.addClass("kanban-board-container");

		renderBoard(container, {
			onDataChanged: (newData: BoardData) => {
				this.boardData = newData;
				this.requestSave();
				this.refresh();
			},
			getData: () => this.boardData,
		});
	}
}
