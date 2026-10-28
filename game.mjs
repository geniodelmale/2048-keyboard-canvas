export const DIRECTIONS = ["left", "right", "up", "down"];

export function mergeLine(line) {
    const values = line.filter(value => value !== 0);
    const merged = [];
    let score = 0;
    for (let i = 0; i < values.length; i++) {
        if (values[i] === values[i + 1]) {
            const value = values[i] * 2;
            merged.push(value);
            score += value;
            i++;
        } else {
            merged.push(values[i]);
        }
    }
    return { line: merged.concat(Array(4 - merged.length).fill(0)), score };
}

export function slide(board, direction) {
    if (!DIRECTIONS.includes(direction)) throw new Error("Direzione non valida.");
    const next = [...board];
    let score = 0;
    for (let row = 0; row < 4; row++) {
        const indices = Array.from({ length: 4 }, (_, column) => {
            if (direction === "left") return row * 4 + column;
            if (direction === "right") return row * 4 + 3 - column;
            if (direction === "up") return column * 4 + row;
            return (3 - column) * 4 + row;
        });
        const result = mergeLine(indices.map(index => board[index]));
        indices.forEach((index, column) => { next[index] = result.line[column]; });
        score += result.score;
    }
    return { board: next, score, changed: next.some((value, index) => value !== board[index]) };
}

function spawn(board, random) {
    const empty = board.flatMap((value, index) => value === 0 ? [index] : []);
    if (empty.length === 0) return { board: [...board], index: null };
    const next = [...board];
    const index = empty[Math.floor(random() * empty.length)];
    next[index] = random() < 0.9 ? 2 : 4;
    return { board: next, index };
}

export function newGame(best = 0, random = Math.random) {
    const first = spawn(Array(16).fill(0), random);
    return {
        version: 1,
        board: spawn(first.board, random).board,
        spawnedIndex: null,
        score: 0,
        best,
        moves: 0,
        previous: null,
    };
}

export function isGameOver(board) {
    return !DIRECTIONS.some(direction => slide(board, direction).changed);
}

export function move(state, direction, random = Math.random) {
    const result = slide(state.board, direction);
    if (!result.changed) return state;
    const score = state.score + result.score;
    const spawned = spawn(result.board, random);
    return {
        ...state,
        board: spawned.board,
        spawnedIndex: spawned.index,
        score,
        best: Math.max(state.best, score),
        moves: state.moves + 1,
        previous: { board: [...state.board], score: state.score, moves: state.moves },
    };
}

export function undo(state) {
    if (!state.previous) return state;
    return { ...state, ...state.previous, spawnedIndex: null, previous: null };
}

function validSnapshot(value) {
    return value !== null && typeof value === "object"
        && Array.isArray(value.board) && value.board.length === 16
        && value.board.every(tile => Number.isSafeInteger(tile) && tile >= 0
            && (tile === 0 || (tile >= 2 && Number.isInteger(Math.log2(tile)))))
        && Number.isSafeInteger(value.score) && value.score >= 0
        && Number.isSafeInteger(value.moves) && value.moves >= 0;
}

export function validateSave(value) {
    if (!validSnapshot(value) || value.version !== 1
        || !Number.isSafeInteger(value.best) || value.best < value.score
        || !(value.spawnedIndex === undefined || value.spawnedIndex === null
            || (Number.isInteger(value.spawnedIndex) && value.spawnedIndex >= 0
                && value.spawnedIndex < 16 && [2, 4].includes(value.board[value.spawnedIndex])))
        || !(value.previous === null || validSnapshot(value.previous))) {
        throw new Error("Salvataggio 2048 non valido. Conserva o rinomina il file prima di riprovare.");
    }
    return value;
}

export function viewState(state) {
    return {
        board: state.board,
        score: state.score,
        best: state.best,
        moves: state.moves,
        spawnedIndex: state.spawnedIndex ?? null,
        canUndo: state.previous !== null,
        won: state.board.some(value => value >= 2048),
        gameOver: isGameOver(state.board),
    };
}
