import { JSDOM } from "jsdom";
import { BoardData, RenderCallbacks } from "../src/types";

function findCardLocation(data: BoardData, cardId: string) {
	for (const project of data.projects) {
		for (const column of project.columns) {
			const cardIndex = column.cards.findIndex(c => c.id === cardId);
			if (cardIndex !== -1) return { project, column, cardIndex };
		}
	}
	return undefined;
}

function moveCard(data: BoardData, cardId: string, targetProjectId: string, targetColumnId: string, targetIndex: number): BoardData {
	const location = findCardLocation(data, cardId);
	if (!location) return data;
	const card = location.column.cards[location.cardIndex];
	let newData: BoardData = {
		...data,
		projects: data.projects.map(p => ({
			...p,
			columns: p.columns.map(c => ({
				...c,
				cards: c.cards.filter(cd => cd.id !== cardId),
			})),
		})),
	};
	newData = {
		...newData,
		projects: newData.projects.map(p =>
			p.id === targetProjectId
				? {
					...p,
					columns: p.columns.map(c => {
						if (c.id !== targetColumnId) return c;
						const newCards = [...c.cards];
						const insertAt = Math.min(targetIndex, newCards.length);
						newCards.splice(insertAt, 0, card);
						return { ...c, cards: newCards };
					}),
				}
				: p
		),
	};
	return newData;
}

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

