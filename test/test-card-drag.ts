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

/**
 * Index-based drop target logic:
 * - Top half of card at cardIndex → targetIndex = cardIndex
 * - Bottom half of card at cardIndex → targetIndex = cardIndex + 1
 * - Same-column adjustment: if sourceIndex < targetIndex, targetIndex--
 */
function computeTargetIndex(
	cardIndex: number,
	topHalf: boolean,
	sourceCardId: string,
	sameColumn: boolean,
	columnCards: { id: string }[],
): number {
	let targetIndex = topHalf ? cardIndex : cardIndex + 1;
	if (sameColumn) {
		const sourceIndex = columnCards.findIndex(c => c.id === sourceCardId);
		if (sourceIndex !== -1 && sourceIndex < targetIndex) {
			targetIndex--;
		}
	}
	return targetIndex;
}

// =====================================================================
// Test Suite: Index-based card drag targeting
// =====================================================================

console.log("\n=== CARD DRAG: Forward drag within same column [A*, B, C] drag A between B and C ===");
{
	// A is at index 0, drop on bottom half of B (index 1)
	// targetIndex = 1 + 1 = 2, sourceIndex(0) < 2 → targetIndex = 1
	let data = makeBoardWithCards(["a", "b", "c"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(1, false, "a", true, cards);
	const result = moveCard(data, "a", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["B", "A", "C"],
		`A moved between B and C (index=${targetIndex})`
	);
}

console.log("\n=== CARD DRAG: Forward drag [A*, B, C, D] drag A after C ===");
{
	// Drop on bottom half of C (index 2)
	// targetIndex = 2 + 1 = 3, sourceIndex(0) < 3 → targetIndex = 2
	let data = makeBoardWithCards(["a", "b", "c", "d"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(2, false, "a", true, cards);
	const result = moveCard(data, "a", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["B", "C", "A", "D"],
		`A moved after C (index=${targetIndex})`
	);
}

console.log("\n=== CARD DRAG: Forward drag [A, B*, C] drag B after C (to end) ===");
{
	// Drop on bottom half of C (index 2)
	// targetIndex = 2 + 1 = 3, sourceIndex(1) < 3 → targetIndex = 2
	let data = makeBoardWithCards(["a", "b", "c"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(2, false, "b", true, cards);
	const result = moveCard(data, "b", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["A", "C", "B"],
		`B moved to end (index=${targetIndex})`
	);
}

console.log("\n=== CARD DRAG: Backward drag [A, B, C*] drag C before A ===");
{
	// Drop on top half of A (index 0)
	// targetIndex = 0, sourceIndex(2) not < 0 → stays 0
	let data = makeBoardWithCards(["a", "b", "c"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(0, true, "c", true, cards);
	const result = moveCard(data, "c", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["C", "A", "B"],
		`C moved to front (index=${targetIndex})`
	);
}

console.log("\n=== CARD DRAG: Backward drag [A, B, C*] drag C between A and B ===");
{
	// Drop on bottom half of A (index 0) or top half of B (index 1)
	// Using top half of B: targetIndex = 1, sourceIndex(2) not < 1 → stays 1
	let data = makeBoardWithCards(["a", "b", "c"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(1, true, "c", true, cards);
	const result = moveCard(data, "c", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["A", "C", "B"],
		`C moved between A and B (index=${targetIndex})`
	);
}

console.log("\n=== CARD DRAG: Same position [A*, B, C] drag A to stay at front ===");
{
	// Drop on top half of A (index 0) — but A is the dragged card, so consider top half of B (index 1)
	// Actually: drop on top half of B (index 1)
	// targetIndex = 1, sourceIndex(0) < 1 → targetIndex = 0
	let data = makeBoardWithCards(["a", "b", "c"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(1, true, "a", true, cards);
	const result = moveCard(data, "a", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["A", "B", "C"],
		`A stays at front (index=${targetIndex})`
	);
}

console.log("\n=== CARD DRAG: Two cards only [A*, B] drag A after B ===");
{
	// Drop on bottom half of B (index 1)
	// targetIndex = 1 + 1 = 2, sourceIndex(0) < 2 → targetIndex = 1
	let data = makeBoardWithCards(["a", "b"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(1, false, "a", true, cards);
	const result = moveCard(data, "a", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["B", "A"],
		`A moved after B (index=${targetIndex})`
	);
}

console.log("\n=== CARD DRAG: Middle card forward [A, B*, C, D] drag B after D ===");
{
	// Drop on bottom half of D (index 3)
	// targetIndex = 3 + 1 = 4, sourceIndex(1) < 4 → targetIndex = 3
	let data = makeBoardWithCards(["a", "b", "c", "d"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(3, false, "b", true, cards);
	const result = moveCard(data, "b", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["A", "C", "D", "B"],
		`B moved to end (index=${targetIndex})`
	);
}

console.log("\n=== CARD DRAG: Same-column no-adjustment when moving backward ===");
{
	// [A, B, C*] drop C on top half of A (index 0)
	// targetIndex = 0, sourceIndex(2) not < 0 → no adjustment → 0
	let data = makeBoardWithCards(["a", "b", "c"]);
	const cards = data.projects[0].columns[0].cards;
	const targetIndex = computeTargetIndex(0, true, "c", true, cards);
	assert(targetIndex === 0, "No adjustment for backward move");
	const result = moveCard(data, "c", "p1", "col1", targetIndex);
	assertArrayEqual(
		getCardTitles(result, "p1", "col1"),
		["C", "A", "B"],
		`C at front (index=${targetIndex})`
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
	// Cross-column: no same-column adjustment
	const targetIndex = computeTargetIndex(0, true, "c1", false, []);
	const result = moveCard(data, "c1", "p1", "col2", targetIndex);
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
	// Drop on bottom half of last card (index 1) in target column → targetIndex = 2
	const targetIndex = computeTargetIndex(1, false, "c1", false, []);
	const result = moveCard(data, "c1", "p1", "col2", targetIndex);
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
