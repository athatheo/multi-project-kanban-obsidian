import { BoardData, Column, Project } from "../src/types";

function isDoneColumn(column: Column): boolean {
	return column.name === "Done";
}

function findColumnLocation(data: BoardData, columnId: string): { project: Project; columnIndex: number } | undefined {
	for (const project of data.projects) {
		const columnIndex = project.columns.findIndex(c => c.id === columnId);
		if (columnIndex !== -1) {
			return { project, columnIndex };
		}
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

function makeBoard(...projectDefs: Array<{ id: string; columns: Array<{ id: string; name: string }> }>): BoardData {
	return {
		"kanban-board": true,
		projects: projectDefs.map(p => ({
			id: p.id,
			name: `Project ${p.id}`,
			color: "#000",
			collapsed: false,
			columns: p.columns.map(c => ({
				id: c.id,
				name: c.name,
				cards: [],
			})),
		})),
	};
}

function getColumnNames(data: BoardData, projectId: string): string[] {
	const project = data.projects.find(p => p.id === projectId);
	return project ? project.columns.map(c => c.name) : [];
}

function getColumnIds(data: BoardData, projectId: string): string[] {
	const project = data.projects.find(p => p.id === projectId);
	return project ? project.columns.map(c => c.id) : [];
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
	if (!condition) {
		console.error(`  FAIL: ${message}`);
		failed++;
	} else {
		console.log(`  PASS: ${message}`);
		passed++;
	}
}

function assertArrayEqual(actual: string[], expected: string[], message: string) {
	const match = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
	if (!match) {
		console.error(`  FAIL: ${message}`);
		console.error(`    expected: [${expected.join(", ")}]`);
		console.error(`    actual:   [${actual.join(", ")}]`);
		failed++;
	} else {
		console.log(`  PASS: ${message}`);
		passed++;
	}
}

// --- Test cases ---

console.log("\n=== Test: Move column B from index 1 to index 0 (swap A and B) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "b", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["B", "A", "C", "Done"], "B moved to front");
}

console.log("\n=== Test: Move column A from index 0 to index 2 (after C, before Done) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "a", "p1", 2);
	assertArrayEqual(getColumnNames(result, "p1"), ["B", "C", "A", "Done"], "A moved to index 2");
}

console.log("\n=== Test: Move column C to beginning (index 0) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "c", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["C", "A", "B", "Done"], "C moved to front");
}

console.log("\n=== Test: Try to move Done column (should be no-op) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "done", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["A", "Done"], "Done column not moved");
}

console.log("\n=== Test: Move column past Done (should clamp before Done) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "a", "p1", 99);
	assertArrayEqual(getColumnNames(result, "p1"), ["B", "A", "Done"], "A clamped before Done");
}

console.log("\n=== Test: Move column to same position (no change) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "a", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["A", "B", "Done"], "A stays at index 0");
}

console.log("\n=== Test: Move non-existent column (should be no-op) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "nonexistent", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["A", "Done"], "No change for missing column");
}

console.log("\n=== Test: Move column to different project (should be no-op) ===");
{
	const board = makeBoard(
		{ id: "p1", columns: [{ id: "a", name: "A" }, { id: "done1", name: "Done" }] },
		{ id: "p2", columns: [{ id: "b", name: "B" }, { id: "done2", name: "Done" }] },
	);
	const result = moveColumn(board, "a", "p2", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["A", "Done"], "P1 unchanged");
	assertArrayEqual(getColumnNames(result, "p2"), ["B", "Done"], "P2 unchanged");
}

console.log("\n=== Test: Single column + Done (move to index 0 is no-op) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "a", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["A", "Done"], "Single column stays in place");
}

console.log("\n=== Test: Move in project without Done column ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
	]});
	const result = moveColumn(board, "a", "p1", 2);
	assertArrayEqual(getColumnNames(result, "p1"), ["B", "C", "A"], "A moved to end (no Done)");
}

console.log("\n=== Test: Move column to very large index without Done ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
	]});
	const result = moveColumn(board, "a", "p1", 999);
	assertArrayEqual(getColumnNames(result, "p1"), ["B", "C", "A"], "A clamped to end (no Done)");
}

console.log("\n=== Test: Move second column to end (before Done) ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "d", name: "D" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "b", "p1", 3);
	assertArrayEqual(getColumnNames(result, "p1"), ["A", "C", "D", "B", "Done"], "B moved to before Done");
}

console.log("\n=== Test: Move last non-Done column to beginning ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "d", name: "D" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "d", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["D", "A", "B", "C", "Done"], "D moved to front");
}

console.log("\n=== Test: Multiple sequential moves ===");
{
	let board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "done", name: "Done" },
	]});
	board = moveColumn(board, "c", "p1", 0);
	assertArrayEqual(getColumnNames(board, "p1"), ["C", "A", "B", "Done"], "After move 1: C to front");
	board = moveColumn(board, "b", "p1", 1);
	assertArrayEqual(getColumnNames(board, "p1"), ["C", "B", "A", "Done"], "After move 2: B to index 1");
	board = moveColumn(board, "a", "p1", 0);
	assertArrayEqual(getColumnNames(board, "p1"), ["A", "C", "B", "Done"], "After move 3: A to front");
}

