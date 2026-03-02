import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const { document, HTMLElement } = dom.window;

(globalThis as any).document = document;
(globalThis as any).HTMLElement = HTMLElement;
(globalThis as any).createDiv = function(opts?: { cls?: string }) {
	const div = document.createElement("div");
	if (opts?.cls) div.className = opts.cls;
	return div;
};
(globalThis as any).createEl = function(tag: string, opts?: any) {
	return document.createElement(tag);
};

HTMLElement.prototype.addClass = function(cls: string) { this.classList.add(cls); };
HTMLElement.prototype.removeClass = function(cls: string) { this.classList.remove(cls); };
HTMLElement.prototype.createDiv = function(opts?: any) {
	const div = document.createElement("div");
	if (opts?.cls) div.className = opts.cls;
	if (opts?.text) div.textContent = opts.text;
	this.appendChild(div);
	return div;
};
HTMLElement.prototype.createEl = function(tag: string, opts?: any) {
	const el = document.createElement(tag);
	if (opts?.cls) el.className = opts.cls;
	if (opts?.text) el.textContent = opts.text;
	if (opts?.type) el.setAttribute("type", opts.type);
	if (opts?.placeholder) el.setAttribute("placeholder", opts.placeholder);
	this.appendChild(el);
	return el;
};

declare global {
	interface HTMLElement {
		addClass(cls: string): void;
		removeClass(cls: string): void;
		createDiv(opts?: any): HTMLElement;
		createEl(tag: string, opts?: any): HTMLElement;
	}
}

import { BoardData, RenderCallbacks } from "../src/types";

function isDoneColumn(col: { name: string }): boolean {
	return col.name === "Done";
}

function findColumnLocation(data: BoardData, columnId: string) {
	for (const project of data.projects) {
		const columnIndex = project.columns.findIndex(c => c.id === columnId);
		if (columnIndex !== -1) return { project, columnIndex };
	}
	return undefined;
}

function moveColumn(data: BoardData, columnId: string, targetProjectId: string, targetIndex: number): BoardData {
	const location = findColumnLocation(data, columnId);
	if (!location) return data;
	if (location.project.id !== targetProjectId) return data;
	const column = location.project.columns[location.columnIndex];
	if (isDoneColumn(column)) return data;
	return {
		...data,
		projects: data.projects.map(p => {
			if (p.id !== targetProjectId) return p;
			const newColumns = p.columns.filter(c => c.id !== columnId);
			const doneIndex = newColumns.findIndex(c => isDoneColumn(c));
			const maxIndex = doneIndex !== -1 ? doneIndex : newColumns.length;
			const insertAt = Math.min(targetIndex, maxIndex);
			newColumns.splice(insertAt, 0, column);
			return { ...p, columns: newColumns };
		}),
	};
}

const COLUMN_MIME = "application/kanban-column";
let activeColumnDrag: { columnId: string; sourceProjectId: string } | null = null;

function isColumnDragActive(): boolean {
	return activeColumnDrag !== null;
}

function resetColumnDragState(): void {
	activeColumnDrag = null;
	document.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());
	document.querySelectorAll(".dragging-column").forEach(el => el.classList.remove("dragging-column"));
}

function setupColumnDrag(
	gripEl: HTMLElement, columnEl: HTMLElement, projectId: string, columnId: string,
) {
	gripEl.draggable = true;
	gripEl.addEventListener("dragstart", (e: any) => {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData(COLUMN_MIME, columnId);
		e.dataTransfer.effectAllowed = "move";
		activeColumnDrag = { columnId, sourceProjectId: projectId };
		columnEl.classList.add("dragging-column");
	});
	gripEl.addEventListener("dragend", () => {
		resetColumnDragState();
	});
}

