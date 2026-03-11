import { RenderCallbacks } from "./types";
import { moveCard, moveColumn } from "./dataManager";

const COLUMN_MIME = "application/kanban-column";
const CARD_MIME = "application/kanban-card";

let activeColumnDrag: { columnId: string; sourceProjectId: string } | null = null;

export function isColumnDragActive(): boolean {
	return activeColumnDrag !== null;
}

export function clearDropIndicators(): void {
	document.querySelectorAll(".drop-above, .drop-below, .drop-before, .drop-after, .drop-target").forEach(el => {
		el.removeClass("drop-above");
		el.removeClass("drop-below");
		el.removeClass("drop-before");
		el.removeClass("drop-after");
		el.removeClass("drop-target");
	});
}

export function resetColumnDragState(): void {
	activeColumnDrag = null;
	clearDropIndicators();
	document.querySelectorAll(".dragging-column").forEach(el => el.removeClass("dragging-column"));
}

export function setupCardDrag(
	cardEl: HTMLElement,
	cardId: string,
	projectId: string,
	columnId: string,
) {
	cardEl.draggable = true;

	cardEl.addEventListener("dragstart", (e) => {
		if (isColumnDragActive()) {
			e.preventDefault();
			return;
		}
		if (!e.dataTransfer) return;
		e.dataTransfer.setData(CARD_MIME, JSON.stringify({
			cardId,
			sourceProjectId: projectId,
			sourceColumnId: columnId,
		}));
		e.dataTransfer.effectAllowed = "move";
		cardEl.addClass("dragging");
	});

	cardEl.addEventListener("dragend", () => {
		cardEl.removeClass("dragging");
		clearDropIndicators();
	});
}

export function setupColumnDrag(
	gripEl: HTMLElement,
	columnEl: HTMLElement,
	projectId: string,
	columnId: string,
) {
	gripEl.draggable = true;

	gripEl.addEventListener("dragstart", (e) => {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData(COLUMN_MIME, columnId);
		e.dataTransfer.effectAllowed = "move";
		activeColumnDrag = { columnId, sourceProjectId: projectId };
		requestAnimationFrame(() => {
			columnEl.addClass("dragging-column");
		});
	});

	gripEl.addEventListener("dragend", () => {
		resetColumnDragState();
	});
}

export function setupCardDropTarget(
	cardEl: HTMLElement,
	cardIndex: number,
	columnId: string,
	projectId: string,
	callbacks: RenderCallbacks,
) {
	cardEl.addEventListener("dragover", (e) => {
		if (isColumnDragActive()) return;
		if (!e.dataTransfer?.types.includes(CARD_MIME)) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "move";

		clearDropIndicators();
		const rect = cardEl.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		if (e.clientY < midY) {
			cardEl.addClass("drop-above");
		} else {
			cardEl.addClass("drop-below");
		}
	});

	cardEl.addEventListener("dragleave", () => {
		cardEl.removeClass("drop-above");
		cardEl.removeClass("drop-below");
	});

	cardEl.addEventListener("drop", (e) => {
		if (isColumnDragActive()) return;
		if (!e.dataTransfer?.types.includes(CARD_MIME)) return;
		e.preventDefault();
		e.stopPropagation();
		clearDropIndicators();

		const cardData = e.dataTransfer.getData(CARD_MIME);
		if (!cardData) return;

		try {
			const payload = JSON.parse(cardData);
			const rect = cardEl.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			let targetIndex = e.clientY < midY ? cardIndex : cardIndex + 1;

			// Same-column adjustment: moveCard removes first, then inserts
			if (payload.sourceColumnId === columnId && payload.sourceProjectId === projectId) {
				const data = callbacks.getData();
				const project = data.projects.find(p => p.id === projectId);
				const column = project?.columns.find(c => c.id === columnId);
				if (column) {
					const sourceIndex = column.cards.findIndex(c => c.id === payload.cardId);
					if (sourceIndex !== -1 && sourceIndex < targetIndex) {
						targetIndex--;
					}
				}
			}

			const data = callbacks.getData();
			const newData = moveCard(data, payload.cardId, projectId, columnId, targetIndex);
			callbacks.onDataChanged(newData);
		} catch (err) {
			console.error("[kanban-drop] error:", err);
		}
	});
}

