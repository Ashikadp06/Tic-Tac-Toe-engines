// --- DOM Element Mappings ---
const boxes = document.querySelectorAll(".box");
const modeSelect = document.querySelector("#mode-select");
const themeToggle = document.querySelector("#theme-toggle");
const soundToggle = document.querySelector("#sound-toggle");
const msgBanner = document.querySelector("#msg-banner");
const msgText = document.querySelector("#msg");
const newGameBtn = document.querySelector("#new-btn");
const resetBtn = document.querySelector("#reset-btn");
const strikeLine = document.querySelector("#strike-line");

const scoreXElement = document.querySelector("#score-x");
const scoreOElement = document.querySelector("#score-o");
const scoreTiesElement = document.querySelector("#score-ties");

const findMatchBtn = document.querySelector("#find-match-btn");
const countdownClock = document.querySelector("#countdown-clock");

// --- Application Core State Matrix ---
let state = {
    board: Array(9).fill(""),
    gameActive: true,
    currentPlayer: "X", 
    gameMode: "ai",    
    theme: "dark",
    soundMuted: false,
    scores: { x: 0, o: 0, ties: 0 },
    timerInterval: null,
    secondsRemaining: 10,
    isSearching: false
};

// Geometry matrix for tracking coordinates to render vector overlay win paths
const WIN_GEOMETRY = [
    [0, 1, 2, 0, 16.6, 100, 16.6],   
    [3, 4, 5, 0, 50, 100, 50],       
    [6, 7, 8, 0, 83.3, 100, 83.3],   
    [0, 3, 6, 16.6, 0, 16.6, 100],   
    [1, 4, 7, 50, 0, 50, 100],       
    [2, 5, 8, 83.3, 0, 83.3, 100],   
    [0, 4, 8, 0, 0, 100, 100],       
    [2, 4, 6, 100, 0, 0, 100]        
];

