import { RenderCallbacks } from "./types";
import { moveColumn } from "./dataManager";

const COLUMN_MIME = "application/kanban-column";

let activeColumnDrag: { columnId: string; sourceProjectId: string } | null = null;

export function isColumnDragActive(): boolean {
	return activeColumnDrag !== null;
}

export function resetColumnDragState(): void {
	activeColumnDrag = null;
	document.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());
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
		document.querySelectorAll(".kanban-placeholder").forEach(el => el.remove());
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

export function setupColumnDropZone(
	columnsContainer: HTMLElement,
	projectId: string,
	callbacks: RenderCallbacks
) {
	columnsContainer.addEventListener("dragover", (e) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	}, true);

	columnsContainer.addEventListener("drop", (e) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
	}, true);

	columnsContainer.addEventListener("dragover", (e) => {
		if (!activeColumnDrag) return;
		e.preventDefault();

		columnsContainer.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());

		const afterColumn = getDragAfterColumn(columnsContainer, e.clientX);
		const placeholder = createDiv({ cls: "kanban-column-placeholder" });

		if (afterColumn) {
			columnsContainer.insertBefore(placeholder, afterColumn);
		} else {
			const addColBtn = columnsContainer.querySelector(".kanban-add-column");
			if (addColBtn) {
				columnsContainer.insertBefore(placeholder, addColBtn);
			} else {
				columnsContainer.appendChild(placeholder);
			}
		}
	});

	columnsContainer.addEventListener("dragleave", (e) => {
		if (!activeColumnDrag) return;
		if (!columnsContainer.contains(e.relatedTarget as Node)) {
			columnsContainer.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());
		}
	});

	columnsContainer.addEventListener("drop", (e) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		e.stopPropagation();

		columnsContainer.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());

		const payload = activeColumnDrag;
		activeColumnDrag = null;

		if (payload.sourceProjectId !== projectId) return;

		const afterColumn = getDragAfterColumn(columnsContainer, e.clientX);
		const allColumns = Array.from(
			columnsContainer.querySelectorAll(".kanban-column:not(.dragging-column)")
		);

		let targetIndex: number;
		if (afterColumn) {
			targetIndex = allColumns.indexOf(afterColumn);
		} else {
			targetIndex = allColumns.length;
		}

		const data = callbacks.getData();
		const newData = moveColumn(data, payload.columnId, projectId, targetIndex);
		callbacks.onDataChanged(newData);
	});
}

function getDragAfterColumn(container: HTMLElement, x: number): Element | null {
	const columns = Array.from(
		container.querySelectorAll(".kanban-column:not(.dragging-column)")
	);

	let closest: Element | null = null;
	let closestOffset = Number.POSITIVE_INFINITY;

	for (const col of columns) {
		const box = col.getBoundingClientRect();
		const midX = box.left + box.width / 2;
		const offset = midX - x;
		if (offset > 0 && offset < closestOffset) {
			closestOffset = offset;
			closest = col;
		}
	}

	return closest;
}
