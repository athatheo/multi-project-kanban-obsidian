import { BoardData, RenderCallbacks, Project, Column, Card } from "./types";
import {
	addProject, removeProject, updateProject,
	addColumn, removeColumn, updateColumn,
	addCard, removeCard, updateCard, moveCard,
} from "./dataManager";
import { setupCardDrag, setupColumnDrag } from "./dragDrop";

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
	chevron.innerHTML = project.collapsed ? "&#9654;" : "&#9660;";
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

		for (const column of project.columns) {
			renderColumn(columnsEl, project, column, callbacks);
		}

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

function renderColumn(columnsEl: HTMLElement, project: Project, column: Column, callbacks: RenderCallbacks) {
	const data = callbacks.getData();
	const columnEl = columnsEl.createDiv({ cls: "kanban-column" });
	columnEl.setAttribute("data-column-id", column.id);
	columnEl.setAttribute("data-project-id", project.id);

	// Column header
	const headerEl = columnEl.createDiv({ cls: "kanban-column-header" });

	// Drag grip for column reordering
	const grip = headerEl.createDiv({ cls: "kanban-column-grip", text: "\u2801" });
	setupColumnDrag(grip, columnEl, project.id, column.id, callbacks);

	// Column name (click to edit)
	const nameEl = headerEl.createDiv({ cls: "kanban-column-name", text: column.name });
	nameEl.addEventListener("click", () => {
		startInlineEdit(nameEl, column.name, (newName) => {
			if (newName.trim() && newName.trim() !== column.name) {
				callbacks.onDataChanged(updateColumn(data, project.id, column.id, { name: newName.trim() }));
			}
		});
	});

	// Column card count
	headerEl.createDiv({ cls: "kanban-column-count", text: `${column.cards.length}` });

	// Delete column button
	const deleteBtn = headerEl.createDiv({ cls: "kanban-column-delete", text: "\u00d7" });
	deleteBtn.setAttribute("aria-label", "Delete column");
	deleteBtn.addEventListener("click", () => {
		callbacks.onDataChanged(removeColumn(data, project.id, column.id));
	});

	// Cards list
	const cardsEl = columnEl.createDiv({ cls: "kanban-cards" });
	cardsEl.setAttribute("data-column-id", column.id);
	cardsEl.setAttribute("data-project-id", project.id);

	for (const card of column.cards) {
		renderCard(cardsEl, project, column, card, callbacks);
	}

	// Setup drop zone for cards
	setupCardDropZone(cardsEl, project.id, column.id, callbacks);

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

function renderCard(cardsEl: HTMLElement, project: Project, column: Column, card: Card, callbacks: RenderCallbacks) {
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

	// Delete card button
	const deleteBtn = cardEl.createDiv({ cls: "kanban-card-delete", text: "\u00d7" });
	deleteBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		callbacks.onDataChanged(removeCard(data, card.id));
	});

	// Setup drag for this card
	setupCardDrag(cardEl, card.id, project.id, column.id, callbacks);
}

function setupCardDropZone(cardsEl: HTMLElement, projectId: string, columnId: string, callbacks: RenderCallbacks) {
	cardsEl.addEventListener("dragover", (e) => {
		e.preventDefault();
		if (!e.dataTransfer?.types.includes("application/kanban-card")) return;
		e.dataTransfer.dropEffect = "move";

		// Remove existing placeholders
		cardsEl.querySelectorAll(".kanban-placeholder").forEach(el => el.remove());

		// Calculate insertion position
		const placeholder = document.createElement("div");
		placeholder.className = "kanban-placeholder";

		const afterElement = getDragAfterElement(cardsEl, e.clientY);
		if (afterElement) {
			cardsEl.insertBefore(placeholder, afterElement);
		} else {
			cardsEl.appendChild(placeholder);
		}
	});

	cardsEl.addEventListener("dragleave", (e) => {
		// Only remove if leaving the cards container
		if (!cardsEl.contains(e.relatedTarget as Node)) {
			cardsEl.querySelectorAll(".kanban-placeholder").forEach(el => el.remove());
		}
	});

	cardsEl.addEventListener("drop", (e) => {
		e.preventDefault();
		cardsEl.querySelectorAll(".kanban-placeholder").forEach(el => el.remove());

		const cardData = e.dataTransfer?.getData("application/kanban-card");
		if (!cardData) return;

		try {
			const payload = JSON.parse(cardData);
			// Calculate drop index
			const afterElement = getDragAfterElement(cardsEl, e.clientY);
			let targetIndex: number;
			if (afterElement) {
				const cards = Array.from(cardsEl.querySelectorAll(".kanban-card"));
				targetIndex = cards.indexOf(afterElement);
			} else {
				targetIndex = cardsEl.querySelectorAll(".kanban-card").length;
			}

			const data = callbacks.getData();
			const newData = moveCard(data, payload.cardId, projectId, columnId, targetIndex);
			callbacks.onDataChanged(newData);
		} catch {
			// Invalid drop data
		}
	});
}

function getDragAfterElement(container: HTMLElement, y: number): Element | null {
	const draggableElements = Array.from(container.querySelectorAll(".kanban-card:not(.dragging)"));

	let closestElement: Element | null = null;
	let closestOffset = Number.NEGATIVE_INFINITY;

	for (const child of draggableElements) {
		const box = child.getBoundingClientRect();
		const offset = y - box.top - box.height / 2;
		if (offset < 0 && offset > closestOffset) {
			closestOffset = offset;
			closestElement = child;
		}
	}

	return closestElement;
}

function startInlineEdit(el: HTMLElement, currentValue: string, onSave: (value: string) => void) {
	const input = document.createElement("input");
	input.type = "text";
	input.value = currentValue;
	input.className = "kanban-inline-input";

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
	const input = document.createElement("input");
	input.type = "text";
	input.placeholder = placeholder;
	input.className = "kanban-inline-input";

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