// --- Web Audio API Synth Engine ---
const synth = {
    ctx: null,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    play(type) {
        if (state.soundMuted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;
        if (type === "click") {
            osc.frequency.setValueAtTime(state.currentPlayer === "X" ? 440 : 554.37, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === "win") {
            osc.frequency.setValueAtTime(587.33, now); 
            osc.frequency.setValueAtTime(880, now + 0.1); 
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
        } else if (type === "tie") {
            osc.frequency.setValueAtTime(220, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        }
    }
};

// --- Storage Engine Operations ---
const storage = {
    save() { localStorage.setItem("tictactoe_state", JSON.stringify({ scores: state.scores, theme: state.theme, soundMuted: state.soundMuted, gameMode: state.gameMode })); },
    load() {
        const saved = localStorage.getItem("tictactoe_state");
        if (saved) {
            const parsed = JSON.parse(saved);
            state.scores = parsed.scores || state.scores;
            state.theme = parsed.theme || state.theme;
            state.soundMuted = parsed.soundMuted ?? state.soundMuted;
            state.gameMode = parsed.gameMode || state.gameMode;
        }
    }
};

// --- System Engine Initialization ---
const initApp = () => {
    storage.load();
    
    document.documentElement.setAttribute("data-theme", state.theme);
    themeToggle.innerText = state.theme === "dark" ? "🌙" : "☀️";
    soundToggle.innerText = state.soundMuted ? "🔇" : "🔊";
    modeSelect.value = state.gameMode;
    
    updateScoreboardUI();
    resetRound();
};

const updateScoreboardUI = () => {
    scoreXElement.innerText = state.scores.x;
    scoreOElement.innerText = state.scores.o;
    scoreTiesElement.innerText = state.scores.ties;
};

const resetRound = () => {
    state.board.fill("");
    state.gameActive = true;
    state.currentPlayer = "X";
    
    // Maintain timer display visibility layout cleanly on startup
    msgBanner.classList.remove("hide");
    msgText.innerText = "Your Turn!";
    newGameBtn.classList.add("hide");
    countdownClock.style.display = "inline-block";
    
    boxes.forEach(box => {
        box.innerText = "";
        box.disabled = false;
        box.classList.remove("x-placement", "o-placement");
    });

    strikeLine.style.strokeDashoffset = "1000";
    startTurnTimer();
};

// --- Turn Countdown Clock Manager ---
const startTurnTimer = () => {
    clearInterval(state.timerInterval);
    state.secondsRemaining = 10; 
    updateTimerUI();

    state.timerInterval = setInterval(() => {
        state.secondsRemaining--;
        updateTimerUI();

        if (state.secondsRemaining <= 0) {
            clearInterval(state.timerInterval);
            handleTurnTimeout();
        }
    }, 1000);
};

const updateTimerUI = () => {
    const formattedSeconds = String(state.secondsRemaining).padStart(2, '0');
    countdownClock.innerText = `00:${formattedSeconds}`;
    
    if (state.secondsRemaining <= 3) {
        countdownClock.style.color = "#ef4444"; // Flashes bright red warning
    } else {
        countdownClock.style.color = "#ffffff";
    }
};

const handleTurnTimeout = () => {
    if (!state.gameActive) return;
    
    // Switch turns automatically if clock hits 0
    state.currentPlayer = state.currentPlayer === "X" ? "O" : "X";
    msgText.innerText = `${state.currentPlayer} Turn!`;
    synth.play("tie"); 
    
    if (state.gameMode === "ai" && state.currentPlayer === "O") {
        disableAllBoxes();
        setTimeout(executeAiTurn, 400);
    } else {
        startTurnTimer();
    }
};

// --- Simulated Matchmaking Handshake ---
const handleMatchmakingSimulation = () => {
    if (state.isSearching) return;

    state.isSearching = true;
    state.gameActive = false;
    clearInterval(state.timerInterval);
    countdownClock.style.display = "none"; 
    disableAllBoxes();
    
    let searchDots = 0;
    findMatchBtn.disabled = true;
    msgText.innerText = "Connecting to matchmaking server...";
    
    const matchmakingInterval = setInterval(() => {
        searchDots = (searchDots + 1) % 4;
        findMatchBtn.innerText = "Searching" + ".".repeat(searchDots);
    }, 400);

    setTimeout(() => {
        clearInterval(matchmakingInterval);
        state.isSearching = false;
        findMatchBtn.disabled = false;
        findMatchBtn.innerText = "Match Found! ⚔️";
        msgText.innerText = "Match Joined! Loading matrix...";
        
        setTimeout(() => {
            findMatchBtn.innerText = "Find Match";
            resetRound();
        }, 1200);
    }, 3000);
};

// --- Core Game Move Actions Engine ---
const handleBoxClick = (e) => {
    const idx = parseInt(e.target.getAttribute("data-index"));
    if (state.board[idx] !== "" || !state.gameActive || state.isSearching) return;

    makeMove(idx, state.currentPlayer);

    if (state.gameActive && state.gameMode === "ai" && state.currentPlayer === "O") {
        disableAllBoxes();
        setTimeout(executeAiTurn, 300);
    }
};

const executeAiTurn = () => {
    const aiOptimalIndex = findBestMove(state.board);
    if (aiOptimalIndex !== -1) {
        makeMove(aiOptimalIndex, "O");
    }
    if (state.gameActive) enableEmptyBoxes();
};

const makeMove = (index, player) => {
    state.board[index] = player;
    boxes[index].innerText = player;
    boxes[index].classList.add(player === "X" ? "x-placement" : "o-placement");
    
    // Visual styling support matching crimson/cobalt schemes dynamically
    if(player === "X") boxes[index].style.color = "#ef4444";
    if(player === "O") boxes[index].style.color = "#3b82f6";
    
    boxes[index].disabled = true;
    synth.play("click");

    if (evalGameWin(state.board, player)) {
        clearInterval(state.timerInterval);
        handleWinSequence(player);
    } else if (state.board.every(cell => cell !== "")) {
        clearInterval(state.timerInterval);
        handleDrawSequence();
    } else {
        state.currentPlayer = state.currentPlayer === "X" ? "O" : "X";
        msgText.innerText = `${state.currentPlayer} Turn!`;
        startTurnTimer();
    }
};

const disableAllBoxes = () => boxes.forEach(box => box.disabled = true);
const enableEmptyBoxes = () => {
    boxes.forEach((box, i) => {
        if (state.board[i] === "") box.disabled = false;
    });
};

const evalGameWin = (board, player) => {
    return WIN_GEOMETRY.some(condition => 
        condition[0] !== undefined && 
        board[condition[0]] === player && 
        board[condition[1]] === player && 
        board[condition[2]] === player
    );
};

const handleWinSequence = (winner) => {
    state.gameActive = false;
    state.scores[winner.toLowerCase()]++;
    storage.save();
    updateScoreboardUI();
    synth.play("win");

    const winningPattern = WIN_GEOMETRY.find(cond => 
        state.board[cond[0]] === winner && state.board[cond[1]] === winner && state.board[cond[2]] === winner
    );

    if (winningPattern) {
        strikeLine.setAttribute("x1", `${winningPattern[3]}%`);
        strikeLine.setAttribute("y1", `${winningPattern[4]}%`);
        strikeLine.setAttribute("x2", `${winningPattern[5]}%`);
        strikeLine.setAttribute("y2", `${winningPattern[6]}%`);
        strikeLine.style.strokeDashoffset = "0";
    }

    msgText.innerText = `Winner is ${winner}! 🏆`;
    countdownClock.style.display = "none";
    newGameBtn.classList.remove("hide");
    disableAllBoxes();
};

const handleDrawSequence = () => {
    state.gameActive = false;
    state.scores.ties++;
    storage.save();
    updateScoreboardUI();
    synth.play("tie");

    msgText.innerText = "Game is a Draw! 🤝";
    countdownClock.style.display = "none";
    newGameBtn.classList.remove("hide");
};

// --- Recursive Minimax Engine Core ---
const evaluateMoves = (board) => {
    if (evalGameWin(board, "O")) return 10;
    if (evalGameWin(board, "X")) return -10;
    if (board.every(cell => cell !== "")) return 0;
    return null;
};

const minimax = (board, depth, isMax) => {
    const score = evaluateMoves(board);
    if (score !== null) return score > 0 ? score - depth : score + depth; 

    if (isMax) {
        let best = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (board[i] === "") {
                board[i] = "O";
                best = Math.max(best, minimax(board, depth + 1, false));
                board[i] = "";
            }
        }
        return best;
    } else {
        let best = Infinity;
        for (let i = 0; i < 9; i++) {
            if (board[i] === "") {
                board[i] = "X";
                best = Math.min(best, minimax(board, depth + 1, true));
                board[i] = "";
            }
        }
        return best;
    }
};

const findBestMove = (board) => {
    let bestVal = -Infinity;
    let bestMove = -1;
    for (let i = 0; i < 9; i++) {
        if (board[i] === "") {
            board[i] = "O";
            let moveVal = minimax(board, 0, false);
            board[i] = "";
            if (moveVal > bestVal) {
                bestMove = i;
                bestVal = moveVal;
            }
        }
    }
    return bestMove;
};

// --- Event Listeners Setup ---
boxes.forEach(box => box.addEventListener("click", handleBoxClick));

modeSelect.addEventListener("change", (e) => {
    state.gameMode = e.target.value;
    storage.save();
    resetRound();
});

themeToggle.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    themeToggle.innerText = state.theme === "dark" ? "🌙" : "☀️";
    storage.save();
});

soundToggle.addEventListener("click", () => {
    state.soundMuted = !state.soundMuted;
    soundToggle.innerText = state.soundMuted ? "🔇" : "🔊";
    storage.save();
});

newGameBtn.addEventListener("click", resetRound);
findMatchBtn.addEventListener("click", handleMatchmakingSimulation);

resetBtn.addEventListener("click", () => {
    state.scores = { x: 0, o: 0, ties: 0 };
    storage.save();
    updateScoreboardUI();
    resetRound();
});

document.addEventListener("DOMContentLoaded", initApp);
