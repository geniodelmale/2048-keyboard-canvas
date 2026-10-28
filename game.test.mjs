import test from "node:test";
import assert from "node:assert/strict";
import { mergeLine, slide, newGame, move, undo, isGameOver, validateSave, viewState, DIRECTIONS } from "./game.mjs";

const stateWith = board => ({ version: 1, board, score: 0, best: 0, moves: 0, previous: null });
const zero = () => 0;

test("merges pairs only once and skips empty cells", () => {
    assert.deepEqual(mergeLine([2, 2, 2, 2]), { line: [4, 4, 0, 0], score: 8 });
    assert.deepEqual(mergeLine([2, 2, 4, 0]), { line: [4, 4, 0, 0], score: 4 });
    assert.deepEqual(mergeLine([2, 0, 2, 2]), { line: [4, 2, 0, 0], score: 4 });
    assert.deepEqual(mergeLine([0, 0, 0, 0]), { line: [0, 0, 0, 0], score: 0 });
});

test("all four directions use the correct merge order", () => {
    const board = [2, 2, 4, 4, ...Array(12).fill(0)];
    assert.deepEqual(slide(board, "left").board.slice(0, 4), [4, 8, 0, 0]);
    assert.deepEqual(slide(board, "right").board.slice(0, 4), [0, 0, 4, 8]);
    const vertical = [2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0];
    assert.deepEqual(slide(vertical, "up").board.filter((_, i) => i % 4 === 0), [4, 8, 0, 0]);
    assert.deepEqual(slide(vertical, "down").board.filter((_, i) => i % 4 === 0), [0, 0, 4, 8]);
    assert.throws(() => slide(board, "diagonal"), /Invalid direction/);
});

test("slides preserve mass and do not mutate their inputs", () => {
    let seed = 41;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let sample = 0; sample < 200; sample++) {
        const board = Array.from({ length: 16 }, () => [0, 2, 4, 8, 16][Math.floor(random() * 5)]);
        const original = [...board];
        for (const direction of DIRECTIONS) {
            const result = slide(board, direction);
            assert.equal(result.board.reduce((a, b) => a + b), board.reduce((a, b) => a + b));
            assert.deepEqual(board, original);
            assert.equal(result.changed, result.board.some((value, i) => value !== board[i]));
        }
    }
});

test("new game spawns exactly two tiles, with both spawn values supported", () => {
    const game = newGame(100, zero);
    assert.equal(game.board.filter(Boolean).length, 2);
    assert.equal(game.board.reduce((a, b) => a + b), 4);
    assert.equal(game.best, 100);
    assert.equal(game.previous, null);
    assert.deepEqual(newGame(0, () => .99).board.filter(Boolean), [4, 4]);
});

test("Undo removes the spawned tile and restores board, score and moves exactly", () => {
    const original = { ...stateWith([2, 2, ...Array(14).fill(0)]), score: 12, best: 12, moves: 3 };
    const next = move(original, "left", zero);
    assert.equal(next.score, 16);
    assert.equal(next.moves, 4);
    assert.equal(next.board.reduce((a, b) => a + b), 6);
    const restored = undo(next);
    assert.deepEqual(restored.board, original.board);
    assert.equal(restored.score, original.score);
    assert.equal(restored.moves, original.moves);
    assert.equal(restored.best, 16);
    assert.equal(restored.previous, null);
    assert.equal(undo(restored), restored);
    assert.deepEqual(original.board, [2, 2, ...Array(14).fill(0)]);
});

test("a no-op move neither spawns nor consumes Undo", () => {
    const state = stateWith([2, ...Array(15).fill(0)]);
    const next = move(state, "right", zero);
    const noOp = move(next, "up", () => { throw new Error("Must not spawn"); });
    assert.equal(noOp, next);
    assert.deepEqual(undo(noOp).board, state.board);
});

test("only the last valid move can be undone", () => {
    const first = move(newGame(0, zero), "right", zero);
    const second = move(first, "down", zero);
    const restored = undo(second);
    assert.deepEqual(restored.board, first.board);
    assert.equal(restored.score, first.score);
    assert.equal(restored.previous, null);
    assert.equal(undo(restored), restored);
});

test("full board may still merge and terminal board allows Undo", () => {
    const lost = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
    assert.equal(isGameOver(lost), true);
    const mergeable = [...lost];
    mergeable[0] = 4;
    assert.equal(isGameOver(mergeable), false);
    const playable = [...lost];
    playable[0] = 0;
    assert.equal(isGameOver(playable), false);
    const last = move(stateWith(playable), "left", zero);
    assert.equal(last.previous !== null, true);
    assert.deepEqual(undo(last).board, playable);
    const beforeLoss = [4, 2, 4, 0, ...lost.slice(4)];
    const terminal = move(stateWith(beforeLoss), "right", zero);
    assert.equal(isGameOver(terminal.board), true);
    assert.deepEqual(undo(terminal).board, beforeLoss);
});

test("2048 is a win, not a blocking game-over condition", () => {
    const result = move(stateWith([1024, 1024, ...Array(14).fill(0)]), "left", zero);
    assert.equal(viewState(result).won, true);
    assert.equal(viewState(result).gameOver, false);
    assert.equal(viewState(result).canUndo, true);
    assert.equal(viewState(undo(result)).won, false);
});

test("saved state including Undo round-trips and malformed saves are rejected", () => {
    const state = move(newGame(0, zero), "right", zero);
    assert.deepEqual(validateSave(JSON.parse(JSON.stringify(state))), state);
    for (const invalid of [null, {}, { ...state, board: [2] }, { ...state, score: -1 },
        { ...state, best: -1 }, { ...state, previous: {} },
        { ...state, board: Array(16).fill(3) }, { ...state, version: 2 }]) {
        assert.throws(() => validateSave(invalid), /Invalid 2048 save/);
    }
});

test("tracks the spawned tile even when its value matches the previous cell", () => {
    const before = stateWith([2, ...Array(15).fill(0)]);
    const after = move(before, "right", zero);
    assert.equal(after.spawnedIndex, 0);
    assert.equal(before.board[0], after.board[0]);
    assert.equal(after.board[after.spawnedIndex], 2);
    assert.equal(after.board[3], 2);
    assert.equal(viewState(after).spawnedIndex, 0);
    assert.equal(move(after, "up", zero), after);
    assert.equal(undo(after).spawnedIndex, null);
    assert.equal(newGame().spawnedIndex, null);
});

test("spawn metadata identifies only the random tile, not a merged tile", () => {
    const after = move(stateWith([2, 2, ...Array(14).fill(0)]), "left", zero);
    assert.equal(after.board[0], 4);
    assert.equal(after.spawnedIndex, 1);
    assert.equal(after.board[1], 2);
    const four = move(stateWith([2, ...Array(15).fill(0)]), "right", () => .99);
    assert.equal(four.spawnedIndex, 15);
    assert.equal(four.board[15], 4);
});

test("spawn metadata persists without rejecting saves made before this feature", () => {
    const after = move(stateWith([2, ...Array(15).fill(0)]), "right", zero);
    const saved = validateSave(JSON.parse(JSON.stringify(after)));
    assert.equal(viewState(saved).spawnedIndex, 0);
    const legacy = { ...after };
    delete legacy.spawnedIndex;
    assert.equal(viewState(validateSave(legacy)).spawnedIndex, null);
    assert.equal(viewState(undo(legacy)).spawnedIndex, null);
    for (const index of [-1, 16, 1.5, "0", 1]) {
        assert.throws(() => validateSave({ ...after, spawnedIndex: index }), /Invalid 2048 save/);
    }
});
