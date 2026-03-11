import { BoardData, RenderCallbacks, Project, Column, Card } from "./types";
import {
	addProject, removeProject, updateProject,
	addColumn, removeColumn, updateColumn,
	addCard, removeCard, updateCard, moveCard,
	isDoneColumn, DONE_COLUMN_NAME,
} from "./dataManager";
import {
	setupCardDrag, setupColumnDrag, isColumnDragActive, resetColumnDragState,
	setupCardDropTarget, setupContainerDrop, setupColumnDropTarget, setupColumnsContainerDrop,
} from "./dragDrop";

export function renderBoard(container: HTMLElement, callbacks: RenderCallbacks) {
	const data = callbacks.getData();

	const boardEl = container.createDiv({ cls: "kanban-board" });

	// Add Project button
	const addProjectBtn = boardEl.createEl("button", {
		cls: "kanban-add-project-btn",
		text: "Add Project",
	});
	addProjectBtn.addEventListener("click", () => {
		startInlineInput(addProjectBtn, "Project name...", (name) => {
			if (name.trim()) {
				callbacks.onDataChanged(addProject(data, name.trim()));
			}
		});
	});

	// Render each project
	for (const project of data.projects) {
		renderProject(boardEl, project, callbacks);
	}
}

function renderProject(boardEl: HTMLElement, project: Project, callbacks: RenderCallbacks) {
	const data = callbacks.getData();
	const projectEl = boardEl.createDiv({ cls: "kanban-project" });
	projectEl.style.borderLeftColor = project.color;
	projectEl.setAttribute("data-project-id", project.id);

	// Project header
	const headerEl = projectEl.createDiv({ cls: "kanban-project-header" });
	headerEl.style.backgroundColor = project.color + "20";

	// Collapse chevron
	const chevron = headerEl.createDiv({ cls: "kanban-chevron" });
	chevron.textContent = project.collapsed ? "\u25B6" : "\u25BC";
	chevron.addEventListener("click", () => {
		callbacks.onDataChanged(updateProject(data, project.id, { collapsed: !project.collapsed }));
	});

	// Project name (click to edit)
	const nameEl = headerEl.createDiv({ cls: "kanban-project-name", text: project.name });
	nameEl.addEventListener("click", () => {
		startInlineEdit(nameEl, project.name, (newName) => {
			if (newName.trim() && newName.trim() !== project.name) {
				callbacks.onDataChanged(updateProject(data, project.id, { name: newName.trim() }));
			}
		});
	});

	// Color picker
	const colorSwatch = headerEl.createDiv({ cls: "kanban-color-swatch" });
	colorSwatch.style.backgroundColor = project.color;
	const colorInput = colorSwatch.createEl("input", { type: "color" });
	colorInput.value = project.color;
	colorInput.addEventListener("input", (e) => {
		const newColor = (e.target as HTMLInputElement).value;
		callbacks.onDataChanged(updateProject(data, project.id, { color: newColor }));
	});

	// Delete project button
	const deleteBtn = headerEl.createDiv({ cls: "kanban-delete-btn", text: "\u00d7" });
	deleteBtn.setAttribute("aria-label", "Delete project");
	deleteBtn.addEventListener("click", () => {
		if (confirm(`Delete project "${project.name}" and all its columns and cards?`)) {
			callbacks.onDataChanged(removeProject(data, project.id));
		}
	});

	// Columns area (hidden if collapsed)
	if (!project.collapsed) {
		const columnsEl = projectEl.createDiv({ cls: "kanban-columns" });

		for (let i = 0; i < project.columns.length; i++) {
			renderColumn(columnsEl, project, project.columns[i], i, callbacks);
		}

		setupColumnsContainerDrop(columnsEl, project.id, callbacks);

		// Add Column button
		const addColBtn = columnsEl.createDiv({ cls: "kanban-add-column" });
		const addColBtnInner = addColBtn.createEl("button", {
			cls: "kanban-add-column-btn",
			text: "+ Add Column",
		});
		addColBtnInner.addEventListener("click", () => {
			startInlineInput(addColBtnInner, "Column name...", (name) => {
				if (name.trim()) {
					callbacks.onDataChanged(addColumn(data, project.id, name.trim()));
				}
			});
		});
	}
}

