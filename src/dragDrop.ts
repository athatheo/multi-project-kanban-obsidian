import { RenderCallbacks } from "./types";
import { moveColumn } from "./dataManager";

export function setupCardDrag(
	cardEl: HTMLElement,
	cardId: string,
	projectId: string,
	columnId: string,
	callbacks: RenderCallbacks
) {
	cardEl.draggable = true;

	cardEl.addEventListener("dragstart", (e) => {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData("application/kanban-card", JSON.stringify({
			cardId,
			sourceProjectId: projectId,
			sourceColumnId: columnId,
		}));
		e.dataTransfer.effectAllowed = "move";
		cardEl.addClass("dragging");
	});

	cardEl.addEventListener("dragend", () => {
		cardEl.removeClass("dragging");
		// Clean up any remaining placeholders
		document.querySelectorAll(".kanban-placeholder").forEach(el => el.remove());
	});
}

export function setupColumnDrag(
	gripEl: HTMLElement,
	columnEl: HTMLElement,
	projectId: string,
	columnId: string,
	callbacks: RenderCallbacks
) {
	gripEl.draggable = true;

	gripEl.addEventListener("dragstart", (e) => {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData("application/kanban-column", JSON.stringify({
			columnId,
			sourceProjectId: projectId,
		}));
		e.dataTransfer.effectAllowed = "move";
		columnEl.addClass("dragging-column");
		// Needed so the column element is the drag image
		e.dataTransfer.setDragImage(columnEl, 20, 20);
	});

	gripEl.addEventListener("dragend", () => {
		columnEl.removeClass("dragging-column");
		document.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());
	});

	// Column drop zone — the column itself is a drop target for reordering
	const columnsContainer = columnEl.parentElement;
	if (!columnsContainer) return;

	columnEl.addEventListener("dragover", (e) => {
		if (!e.dataTransfer?.types.includes("application/kanban-column")) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";

		// Show column placeholder
		columnsContainer.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());

		const placeholder = createDiv({ cls: "kanban-column-placeholder" });

		const box = columnEl.getBoundingClientRect();
		const midX = box.left + box.width / 2;

		if (e.clientX < midX) {
			columnsContainer.insertBefore(placeholder, columnEl);
		} else {
			columnsContainer.insertBefore(placeholder, columnEl.nextSibling);
		}
	});

	columnEl.addEventListener("drop", (e) => {
		if (!e.dataTransfer?.types.includes("application/kanban-column")) return;
		e.preventDefault();

		columnsContainer.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());

		const colData = e.dataTransfer.getData("application/kanban-column");
		if (!colData) return;

		try {
			const payload = JSON.parse(colData);
			if (payload.sourceProjectId !== projectId) return; // Only within same project

			// Calculate target index
			const columns = Array.from(columnsContainer.querySelectorAll(".kanban-column:not(.dragging-column)"));
			const box = columnEl.getBoundingClientRect();
			const midX = box.left + box.width / 2;
			let targetIndex = columns.indexOf(columnEl);
			if (e.clientX >= midX) {
				targetIndex++;
			}

			const data = callbacks.getData();
			const newData = moveColumn(data, payload.columnId, projectId, targetIndex);
			callbacks.onDataChanged(newData);
		} catch {
			// Invalid drop data
		}
	});
}