console.log("\n=== Test: Move preserves cards ===");
{
	const board: BoardData = {
		"kanban-board": true,
		projects: [{
			id: "p1",
			name: "P1",
			color: "#000",
			collapsed: false,
			columns: [
				{ id: "a", name: "A", cards: [{ id: "card1", title: "Task 1" }, { id: "card2", title: "Task 2" }] },
				{ id: "b", name: "B", cards: [{ id: "card3", title: "Task 3" }] },
				{ id: "done", name: "Done", cards: [] },
			],
		}],
	};
	const result = moveColumn(board, "a", "p1", 1);
	const proj = result.projects[0];
	assertArrayEqual(proj.columns.map(c => c.name), ["B", "A", "Done"], "Column order correct");
	assert(proj.columns[1].cards.length === 2, "Moved column preserves card count");
	assert(proj.columns[1].cards[0].title === "Task 1", "Moved column preserves card 1");
	assert(proj.columns[1].cards[1].title === "Task 2", "Moved column preserves card 2");
	assert(proj.columns[0].cards.length === 1, "Other column cards unaffected");
}

console.log("\n=== Test: Move doesn't affect other projects ===");
{
	const board = makeBoard(
		{ id: "p1", columns: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "done1", name: "Done" }] },
		{ id: "p2", columns: [{ id: "x", name: "X" }, { id: "y", name: "Y" }, { id: "done2", name: "Done" }] },
	);
	const result = moveColumn(board, "b", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["B", "A", "Done"], "P1 reordered");
	assertArrayEqual(getColumnNames(result, "p2"), ["X", "Y", "Done"], "P2 unaffected");
}

console.log("\n=== Test: Target index matching DOM behavior (filtered without dragging column) ===");
{
	// Simulates what happens in the drop handler:
	// DOM shows columns [A, C, Done] (B is hidden with dragging-column class)
	// getDragAfterColumn returns C (index 1 in filtered array)
	// moveColumn should place B between A and C
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "done", name: "Done" },
	]});
	// DOM filtered = [A, C, Done] -> afterColumn = C -> targetIndex = 1
	const result = moveColumn(board, "b", "p1", 1);
	assertArrayEqual(getColumnNames(result, "p1"), ["A", "B", "C", "Done"], "B stays between A and C");
}

console.log("\n=== Test: DOM scenario - drag A past C ===");
{
	// Columns: [A, B, C, Done], dragging A
	// DOM filtered = [B, C, Done], cursor is after C -> afterColumn = Done -> targetIndex = 2
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "a", "p1", 2);
	assertArrayEqual(getColumnNames(result, "p1"), ["B", "C", "A", "Done"], "A placed before Done");
}

console.log("\n=== Test: DOM scenario - drag A past all including Done ===");
{
	// Columns: [A, B, C, Done], dragging A
	// DOM filtered = [B, C, Done], cursor is past Done -> afterColumn = null -> targetIndex = 3
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "a", "p1", 3);
	assertArrayEqual(getColumnNames(result, "p1"), ["B", "C", "A", "Done"], "A clamped before Done");
}

console.log("\n=== Test: DOM scenario - drag C before A ===");
{
	// Columns: [A, B, C, Done], dragging C
	// DOM filtered = [A, B, Done], cursor before A -> afterColumn = A -> targetIndex = 0
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "c", name: "C" },
		{ id: "done", name: "Done" },
	]});
	const result = moveColumn(board, "c", "p1", 0);
	assertArrayEqual(getColumnNames(result, "p1"), ["C", "A", "B", "Done"], "C moved to front");
}

console.log("\n=== Test: Immutability - original data not modified ===");
{
	const board = makeBoard({ id: "p1", columns: [
		{ id: "a", name: "A" },
		{ id: "b", name: "B" },
		{ id: "done", name: "Done" },
	]});
	const originalNames = getColumnNames(board, "p1");
	moveColumn(board, "b", "p1", 0);
	assertArrayEqual(getColumnNames(board, "p1"), originalNames, "Original data not mutated");
}

console.log("\n=== Test: findColumnLocation edge cases ===");
{
	const board = makeBoard(
		{ id: "p1", columns: [{ id: "a", name: "A" }] },
		{ id: "p2", columns: [{ id: "b", name: "B" }] },
	);
	const locA = findColumnLocation(board, "a");
	assert(locA !== undefined, "findColumnLocation finds A");
	assert(locA!.project.id === "p1", "A is in project p1");
	assert(locA!.columnIndex === 0, "A is at index 0");

	const locB = findColumnLocation(board, "b");
	assert(locB !== undefined, "findColumnLocation finds B");
	assert(locB!.project.id === "p2", "B is in project p2");
	assert(locB!.columnIndex === 0, "B is at index 0");

	const locNone = findColumnLocation(board, "nonexistent");
	assert(locNone === undefined, "findColumnLocation returns undefined for missing");
}

// --- Summary ---
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
} else {
	console.log("All tests passed!");
	process.exit(0);
}