export function setupContainerDrop(
	cardsEl: HTMLElement,
	columnId: string,
	projectId: string,
	callbacks: RenderCallbacks,
) {
	cardsEl.addEventListener("dragover", (e) => {
		if (isColumnDragActive()) return;
		if (!e.dataTransfer?.types.includes(CARD_MIME)) return;
		// Only activate if the drop target is the container itself (not a card)
		if (e.target !== cardsEl) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";

		clearDropIndicators();
		cardsEl.addClass("drop-target");
	});

	cardsEl.addEventListener("dragleave", (e) => {
		if (e.target === cardsEl) {
			cardsEl.removeClass("drop-target");
		}
	});

	cardsEl.addEventListener("drop", (e) => {
		if (isColumnDragActive()) return;
		if (!e.dataTransfer?.types.includes(CARD_MIME)) return;
		// Only handle if not already handled by a card drop target
		if (e.defaultPrevented) return;
		e.preventDefault();
		e.stopPropagation();
		clearDropIndicators();

		const cardData = e.dataTransfer.getData(CARD_MIME);
		if (!cardData) return;

		try {
			const payload = JSON.parse(cardData);
			const data = callbacks.getData();
			const project = data.projects.find(p => p.id === projectId);
			const column = project?.columns.find(c => c.id === columnId);
			const targetIndex = column ? column.cards.length : 0;

			const newData = moveCard(data, payload.cardId, projectId, columnId, targetIndex);
			callbacks.onDataChanged(newData);
		} catch (err) {
			console.error("[kanban-drop] error:", err);
		}
	});
}

export function setupColumnDropTarget(
	columnEl: HTMLElement,
	columnIndex: number,
	projectId: string,
	columnId: string,
	callbacks: RenderCallbacks,
) {
	columnEl.addEventListener("dragover", (e) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

		clearDropIndicators();
		const rect = columnEl.getBoundingClientRect();
		const midX = rect.left + rect.width / 2;
		if (e.clientX < midX) {
			columnEl.addClass("drop-before");
		} else {
			columnEl.addClass("drop-after");
		}
	});

	columnEl.addEventListener("dragleave", () => {
		columnEl.removeClass("drop-before");
		columnEl.removeClass("drop-after");
	});

	columnEl.addEventListener("drop", (e) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		e.stopPropagation();
		clearDropIndicators();

		const payload = activeColumnDrag;
		activeColumnDrag = null;

		if (payload.sourceProjectId !== projectId) return;

		const rect = columnEl.getBoundingClientRect();
		const midX = rect.left + rect.width / 2;
		const targetIndex = e.clientX < midX ? columnIndex : columnIndex + 1;

		const data = callbacks.getData();
		const newData = moveColumn(data, payload.columnId, projectId, targetIndex);
		callbacks.onDataChanged(newData);
	});
}

export function setupColumnsContainerDrop(
	columnsEl: HTMLElement,
	projectId: string,
	callbacks: RenderCallbacks,
) {
	// Capture phase: allow column drop
	columnsEl.addEventListener("dragover", (e) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	}, true);

	// Fallback: drop on empty area after all columns
	columnsEl.addEventListener("drop", (e) => {
		if (!activeColumnDrag) return;
		if (e.defaultPrevented) return;
		e.preventDefault();
		e.stopPropagation();
		clearDropIndicators();

		const payload = activeColumnDrag;
		activeColumnDrag = null;

		if (payload.sourceProjectId !== projectId) return;

		// Place at end
		const data = callbacks.getData();
		const project = data.projects.find(p => p.id === projectId);
		const targetIndex = project ? project.columns.length : 0;
		const newData = moveColumn(data, payload.columnId, projectId, targetIndex);
		callbacks.onDataChanged(newData);
	});
}