function getDragAfterColumn(container: HTMLElement, x: number): Element | null {
	const columns = Array.from(container.querySelectorAll(".kanban-column:not(.dragging-column)"));
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

function setupColumnDropZone(
	columnsContainer: HTMLElement, projectId: string, callbacks: RenderCallbacks,
) {
	columnsContainer.addEventListener("dragover", (e: any) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	}, true);

	columnsContainer.addEventListener("drop", (e: any) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
	}, true);

	columnsContainer.addEventListener("dragover", (e: any) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		columnsContainer.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());
		const afterColumn = getDragAfterColumn(columnsContainer, e.clientX);
		const placeholder = document.createElement("div");
		placeholder.className = "kanban-column-placeholder";
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

	columnsContainer.addEventListener("dragleave", (e: any) => {
		if (!activeColumnDrag) return;
		if (!columnsContainer.contains(e.relatedTarget as Node)) {
			columnsContainer.querySelectorAll(".kanban-column-placeholder").forEach(el => el.remove());
		}
	});

	columnsContainer.addEventListener("drop", (e: any) => {
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

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
	if (!condition) { console.error(`  FAIL: ${message}`); failed++; }
	else { console.log(`  PASS: ${message}`); passed++; }
}

function assertArrayEqual(actual: string[], expected: string[], message: string) {
	const match = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
	if (!match) {
		console.error(`  FAIL: ${message}`);
		console.error(`    expected: [${expected.join(", ")}]`);
		console.error(`    actual:   [${actual.join(", ")}]`);
		failed++;
	} else { console.log(`  PASS: ${message}`); passed++; }
}

function getColumnNames(data: BoardData, projectId: string): string[] {
	const p = data.projects.find(pr => pr.id === projectId);
	return p ? p.columns.map(c => c.name) : [];
}

function makeDataTransfer() {
	const store: Record<string, string> = {};
	return {
		setData(type: string, val: string) { store[type] = val; },
		getData(type: string) { return store[type] || ""; },
		get types() { return Object.keys(store); },
		effectAllowed: "uninitialized" as string,
		dropEffect: "none" as string,
	};
}

function createDragEvent(type: string, opts?: { clientX?: number; dataTransfer?: any }) {
	const ev = new (dom.window as any).Event(type, { bubbles: true, cancelable: true }) as any;
	ev.clientX = opts?.clientX || 0;
	ev.clientY = 0;
	ev.dataTransfer = opts?.dataTransfer || makeDataTransfer();
	return ev;
}

const COL_WIDTH = 250;

function buildColumnsDOM(columnNames: string[], projectId: string): {
	container: HTMLElement;
	columns: HTMLElement[];
	grips: HTMLElement[];
} {
	const container = document.createElement("div");
	container.className = "kanban-columns";
	document.body.appendChild(container);
	const columns: HTMLElement[] = [];
	const grips: HTMLElement[] = [];

	for (let i = 0; i < columnNames.length; i++) {
		const name = columnNames[i];
		const col = document.createElement("div");
		col.className = "kanban-column";
		col.setAttribute("data-column-id", name.toLowerCase());
		col.setAttribute("data-project-id", projectId);

		const left = i * (COL_WIDTH + 12);
		(col as any).getBoundingClientRect = () => ({
			left, top: 0, width: COL_WIDTH, height: 300,
			right: left + COL_WIDTH, bottom: 300,
			x: left, y: 0, toJSON() {},
		});

		const header = document.createElement("div");
		header.className = "kanban-column-header";
		col.appendChild(header);

		if (name !== "Done") {
			const grip = document.createElement("div");
			grip.className = "kanban-column-grip";
			header.appendChild(grip);
			grips.push(grip);
			setupColumnDrag(grip, col, projectId, name.toLowerCase());
		} else {
			grips.push(null as any);
		}

		columns.push(col);
		container.appendChild(col);
	}

	const addBtn = document.createElement("div");
	addBtn.className = "kanban-add-column";
	container.appendChild(addBtn);

	return { container, columns, grips };
}

function cleanup() {
	resetColumnDragState();
	document.body.innerHTML = "";
}

// --- DOM-level tests ---

console.log("\n=== DOM Test: Column drag start sets activeColumnDrag ===");
{
	cleanup();
	const { grips } = buildColumnsDOM(["A", "B", "Done"], "p1");
	const dt = makeDataTransfer();
	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: dt }));
	assert(isColumnDragActive(), "activeColumnDrag set after dragstart");
	assert(dt.getData(COLUMN_MIME) === "a", "dataTransfer has column MIME with columnId");
	cleanup();
}

console.log("\n=== DOM Test: Column drag end resets activeColumnDrag ===");
{
	cleanup();
	const { grips } = buildColumnsDOM(["A", "B", "Done"], "p1");
	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
	assert(isColumnDragActive(), "Active before dragend");
	grips[0].dispatchEvent(createDragEvent("dragend"));
	assert(!isColumnDragActive(), "Reset after dragend");
	cleanup();
}

console.log("\n=== DOM Test: Dragover creates placeholder ===");
{
	cleanup();
	let boardData: BoardData = {
		"kanban-board": true,
		projects: [{
			id: "p1", name: "P1", color: "#000", collapsed: false,
			columns: [
				{ id: "a", name: "A", cards: [] },
				{ id: "b", name: "B", cards: [] },
				{ id: "done", name: "Done", cards: [] },
			],
		}],
	};
	const callbacks: RenderCallbacks = {
		getData: () => boardData,
		onDataChanged: (d) => { boardData = d; },
	};
	const { container, columns, grips } = buildColumnsDOM(["A", "B", "Done"], "p1");
	setupColumnDropZone(container, "p1", callbacks);

	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
	// Dispatch dragover on a child column (not directly on container) for realistic propagation
	columns[1].dispatchEvent(createDragEvent("dragover", { clientX: 100 }));
	const placeholders = container.querySelectorAll(".kanban-column-placeholder");
	assert(placeholders.length === 1, "Placeholder created during dragover");
	cleanup();
}

