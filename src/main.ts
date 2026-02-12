import { Plugin, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { KanbanBoardView, VIEW_TYPE_KANBAN } from "./KanbanBoardView";
import { createEmptyBoardData, serializeBoardData } from "./dataManager";

export default class MultiProjectKanbanPlugin extends Plugin {
	private originalSetViewState: any;

	async onload() {
		this.registerView(VIEW_TYPE_KANBAN, (leaf) => new KanbanBoardView(leaf));

		// Monkey-patch WorkspaceLeaf.setViewState to intercept .md files with kanban-board: true
		this.originalSetViewState = WorkspaceLeaf.prototype.setViewState;
		const plugin = this;

		const patchedSetViewState = async function (this: WorkspaceLeaf, viewState: any, eState?: any) {
			if (viewState.type === "markdown" && viewState.state?.file) {
				const file = plugin.app.vault.getAbstractFileByPath(viewState.state.file);
				if (file instanceof TFile && file.extension === "md") {
					try {
						const content = await plugin.app.vault.read(file);
						if (content.match(/^---\n[\s\S]*?kanban-board:\s*true[\s\S]*?\n---/)) {
							const kanbanState = {
								...viewState,
								type: VIEW_TYPE_KANBAN,
							};
							return plugin.originalSetViewState.call(this, kanbanState, eState);
						}
					} catch {
						// Fall through to default
					}
				}
			}
			return plugin.originalSetViewState.call(this, viewState, eState);
		};

		WorkspaceLeaf.prototype.setViewState = patchedSetViewState;

		// Ribbon icon to create a new kanban board
		this.addRibbonIcon("kanban", "Create new kanban board", async () => {
			await this.createNewBoard();
		});

		// Command to create a new board
		this.addCommand({
			id: "create-new-kanban-board",
			name: "Create new kanban board",
			callback: async () => {
				await this.createNewBoard();
			},
		});
	}

	onunload() {
		// Restore original setViewState
		if (this.originalSetViewState) {
			WorkspaceLeaf.prototype.setViewState = this.originalSetViewState;
		}
	}

	private async createNewBoard() {
		const data = createEmptyBoardData();
		const content = serializeBoardData(data);

		// Find a unique filename
		let filename = "Kanban Board.md";
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(filename)) {
			filename = `Kanban Board ${counter}.md`;
			counter++;
		}

		const file = await this.app.vault.create(filename, content);
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		new Notice("Created new kanban board");
	}
}