function renderColumn(columnsEl: HTMLElement, project: Project, column: Column, columnIndex: number, callbacks: RenderCallbacks) {
	const data = callbacks.getData();
	const isDone = isDoneColumn(column);
	const columnEl = columnsEl.createDiv({ cls: "kanban-column" });
	columnEl.setAttribute("data-column-id", column.id);
	columnEl.setAttribute("data-project-id", project.id);

	// Column header
	const headerEl = columnEl.createDiv({ cls: "kanban-column-header" });

	// Drag grip for column reordering (skip for Done column)
	if (!isDone) {
		const grip = headerEl.createDiv({ cls: "kanban-column-grip", text: "\u2801" });
		setupColumnDrag(grip, columnEl, project.id, column.id);
	}

	// Column name (click to edit, except Done column)
	const nameEl = headerEl.createDiv({ cls: "kanban-column-name", text: column.name });
	if (isDone) {
		nameEl.style.cursor = "default";
	} else {
		nameEl.addEventListener("click", () => {
			startInlineEdit(nameEl, column.name, (newName) => {
				if (newName.trim() && newName.trim() !== column.name) {
					callbacks.onDataChanged(updateColumn(data, project.id, column.id, { name: newName.trim() }));
				}
			});
		});
	}

	// Column card count
	headerEl.createDiv({ cls: "kanban-column-count", text: `${column.cards.length}` });

	// Delete column button (skip for Done column)
	if (!isDone) {
		const deleteBtn = headerEl.createDiv({ cls: "kanban-column-delete", text: "\u00d7" });
		deleteBtn.setAttribute("aria-label", "Delete column");
		deleteBtn.addEventListener("click", () => {
			callbacks.onDataChanged(removeColumn(data, project.id, column.id));
		});
	}

	// Cards list
	const cardsEl = columnEl.createDiv({ cls: "kanban-cards" });
	cardsEl.setAttribute("data-column-id", column.id);
	cardsEl.setAttribute("data-project-id", project.id);

	for (let i = 0; i < column.cards.length; i++) {
		renderCard(cardsEl, project, column, column.cards[i], i, callbacks);
	}

	// Setup drop targets
	setupContainerDrop(cardsEl, column.id, project.id, callbacks);
	if (!isDone) {
		setupColumnDropTarget(columnEl, columnIndex, project.id, column.id, callbacks);
	}

	// Add card button
	const addCardBtn = columnEl.createDiv({ cls: "kanban-add-card" });
	const addCardBtnInner = addCardBtn.createEl("button", {
		cls: "kanban-add-card-btn",
		text: "+",
	});
	addCardBtnInner.addEventListener("click", () => {
		startInlineInput(addCardBtnInner, "Card title...", (title) => {
			if (title.trim()) {
				callbacks.onDataChanged(addCard(data, project.id, column.id, title.trim()));
			}
		});
	});
}

function renderCard(cardsEl: HTMLElement, project: Project, column: Column, card: Card, cardIndex: number, callbacks: RenderCallbacks) {
	const data = callbacks.getData();
	const cardEl = cardsEl.createDiv({ cls: "kanban-card" });
	cardEl.setAttribute("data-card-id", card.id);
	cardEl.setAttribute("data-column-id", column.id);
	cardEl.setAttribute("data-project-id", project.id);

	// Card title (click to edit)
	const titleEl = cardEl.createDiv({ cls: "kanban-card-title", text: card.title });
	titleEl.addEventListener("click", (e) => {
		e.stopPropagation();
		startInlineEdit(titleEl, card.title, (newTitle) => {
			if (newTitle.trim() && newTitle.trim() !== card.title) {
				callbacks.onDataChanged(updateCard(data, card.id, { title: newTitle.trim() }));
			}
		});
	});

	// Move to Done button (only for non-Done columns)
	if (!isDoneColumn(column)) {
		const doneBtn = cardEl.createDiv({ cls: "kanban-card-done", text: "\u2713" });
		doneBtn.setAttribute("aria-label", "Move to Done");
		doneBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const doneCol = project.columns.find(c => isDoneColumn(c));
			if (!doneCol) return;
			// Strip any existing [...] prefix, then prepend [ColumnName]
			const stripped = card.title.replace(/^\[.*?\]\s*/, "");
			const newTitle = `[${column.name}] ${stripped}`;
			let newData = updateCard(data, card.id, { title: newTitle });
			newData = moveCard(newData, card.id, project.id, doneCol.id, doneCol.cards.length);
			callbacks.onDataChanged(newData);
		});
	}

	// Delete card button
	const deleteBtn = cardEl.createDiv({ cls: "kanban-card-delete", text: "\u00d7" });
	deleteBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		callbacks.onDataChanged(removeCard(data, card.id));
	});

	// Setup drag and drop for this card
	setupCardDrag(cardEl, card.id, project.id, column.id);
	setupCardDropTarget(cardEl, cardIndex, column.id, project.id, callbacks);
}

function startInlineEdit(el: HTMLElement, currentValue: string, onSave: (value: string) => void) {
	const input = createEl("input", { type: "text", cls: "kanban-inline-input" });
	input.value = currentValue;

	const originalText = el.textContent;
	el.textContent = "";
	el.appendChild(input);
	input.focus();
	input.select();

	const finish = (save: boolean) => {
		const value = input.value;
		el.textContent = save ? value || originalText : originalText;
		if (save) {
			onSave(value);
		}
	};

	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			finish(true);
		} else if (e.key === "Escape") {
			e.preventDefault();
			finish(false);
		}
	});

	input.addEventListener("blur", () => {
		finish(true);
	});
}

function startInlineInput(anchor: HTMLElement, placeholder: string, onSave: (value: string) => void) {
	const input = createEl("input", { type: "text", cls: "kanban-inline-input", placeholder });

	const parent = anchor.parentElement;
	if (!parent) return;

	anchor.style.display = "none";
	parent.insertBefore(input, anchor.nextSibling);
	input.focus();

	const finish = (save: boolean) => {
		const value = input.value;
		input.remove();
		anchor.style.display = "";
		if (save && value.trim()) {
			onSave(value);
		}
	};

	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			finish(true);
		} else if (e.key === "Escape") {
			e.preventDefault();
			finish(false);
		}
	});

	input.addEventListener("blur", () => {
		finish(true);
	});
}