console.log("\n=== DOM Test: Drop triggers moveColumn and data update ===");
{
	cleanup();
	let boardData: BoardData = {
		"kanban-board": true,
		projects: [{
			id: "p1", name: "P1", color: "#000", collapsed: false,
			columns: [
				{ id: "a", name: "A", cards: [] },
				{ id: "b", name: "B", cards: [] },
				{ id: "c", name: "C", cards: [] },
				{ id: "done", name: "Done", cards: [] },
			],
		}],
	};
	let dataChangedCalled = false;
	const callbacks: RenderCallbacks = {
		getData: () => boardData,
		onDataChanged: (d) => { boardData = d; dataChangedCalled = true; },
	};
	// Columns: A(0-250), B(262-512), C(524-774), Done(786-1036)
	const { container, columns, grips } = buildColumnsDOM(["A", "B", "C", "Done"], "p1");
	setupColumnDropZone(container, "p1", callbacks);

	// Drag column C (index 2)
	const dt = makeDataTransfer();
	grips[2].dispatchEvent(createDragEvent("dragstart", { dataTransfer: dt }));
	assert(isColumnDragActive(), "Column drag active");

	// Drop before column A (clientX=10, which is before A's midpoint at 125)
	// Non-dragging columns: A(midX=125), B(midX=387), Done(midX=911)
	// getDragAfterColumn: offset=125-10=115>0 (A), 387-10=377>0 (B), 911-10=901>0 (Done)
	// closest = A (offset 115) → targetIndex = 0
	columns[0].dispatchEvent(createDragEvent("drop", { clientX: 10, dataTransfer: dt }));
	assert(dataChangedCalled, "onDataChanged called");
	assertArrayEqual(getColumnNames(boardData, "p1"), ["C", "A", "B", "Done"], "Column C moved to front");
	assert(!isColumnDragActive(), "activeColumnDrag reset after drop");
	cleanup();
}

console.log("\n=== DOM Test: Drop with null afterColumn places at end (before Done) ===");
{
	cleanup();
	let boardData: BoardData = {
		"kanban-board": true,
		projects: [{
			id: "p1", name: "P1", color: "#000", collapsed: false,
			columns: [
				{ id: "a", name: "A", cards: [] },
				{ id: "b", name: "B", cards: [] },
				{ id: "done", name: "Done", cards: [] },
			],
		}],
	};
	const callbacks: RenderCallbacks = {
		getData: () => boardData,
		onDataChanged: (d) => { boardData = d; },
	};
	const { container, columns, grips } = buildColumnsDOM(["A", "B", "Done"], "p1");
	setupColumnDropZone(container, "p1", callbacks);

	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
	// In JSDOM, getBoundingClientRect returns all zeros, so clientX=9999 means all columns
	// have midX (0) < clientX (9999), so getDragAfterColumn returns null -> targetIndex = allColumns.length
	columns[1].dispatchEvent(createDragEvent("drop", { clientX: 9999, dataTransfer: makeDataTransfer() }));
	assertArrayEqual(getColumnNames(boardData, "p1"), ["B", "A", "Done"], "A placed before Done via clamping");
	cleanup();
}

console.log("\n=== DOM Test: Placeholder removed after drop ===");
{
	cleanup();
	let boardData: BoardData = {
		"kanban-board": true,
		projects: [{
			id: "p1", name: "P1", color: "#000", collapsed: false,
			columns: [
				{ id: "a", name: "A", cards: [] },
				{ id: "b", name: "B", cards: [] },
				{ id: "done", name: "Done", cards: [] },
			],
		}],
	};
	const callbacks: RenderCallbacks = {
		getData: () => boardData,
		onDataChanged: (d) => { boardData = d; },
	};
	const { container, columns, grips } = buildColumnsDOM(["A", "B", "Done"], "p1");
	setupColumnDropZone(container, "p1", callbacks);

	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
	columns[1].dispatchEvent(createDragEvent("dragover", { clientX: 100 }));
	assert(container.querySelectorAll(".kanban-column-placeholder").length === 1, "Placeholder exists during drag");
	columns[1].dispatchEvent(createDragEvent("drop", { clientX: 100, dataTransfer: makeDataTransfer() }));
	assert(container.querySelectorAll(".kanban-column-placeholder").length === 0, "Placeholder removed after drop");
	cleanup();
}