declare global {
	interface HTMLElement {
		addClass(cls: string): void;
		removeClass(cls: string): void;
	}
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

function getCardTitles(data: BoardData, projectId: string, columnId: string): string[] {
	const p = data.projects.find(pr => pr.id === projectId);
	if (!p) return [];
	const c = p.columns.find(col => col.id === columnId);
	return c ? c.cards.map(card => card.title) : [];
}

const CARD_HEIGHT = 50;
const CARD_GAP = 8;

function buildCardsDOM(cardIds: string[], dragCardId: string | null): {
	container: HTMLElement;
	cards: HTMLElement[];
} {
	const container = document.createElement("div");
	container.className = "kanban-cards";
	document.body.appendChild(container);
	const cards: HTMLElement[] = [];

	for (let i = 0; i < cardIds.length; i++) {
		const card = document.createElement("div");
		card.className = "kanban-card";
		card.setAttribute("data-card-id", cardIds[i]);
		if (cardIds[i] === dragCardId) {
			card.classList.add("dragging");
		}
		const top = i * (CARD_HEIGHT + CARD_GAP);
		(card as any).getBoundingClientRect = () => ({
			left: 0, top, width: 200, height: CARD_HEIGHT,
			right: 200, bottom: top + CARD_HEIGHT,
			x: 0, y: top, toJSON() {},
		});
		container.appendChild(card);
		cards.push(card);
	}
	return { container, cards };
}

/**
 * Replicates the exact logic from renderer.ts setupCardDropZone drop handler
 * (after the fix: using :not(.dragging))
 */
function simulateCardDrop(
	cardsEl: HTMLElement,
	dropY: number,
): number {
	const afterElement = getDragAfterElement(cardsEl, dropY);
	let targetIndex: number;
	if (afterElement) {
		const cards = Array.from(cardsEl.querySelectorAll(".kanban-card:not(.dragging)"));
		targetIndex = cards.indexOf(afterElement);
	} else {
		targetIndex = cardsEl.querySelectorAll(".kanban-card:not(.dragging)").length;
	}
	return targetIndex;
}

/**
 * The BROKEN version (before fix) — uses .kanban-card without :not(.dragging)
 */
function simulateCardDropBroken(
	cardsEl: HTMLElement,
	dropY: number,
): number {
	const afterElement = getDragAfterElement(cardsEl, dropY);
	let targetIndex: number;
	if (afterElement) {
		const cards = Array.from(cardsEl.querySelectorAll(".kanban-card"));
		targetIndex = cards.indexOf(afterElement);
	} else {
		targetIndex = cardsEl.querySelectorAll(".kanban-card").length;
	}
	return targetIndex;
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

function cleanup() {
	document.body.innerHTML = "";
}

// =====================================================================
// Test Suite: Card drag index calculation (the actual bug)
// =====================================================================

console.log("\n=== CARD DRAG: Forward drag within same column [A*, B, C] drag A between B and C ===");
{
	cleanup();
	// Cards: A(top=0), B(top=58), C(top=116). Dragging A.
	// Drop between B and C: y = 100 (after B's mid=83, before C's mid=141)
	// getDragAfterElement considers [B,C] (not A). B: 100-58-25=17>0 skip. C: 100-116-25=-41<0 → C.
	const { container } = buildCardsDOM(["a", "b", "c"], "a");
	const fixedIndex = simulateCardDrop(container, 100);
	const brokenIndex = simulateCardDropBroken(container, 100);

	// After removing A → [B, C], insert at fixedIndex
	let data = makeBoardWithCards(["a", "b", "c"]);
	const fixedResult = moveCard(data, "a", "p1", "col1", fixedIndex);
	const brokenResult = moveCard(data, "a", "p1", "col1", brokenIndex);

	assertArrayEqual(
		getCardTitles(fixedResult, "p1", "col1"),
		["B", "A", "C"],
		`FIXED: A moved between B and C (index=${fixedIndex})`
	);
	console.log(`  INFO: Broken version would give index=${brokenIndex} → [${getCardTitles(brokenResult, "p1", "col1").join(", ")}]`);
	assert(brokenIndex !== fixedIndex, "BROKEN index differs from FIXED index (proves bug existed)");
}

console.log("\n=== CARD DRAG: Forward drag [A*, B, C, D] drag A after C ===");
{
	cleanup();
	// Cards: A(0), B(58), C(116), D(174). Dragging A.
	// Drop after C, before D: y = 150 (after C's mid=141, before D's mid=199)
	const { container } = buildCardsDOM(["a", "b", "c", "d"], "a");
	const fixedIndex = simulateCardDrop(container, 150);
	let data = makeBoardWithCards(["a", "b", "c", "d"]);
	const result = moveCard(data, "a", "p1", "col1", fixedIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["B", "C", "A", "D"],
		`A moved after C (index=${fixedIndex})`
	);
}

console.log("\n=== CARD DRAG: Forward drag [A, B*, C] drag B after C (to end) ===");
{
	cleanup();
	// Cards: A(0), B(58), C(116). Dragging B.
	// Drop after C: y = 200 (past C's mid=141)
	// getDragAfterElement considers [A,C]. A: 200-0-25=175>0 skip. C: 200-116-25=59>0 skip. → null.
	const { container } = buildCardsDOM(["a", "b", "c"], "b");
	const fixedIndex = simulateCardDrop(container, 200);
	let data = makeBoardWithCards(["a", "b", "c"]);
	const result = moveCard(data, "b", "p1", "col1", fixedIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["A", "C", "B"],
		`B moved to end (index=${fixedIndex})`
	);
}

console.log("\n=== CARD DRAG: Backward drag [A, B, C*] drag C before A ===");
{
	cleanup();
	// Cards: A(0), B(58), C(116). Dragging C.
	// Drop before A: y = 10 (before A's mid=25)
	// getDragAfterElement considers [A,B]. A: 10-0-25=-15<0 → A. B: 10-58-25=-73<0 but -15>-73, keep A.
	const { container } = buildCardsDOM(["a", "b", "c"], "c");
	const fixedIndex = simulateCardDrop(container, 10);
	let data = makeBoardWithCards(["a", "b", "c"]);
	const result = moveCard(data, "c", "p1", "col1", fixedIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["C", "A", "B"],
		`C moved to front (index=${fixedIndex})`
	);
}

console.log("\n=== CARD DRAG: Backward drag [A, B, C*] drag C between A and B ===");
{
	cleanup();
	// Cards: A(0), B(58), C(116). Dragging C.
	// Drop between A and B: y = 40 (after A's mid=25, before B's mid=83)
	const { container } = buildCardsDOM(["a", "b", "c"], "c");
	const fixedIndex = simulateCardDrop(container, 40);
	let data = makeBoardWithCards(["a", "b", "c"]);
	const result = moveCard(data, "c", "p1", "col1", fixedIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["A", "C", "B"],
		`C moved between A and B (index=${fixedIndex})`
	);
}

console.log("\n=== CARD DRAG: Same position [A*, B, C] drag A to stay at front ===");
{
	cleanup();
	// Drop before B: y = 10 (before B's mid)
	const { container } = buildCardsDOM(["a", "b", "c"], "a");
	const fixedIndex = simulateCardDrop(container, 10);
	let data = makeBoardWithCards(["a", "b", "c"]);
	const result = moveCard(data, "a", "p1", "col1", fixedIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["A", "B", "C"],
		`A stays at front (index=${fixedIndex})`
	);
}

console.log("\n=== CARD DRAG: Two cards only [A*, B] drag A after B ===");
{
	cleanup();
	const { container } = buildCardsDOM(["a", "b"], "a");
	const fixedIndex = simulateCardDrop(container, 200);
	let data = makeBoardWithCards(["a", "b"]);
	const result = moveCard(data, "a", "p1", "col1", fixedIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["B", "A"],
		`A moved after B (index=${fixedIndex})`
	);
}

console.log("\n=== CARD DRAG: Middle card forward [A, B*, C, D] drag B after D ===");
{
	cleanup();
	const { container } = buildCardsDOM(["a", "b", "c", "d"], "b");
	const fixedIndex = simulateCardDrop(container, 250);
	let data = makeBoardWithCards(["a", "b", "c", "d"]);
	const result = moveCard(data, "b", "p1", "col1", fixedIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["A", "C", "D", "B"],
		`B moved to end (index=${fixedIndex})`
	);
}

// =====================================================================
// Test: moveCard data function directly (cross-column)
// =====================================================================

console.log("\n=== CARD MOVE: Cross-column A→B ===");
{
	let data: BoardData = {
		"kanban-board": true,
		projects: [{
			id: "p1", name: "P1", color: "#000", collapsed: false,
			columns: [
				{ id: "col1", name: "Todo", cards: [{ id: "c1", title: "Task1" }, { id: "c2", title: "Task2" }] },
				{ id: "col2", name: "Doing", cards: [{ id: "c3", title: "Task3" }] },
				{ id: "done", name: "Done", cards: [] },
			],
		}],
	};
	const result = moveCard(data, "c1", "p1", "col2", 0);
	assertArrayEqual(getCardTitles(result, "p1", "col1"), ["Task2"], "Source column lost card");
	assertArrayEqual(getCardTitles(result, "p1", "col2"), ["Task1", "Task3"], "Target column gained card at index 0");
}

console.log("\n=== CARD MOVE: Cross-column insert at end ===");
{
	let data: BoardData = {
		"kanban-board": true,
		projects: [{
			id: "p1", name: "P1", color: "#000", collapsed: false,
			columns: [
				{ id: "col1", name: "Todo", cards: [{ id: "c1", title: "Task1" }] },
				{ id: "col2", name: "Doing", cards: [{ id: "c2", title: "Task2" }, { id: "c3", title: "Task3" }] },
				{ id: "done", name: "Done", cards: [] },
			],
		}],
	};
	const result = moveCard(data, "c1", "p1", "col2", 2);
	assertArrayEqual(getCardTitles(result, "p1", "col1"), [], "Source column empty");
	assertArrayEqual(getCardTitles(result, "p1", "col2"), ["Task2", "Task3", "Task1"], "Card appended at end");
}

// =====================================================================
// Helpers
// =====================================================================

function makeBoardWithCards(cardIds: string[]): BoardData {
	return {
		"kanban-board": true,
		projects: [{
			id: "p1", name: "P1", color: "#000", collapsed: false,
			columns: [{
				id: "col1", name: "Todo",
				cards: cardIds.map(id => ({ id, title: id.toUpperCase() })),
			}, {
				id: "done", name: "Done", cards: [],
			}],
		}],
	};
}

// --- Summary ---
console.log(`\n${"=".repeat(50)}`);
console.log(`Card Drag Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
} else {
	console.log("All card drag tests passed!");
	process.exit(0);
}
