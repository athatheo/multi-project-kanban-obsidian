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

function moveColumn(data: BoardData, columnId: string, targetProjectId: string, targetIndex: number): BoardData {
	const project = data.projects.find(p => p.id === targetProjectId);
	if (!project) return data;
	const columnIndex = project.columns.findIndex(c => c.id === columnId);
	if (columnIndex === -1) return data;
	const column = project.columns[columnIndex];
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

function clearDropIndicators(): void {
	document.querySelectorAll(".drop-above, .drop-below, .drop-before, .drop-after, .drop-target").forEach(el => {
		el.classList.remove("drop-above", "drop-below", "drop-before", "drop-after", "drop-target");
	});
}

function resetColumnDragState(): void {
	activeColumnDrag = null;
	clearDropIndicators();
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

function setupColumnDropTarget(
	columnEl: HTMLElement, columnIndex: number, projectId: string, columnId: string, callbacks: RenderCallbacks,
) {
	columnEl.addEventListener("dragover", (e: any) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		clearDropIndicators();
		const rect = columnEl.getBoundingClientRect();
		const midX = rect.left + rect.width / 2;
		if (e.clientX < midX) {
			columnEl.classList.add("drop-before");
		} else {
			columnEl.classList.add("drop-after");
		}
	});

	columnEl.addEventListener("dragleave", () => {
		columnEl.classList.remove("drop-before");
		columnEl.classList.remove("drop-after");
	});

	columnEl.addEventListener("drop", (e: any) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		e.stopPropagation();
		clearDropIndicators();
		const payload = activeColumnDrag;
		activeColumnDrag = null;
		if (payload.sourceProjectId !== projectId) return;
		const rect = columnEl.getBoundingClientRect();
		const midX = rect.left + rect.width / 2;
		let targetIndex = e.clientX < midX ? columnIndex : columnIndex + 1;
		const data = callbacks.getData();
		const project = data.projects.find(p => p.id === projectId);
		if (project) {
			const sourceIndex = project.columns.findIndex(c => c.id === payload.columnId);
			if (sourceIndex !== -1 && sourceIndex < targetIndex) {
				targetIndex--;
			}
		}
		const newData = moveColumn(data, payload.columnId, projectId, targetIndex);
		callbacks.onDataChanged(newData);
	});
}

function setupColumnsContainerDrop(
	columnsEl: HTMLElement, projectId: string, callbacks: RenderCallbacks,
) {
	columnsEl.addEventListener("dragover", (e: any) => {
		if (!activeColumnDrag) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	}, true);

	columnsEl.addEventListener("drop", (e: any) => {
		if (!activeColumnDrag) return;
		if (e.defaultPrevented) return;
		e.preventDefault();
		e.stopPropagation();
		clearDropIndicators();
		const payload = activeColumnDrag;
		activeColumnDrag = null;
		if (payload.sourceProjectId !== projectId) return;
		const data = callbacks.getData();
		const project = data.projects.find(p => p.id === projectId);
		const targetIndex = project ? project.columns.length : 0;
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
const COL_GAP = 12;

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

		const left = i * (COL_WIDTH + COL_GAP);
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

function setupDropTargets(container: HTMLElement, columns: HTMLElement[], columnNames: string[], projectId: string, callbacks: RenderCallbacks) {
	for (let i = 0; i < columns.length; i++) {
		if (columnNames[i] !== "Done") {
			setupColumnDropTarget(columns[i], i, projectId, columnNames[i].toLowerCase(), callbacks);
		}
	}
	setupColumnsContainerDrop(container, projectId, callbacks);
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

console.log("\n=== DOM Test: Dragover adds drop indicator class ===");
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
	setupDropTargets(container, columns, ["A", "B", "Done"], "p1", callbacks);

	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
	// Dragover on column B — clientX=300 is past B's midpoint at 387? No, B starts at 262, mid=387.
	// clientX=300 < midX=387 → drop-before
	columns[1].dispatchEvent(createDragEvent("dragover", { clientX: 300 }));
	assert(columns[1].classList.contains("drop-before") || columns[1].classList.contains("drop-after"),
		"Drop indicator class added during dragover");
	assert(container.querySelectorAll(".kanban-column-placeholder").length === 0,
		"No placeholder elements created (CSS-only indicators)");
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
	setupDropTargets(container, columns, ["A", "B", "C", "Done"], "p1", callbacks);

	// Drag column C (index 2)
	const dt = makeDataTransfer();
	grips[2].dispatchEvent(createDragEvent("dragstart", { dataTransfer: dt }));
	assert(isColumnDragActive(), "Column drag active");

	// Drop on column A, left half (clientX=10, A starts at 0, midX=125)
	// 10 < 125 → drop-before → targetIndex = 0
	columns[0].dispatchEvent(createDragEvent("drop", { clientX: 10, dataTransfer: dt }));
	assert(dataChangedCalled, "onDataChanged called");
	assertArrayEqual(getColumnNames(boardData, "p1"), ["C", "A", "B", "Done"], "Column C moved to front");
	assert(!isColumnDragActive(), "activeColumnDrag reset after drop");
	cleanup();
}

console.log("\n=== DOM Test: Drop on right half places after column ===");
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
	const { container, columns, grips } = buildColumnsDOM(["A", "B", "C", "Done"], "p1");
	setupDropTargets(container, columns, ["A", "B", "C", "Done"], "p1", callbacks);

	// Drag A, drop on right half of B (B starts at 262, midX=387, clientX=400 > 387 → drop-after → targetIndex = 2)
	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
	columns[1].dispatchEvent(createDragEvent("drop", { clientX: 400, dataTransfer: makeDataTransfer() }));
	assertArrayEqual(getColumnNames(boardData, "p1"), ["B", "A", "C", "Done"], "A placed after B");
	cleanup();
}

console.log("\n=== DOM Test: Drop indicators removed after drop ===");
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
	setupDropTargets(container, columns, ["A", "B", "Done"], "p1", callbacks);

	grips[0].dispatchEvent(createDragEvent("dragstart", { dataTransfer: makeDataTransfer() }));
	columns[1].dispatchEvent(createDragEvent("dragover", { clientX: 300 }));
	const hasIndicator = columns[1].classList.contains("drop-before") || columns[1].classList.contains("drop-after");
	assert(hasIndicator, "Indicator exists during drag");
	columns[1].dispatchEvent(createDragEvent("drop", { clientX: 300, dataTransfer: makeDataTransfer() }));
	const hasIndicatorAfter = columns[1].classList.contains("drop-before") || columns[1].classList.contains("drop-after");
	assert(!hasIndicatorAfter, "Indicator removed after drop");
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
	setupDropTargets(c2, cols2, ["B", "Done"], "p2", callbacks);

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

	// Cycle 1: Move C to front (drop on left half of A → targetIndex = 0)
	{
		cleanup();
		const { container, columns, grips } = buildColumnsDOM(["A", "B", "C", "Done"], "p1");
		setupDropTargets(container, columns, ["A", "B", "C", "Done"], "p1", callbacks);
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
		setupDropTargets(container, columns, ["C", "A", "B", "Done"], "p1", callbacks);
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