console.log("\n=== DOM Test: Cross-project drop rejected ===");
{
	cleanup();
	let boardData: BoardData = {
		"kanban-board": true,
		projects: [
			{ id: "p1", name: "P1", color: "#000", collapsed: false,
				columns: [{ id: "a", name: "A", cards: [] }, { id: "done1", name: "Done", cards: [] }] },
			{ id: "p2", name: "P2", color: "#000", collapsed: false,
				columns: [{ id: "b", name: "B", cards: [] }, { id: "done2", name: "Done", cards: [] }] },
		],
	};
	let dataChangedCalled = false;
	const callbacks: RenderCallbacks = {
		getData: () => boardData,
		onDataChanged: (d) => { boardData = d; dataChangedCalled = true; },
	};
	const { container: c2, columns: cols2 } = buildColumnsDOM(["B", "Done"], "p2");
	setupColumnDropZone(c2, "p2", callbacks);

	activeColumnDrag = { columnId: "a", sourceProjectId: "p1" };
	cols2[0].dispatchEvent(createDragEvent("drop", { clientX: 0, dataTransfer: makeDataTransfer() }));
	assert(!dataChangedCalled, "Cross-project drop does not trigger data change");
	cleanup();
}

console.log("\n=== DOM Test: MIME type uses custom type, not text/plain ===");
{
	cleanup();
	const { grips } = buildColumnsDOM(["A", "B", "Done"], "p1");
	const dt = makeDataTransfer();
	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: dt }));
	assert(dt.getData(COLUMN_MIME) === "a", "Custom MIME type set");
	assert(dt.getData("text/plain") === "", "text/plain NOT set");
	cleanup();
}

console.log("\n=== DOM Test: Multiple drag-drop cycles work ===");
{
	cleanup();
	let boardData: BoardData = {
		"kanban-board": true,
		projects: [{
			id: "p1", name: "P1", color: "#000", collapsed: false,
			columns: [
				{ id: "a", name: "A", cards: [] },
				{ id: "b", name: "B", cards: [] },
				{ id: "c", name: "C", cards: [] },
				{ id: "done", name: "Done", cards: [] },
			],
		}],
	};
	const callbacks: RenderCallbacks = {
		getData: () => boardData,
		onDataChanged: (d) => { boardData = d; },
	};

	// Cycle 1: Move C to front (drop at clientX=10, before first column midpoint)
	{
		cleanup();
		const { container, columns, grips } = buildColumnsDOM(["A", "B", "C", "Done"], "p1");
		setupColumnDropZone(container, "p1", callbacks);
		grips[2].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
		columns[0].dispatchEvent(createDragEvent("drop", { clientX: 10, dataTransfer: makeDataTransfer() }));
		grips[2].dispatchEvent(createDragEvent("dragend"));
	}
	assertArrayEqual(getColumnNames(boardData, "p1"), ["C", "A", "B", "Done"], "Cycle 1: C moved to front");
	assert(!isColumnDragActive(), "State clean after cycle 1");

	// Cycle 2: Move B to front (current order: C, A, B, Done)
	{
		document.body.innerHTML = "";
		const { container, columns, grips } = buildColumnsDOM(["C", "A", "B", "Done"], "p1");
		setupColumnDropZone(container, "p1", callbacks);
		grips[2].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
		columns[0].dispatchEvent(createDragEvent("drop", { clientX: 10, dataTransfer: makeDataTransfer() }));
		grips[2].dispatchEvent(createDragEvent("dragend"));
	}
	assertArrayEqual(getColumnNames(boardData, "p1"), ["B", "C", "A", "Done"], "Cycle 2: B moved to front");
	assert(!isColumnDragActive(), "State clean after cycle 2");
	cleanup();
}

console.log("\n=== DOM Test: Dragging column gets dragging-column class ===");
{
	cleanup();
	const { columns, grips } = buildColumnsDOM(["A", "B", "Done"], "p1");
	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
	assert(columns[0].classList.contains("dragging-column"), "Column A has dragging-column class");
	assert(!columns[1].classList.contains("dragging-column"), "Column B does not have dragging-column class");
	grips[0].dispatchEvent(createDragEvent("dragend"));
	assert(!columns[0].classList.contains("dragging-column"), "Column A class removed after dragend");
	cleanup();
}

console.log("\n=== DOM Test: Done column has no grip ===");
{
	cleanup();
	const { grips } = buildColumnsDOM(["A", "B", "Done"], "p1");
	assert(grips[0] !== null, "Column A has grip");
	assert(grips[1] !== null, "Column B has grip");
	assert(grips[2] === null, "Done column has no grip");
	cleanup();
}

// --- Summary ---
console.log(`\n${"=".repeat(50)}`);
console.log(`DOM Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
} else {
	console.log("All DOM tests passed!");
	process.exit(0);
}
