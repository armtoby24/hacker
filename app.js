// --- Network Node Graph ---
const NetworkGraph = {
    'gateway': {
        id: 'gateway',
        name: 'Public Gateway',
        desc: 'Unsecured public entry point. Low traffic.',
        ice: 0,
        keys: ['guest_list.txt'],
        links: ['proxy_1', 'mail_server'],
        pos: { x: 0, y: 0, z: 0 }
    },
    'proxy_1': {
        id: 'proxy_1',
        name: 'Routing Proxy Alpha',
        desc: 'Standard routing node. Basic firewall active.',
        ice: 1,
        keys: ['proxy_logs.db'],
        links: ['gateway', 'subnet_b', 'auth_server'],
        pos: { x: 3, y: 1.5, z: -2 }
    },
    'mail_server': {
        id: 'mail_server',
        name: 'External Mail Spool',
        desc: 'Employee communications. Might contain careless passwords.',
        ice: 0,
        keys: ['email_hash', 'admin_dump.bak'],
        links: ['gateway'],
        pos: { x: -3, y: -1, z: 1 }
    },
    'subnet_b': {
        id: 'subnet_b',
        name: 'Development Subnet',
        desc: 'Staging ground for internal tools.',
        ice: 2,
        keys: ['token_sequence'],
        links: ['proxy_1', 'database_1'],
        pos: { x: 5, y: -0.5, z: -4 }
    },
    'auth_server': {
        id: 'auth_server',
        name: 'Authentication Server',
        desc: 'Handles intranet token validation. Heavily guarded.',
        ice: 4,
        keys: ['auth_token'],
        links: ['proxy_1', 'core_router'],
        pos: { x: 1, y: 4, z: -3 }
    },
    'database_1': {
        id: 'database_1',
        name: 'Personnel Database',
        desc: 'Employee records and clearance levels.',
        ice: 3,
        keys: ['sys_admin_hash', 'root_cert'],
        links: ['subnet_b', 'core_router'],
        pos: { x: 7, y: -2, z: -6 }
    },
    'core_router': {
        id: 'core_router',
        name: 'Core Router',
        desc: 'The final gate. Requires strict auth token access.',
        ice: 5,
        keys: ['firewall_override'],
        links: ['auth_server', 'database_1', 'the_core'],
        pos: { x: 4, y: 3, z: -8 }
    },
    'the_core': {
        id: 'the_core',
        name: 'The Core',
        desc: 'Primary data vault. Objective location.',
        ice: 8,
        keys: ['the_passkey'],
        links: ['core_router'],
        pos: { x: 5, y: 0, z: -11 }
    }
};

// --- State Management ---
const GameState = {
    location: 'gateway',
    iceLevel: 0, // ICE of current node
    trace: 0,    // 0 to 100%
    inventory: ['init_script.sh'],
    discoveredNodes: new Set(['gateway']),
    isProcessing: false,
    startTime: null,
    endTime: null,
    traceTimerId: null
};

const MinigameState = {
    active: false,
    targetString: '',
    currentInput: '',
    timeLeft: 0,
    timerId: null,
    resolvePromise: null
};

const UI = {
    termInput: document.getElementById('terminal-input'),
    termOutput: document.getElementById('terminal-output'),
    locName: document.getElementById('loc-name'),
    locIce: document.getElementById('loc-ice'),
    keysCount: document.getElementById('keys-count'),
    traceLevel: document.getElementById('trace-level'),
    romOutput: document.getElementById('rom-output'),
    mapContent: document.getElementById('map-content'),
    map3d: document.getElementById('map-3d'),
    minigameOverlay: document.getElementById('minigame-overlay'),
    minigameTimer: document.getElementById('minigame-timer'),
    minigameTarget: document.getElementById('minigame-target'),
    minigameInput: document.getElementById('minigame-input'),
    minigameHint: document.getElementById('minigame-hint')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize 3D Map
    if (typeof Map3DVisualizer !== 'undefined') {
        window.Map3D = new Map3DVisualizer('map-3d');
    }

    document.addEventListener('click', () => {
        if (!MinigameState.active) {
            UI.termInput.focus();
        }
    });

    UI.termInput.addEventListener('keydown', async (e) => {
        if (MinigameState.active) {
            e.preventDefault();
            return;
        }

        if (e.key === 'Enter') {
            const command = UI.termInput.value.trim();
            if (command && !GameState.isProcessing) {
                UI.termInput.value = '';
                await processCommand(command);
            } else if (GameState.isProcessing) {
                e.preventDefault();
            }
        }
    });

    // Minigame specific listener needs to be on document to catch keys when input is blurred
    document.addEventListener('keydown', (e) => {
        if (MinigameState.active) {
            handleMinigameInput(e);
        }
    });

    updateUI();

    // Manage Audio Initiation Overlay
    const startOverlay = document.getElementById('start-overlay');
    const startBtn = document.getElementById('btn-start');

    startBtn.addEventListener('click', () => {
        window.AudioEngine.init();
        startOverlay.classList.add('hidden');
        GameState.startTime = Date.now();

        // Passive trace increase
        GameState.traceTimerId = setInterval(async () => {
            if (GameState.trace >= 100) return;
            GameState.trace += 1;
            updateUI();
            if (GameState.trace >= 100) {
                clearInterval(GameState.traceTimerId);
                await triggerGameLoss();
            }
        }, 3000);

        runBootSequence();
    });

    // Ambient ROM Dialogue
    setInterval(() => {
        if (!GameState.isProcessing && Math.random() > 0.85 && GameState.trace < 100 && GameState.inventory.length === 0) {
            const ambientLines = [
                "Keep your footprint small.",
                "I'm masking our MAC address. You have some time.",
                "If we hit heavy ICE, consider looking for side channels.",
                "This network is quieter than I expected.",
                "Don't forget to 'scan' your surroundings."
            ];
            const line = ambientLines[Math.floor(Math.random() * ambientLines.length)];
            romLog(line);
        }
    }, 15000);
});

function updateUI() {
    const currentNode = NetworkGraph[GameState.location];
    UI.locName.textContent = currentNode.name;
    UI.locIce.textContent = currentNode.ice > 0 ? Array(currentNode.ice).fill('*').join('') : '0';

    // Color code trace
    UI.traceLevel.textContent = `${GameState.trace}%`;
    UI.traceLevel.className = GameState.trace > 75 ? 'alert-high' : GameState.trace > 40 ? 'alert-med' : 'alert-low';

    UI.keysCount.textContent = GameState.inventory.length;

    // Draw Ascii Map
    drawMap();

    // Update 3D Map
    if (window.Map3D) {
        window.Map3D.update(GameState);
    }
}

function drawMap() {
    let mapText = 'Local Topology:\n\n';
    const currentNode = NetworkGraph[GameState.location];

    mapText += `  [${currentNode.name}] <span class="highlight"><- YOU</span>\n`;

    currentNode.links.forEach(link => {
        const linkNode = NetworkGraph[link];
        const isDiscovered = GameState.discoveredNodes.has(link);

        const status = isDiscovered ? linkNode.name : 'Unknown Host';
        const isSecure = isDiscovered ? (linkNode.ice > 0 ? '[SECURE]' : '[OPEN]') : '[??????]';
        const displayLink = isDiscovered ? link : '???';

        mapText += `   |-- ${displayLink} ${isSecure} (${status})\n`;
    });

    UI.mapContent.innerHTML = mapText;
}

// --- Terminal Engine ---
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeText(text, speed = 15, className = '') {
    const div = document.createElement('div');
    if (className) div.className = className;
    UI.termOutput.appendChild(div);

    if (speed === 0 || text.includes('<span')) {
        div.innerHTML = text;
        UI.termOutput.scrollTop = UI.termOutput.scrollHeight;
        return;
    }

    let currentText = '';
    for (let i = 0; i < text.length; i++) {
        currentText += text[i];
        div.textContent = currentText;
        UI.termOutput.scrollTop = UI.termOutput.scrollHeight;

        if (text[i] !== ' ') {
            window.AudioEngine.playTyping();
        }

        await delay(speed + (Math.random() * speed));
    }
}

// --- Minigame Engine ---
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function startMinigame(iceLevel) {
    return new Promise((resolve) => {
        MinigameState.active = true;
        MinigameState.resolvePromise = resolve;
        MinigameState.currentInput = '';
        MinigameState.iceLevel = iceLevel; // Store for breaker calc

        UI.termInput.blur();

        const stringLength = 5 + (iceLevel * 2);
        MinigameState.targetString = generateRandomString(stringLength);
        MinigameState.timeLeft = Math.max(5, 15 - iceLevel);

        UI.minigameTarget.textContent = MinigameState.targetString;
        UI.minigameInput.innerHTML = '';
        UI.minigameTimer.textContent = MinigameState.timeLeft.toFixed(2) + 's';

        // Any item except 'the_passkey' is considered an ICE breaker
        const breakerCount = GameState.inventory.filter(item => item !== 'the_passkey').length;
        if (breakerCount > 0) {
            UI.minigameHint.textContent = `[TAB] Use Data Buffer to Bypass (${breakerCount}x available)`;
            UI.minigameHint.style.color = 'var(--text-color)';
        } else {
            UI.minigameHint.textContent = `[TAB] Use Data Buffer to Bypass (0x available)`;
            UI.minigameHint.style.color = 'var(--text-dim)';
        }

        UI.minigameOverlay.classList.remove('hidden');

        MinigameState.timerId = setInterval(() => {
            MinigameState.timeLeft -= 0.1;
            if (MinigameState.timeLeft <= 0) {
                MinigameState.timeLeft = 0;
                endMinigame(false);
            } else {
                UI.minigameTimer.textContent = MinigameState.timeLeft.toFixed(2) + 's';
            }
        }, 100);
    });
}

function handleMinigameInput(e) {
    // Ignore meta/ctrl/alt keys
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'Tab') {
        e.preventDefault();

        // Find first item that isn't the passkey
        const breakerIndex = GameState.inventory.findIndex(item => item !== 'the_passkey');

        if (breakerIndex !== -1) {
            // Consume the item
            const consumedItem = GameState.inventory.splice(breakerIndex, 1)[0];

            // Calculate how many letters to crack based on ICE level (min 2, max 6 depending on level)
            const lettersToCrack = Math.max(2, 6 - MinigameState.iceLevel);

            // Play crack sound
            window.AudioEngine.playSuccess();

            // Auto complete the next X characters
            const remainingTarget = MinigameState.targetString.slice(MinigameState.currentInput.length);
            MinigameState.currentInput += remainingTarget.slice(0, lettersToCrack);

            // Update hint UI
            const newCount = GameState.inventory.filter(item => item !== 'the_passkey').length;
            UI.minigameHint.textContent = `[TAB] Use Data Buffer to Bypass (${newCount}x available) - Used ${consumedItem}`;
            if (newCount === 0) UI.minigameHint.style.color = 'var(--text-dim)';
        }
    } else if (e.key === 'Backspace') {
        e.preventDefault();
        MinigameState.currentInput = MinigameState.currentInput.slice(0, -1);
        window.AudioEngine.playTyping();
    } else if (e.key.length === 1 && e.key.match(/[a-zA-Z0-9!@#$%^&*]/)) {
        e.preventDefault();
        MinigameState.currentInput += e.key.toUpperCase();
        window.AudioEngine.playTyping();
    }

    let displayHtml = '';
    let isCorrectSoFar = true;
    for (let i = 0; i < MinigameState.currentInput.length; i++) {
        if (MinigameState.currentInput[i] === MinigameState.targetString[i]) {
            displayHtml += `<span class="highlight">${MinigameState.currentInput[i]}</span>`;
        } else {
            isCorrectSoFar = false;
            displayHtml += `<span class="alert-high">${MinigameState.currentInput[i]}</span>`;
        }
    }

    UI.minigameInput.innerHTML = displayHtml;

    if (isCorrectSoFar && MinigameState.currentInput.length === MinigameState.targetString.length) {
        endMinigame(true);
    }
}

function endMinigame(success) {
    clearInterval(MinigameState.timerId);
    MinigameState.active = false;
    UI.minigameOverlay.classList.add('hidden');
    UI.termInput.focus();
    MinigameState.resolvePromise(success);
}

// ROM Engine
function romLog(text) {
    const div = document.createElement('div');
    div.className = 'rom-message typewriter-fade';
    div.innerHTML = `>> ROM: ${text}`;
    UI.romOutput.appendChild(div);
    UI.romOutput.scrollTop = UI.romOutput.scrollHeight;
}

async function runBootSequence() {
    GameState.isProcessing = true;
    UI.termOutput.innerHTML = '';

    const header = `
   ____  __  __ ____      _   _ _____ 
  / ___||  \\/  |  _ \\    | \\ | | ____|
  \\___ \\| |\\/| | |_) |   |  \\| |  _|  
   ___) | |  | |  __/    | |\\  | |___ 
  |____/|_|  |_|_|       |_| \\_|_____|
                                      
    `;

    await typeText(header, 0, 'highlight ascii-map');
    await typeText("sys-term v4.2.0 boot sequence initiated...", 20);
    await delay(300);
    await typeText("Establishing secure connection...", 30);
    await delay(500);
    await typeText("Connection established. User identity concealed.", 10);
    await typeText(" ", 0);
    await typeText("Welcome to the Matrix. Find your way to The Core.", 20);
    await typeText("Type 'help' for Available Commands.", 20);

    romLog("Keep your profile low. Use 'scan' to see where we can go.");
    GameState.isProcessing = false;
}

async function processCommand(cmd) {
    GameState.isProcessing = true;

    await typeText(`<span class="prompt">root@null:~$</span> ${cmd}`, 0);

    const parts = cmd.split(' ').filter(Boolean);
    const keyword = parts[0].toLowerCase();
    const args = parts.slice(1);

    const currentNode = NetworkGraph[GameState.location];

    switch (keyword) {
        case 'help':
            await typeText("Available commands:", 10);
            await typeText("  scan               - Discover connected nodes", 10);
            await typeText("  move <node_id>     - Navigate to a node/directory", 10);
            await typeText("  crack              - Attempt to break ICE on current node", 10);
            await typeText("  download           - Download files from current node", 10);
            await typeText("  analyze            - Ask ROM for intel", 10);
            await typeText("  clear              - Clear terminal output", 10);
            break;

        case 'clear':
            UI.termOutput.innerHTML = '';
            break;

        case 'analyze':
            await typeText("Pinging ROM for analysis...", 20);
            await delay(400);
            if (currentNode.id === 'the_core') {
                romLog("This is it. The Core. Download it and sever the connection!");
            } else if (currentNode.ice > 0) {
                romLog(`Ice level is ${currentNode.ice}. Careful, failed cracks increase Trace.`);
            } else if (currentNode.keys.length > 0) {
                romLog("I detect interesting files here. Run 'download' to grab them.");
            } else {
                romLog("No obvious vulnerabilities here. Moving on is advised.");
            }
            break;

        case 'scan':
            await typeText("Scanning local subspace...", 30);
            await delay(500);
            await typeText(`NODE: ${currentNode.name}`, 10, 'highlight');
            await typeText(`DESC: ${currentNode.desc}`, 10);
            await typeText(`ICE: ${currentNode.ice > 0 ? 'ACTIVE' : 'NONE'}`, 10);

            await typeText(" ", 0);
            await typeText("Connections available:", 10);
            for (const link of currentNode.links) {
                GameState.discoveredNodes.add(link);
                const linkNode = NetworkGraph[link];
                await typeText(` - ${link} [${linkNode.ice > 0 ? 'SECURE' : 'OPEN'}]`, 10);
            }
            updateUI();
            break;

        case 'move':
        case 'cd':
            const target = args[0];
            if (!target) {
                await typeText("Usage: move <node_id>", 10);
                break;
            }

            if (!GameState.discoveredNodes.has(target)) {
                await typeText(`Error: host '${target}' not found. Try running 'scan'.`, 10, 'alert-med');
                break;
            }

            if (!currentNode.links.includes(target) && target !== '..') {
                await typeText(`Error: host '${target}' not reachable from here.`, 10, 'alert-med');
                break;
            }

            if (target === '..') {
                // Not implementing full state tree right now, just explicit node IDs.
                await typeText("Error: Back-tracking requires explicit node ID.", 10);
                break;
            }

            const targetNode = NetworkGraph[target];
            if (targetNode.ice > 0) {
                await typeText(`Connection refused by ${targetNode.id}. ICE Firewall active.`, 20, 'alert-high');
                romLog(`We have to move there and 'crack' the ICE first or find a backdoor.`);
                // For simplicity, let's say they can move in, but ICE limits actions
                await typeText(`Bypassing visual blocks... Entering ${targetNode.id}...`, 20);
                GameState.location = target;
                updateUI();
                await typeText(`WARNING: You are inside a protected node. Actions limited until ICE is cracked.`, 10, 'alert-med');
            } else {
                await typeText(`Routing connection to ${target}...`, 20);
                await delay(300);
                GameState.location = target;
                GameState.discoveredNodes.add(target);
                updateUI();
                await typeText(`Successfully entered ${targetNode.name}.`, 10, 'highlight');
            }
            break;

        case 'crack':
            if (currentNode.ice === 0) {
                await typeText("No active ICE detected on this node.", 10);
                break;
            }

            await typeText("Initiating ICE Breaker suite...", 30);
            await delay(600);

            const cracked = await startMinigame(currentNode.ice);

            if (cracked) {
                window.AudioEngine.playSuccess();
                await typeText(">> ICE BYPASSED <<", 20, 'highlight');
                currentNode.ice = 0; // Permanently cracked for this session
                updateUI();
                romLog("Good job. We're clear here.");
            } else {
                window.AudioEngine.playError();
                await typeText(">> DECRYPTION FAILED <<", 20, 'alert-high');
                GameState.trace += 20 + (currentNode.ice * 5); // Increased penalty
                updateUI();
                romLog("They noticed that! Trace level rising.");

                if (GameState.trace >= 100) {
                    await triggerGameLoss();
                }
            }
            break;

        case 'download':
            if (currentNode.ice > 0) {
                await typeText("Access Denied. Crack ICE before accessing payloads.", 10, 'alert-high');
                break;
            }

            if (currentNode.keys.length === 0) {
                await typeText("No valuable data found here.", 10);
                break;
            }

            await typeText("Downloading payloads...", 20);
            await delay(400);

            for (const key of currentNode.keys) {
                await typeText(`Downloaded: ${key}`, 10, 'highlight');
                // Any item can be picked up and duplicates are fine
                GameState.inventory.push(key);
            }

            currentNode.keys = []; // Empty it
            updateUI();

            if (GameState.inventory.includes('the_passkey')) {
                await triggerGameWin();
            }
            break;

        default:
            await typeText(`bash: ${keyword}: command not found`, 5);
            break;
    }

    GameState.isProcessing = false;
}

async function triggerGameLoss() {
    clearInterval(GameState.traceTimerId);
    GameState.isProcessing = true;
    UI.termOutput.innerHTML = '';
    UI.termOutput.style.color = 'var(--alert-high)';

    window.AudioEngine.playError();
    await typeText("CRITICAL ALERT - TRACE AT 100%", 10, 'alert-high');
    await typeText("CONNECTION SEVERED BY HOST", 10, 'alert-high');
    await typeText("SYS-TERM KILLED.", 10, 'alert-high');
    romLog("They've locked us out! We have to abort!");

    // Disable inputs permanently
    UI.termInput.disabled = true;
    UI.mapContent.innerHTML = '[NO SIGNAL]';

    // Blank 3D map and show alert
    if (window.Map3D) {
        window.Map3D.showGameOver();
    }
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}m ${s}s`;
}

function updateLeaderboard(timeMs) {
    let leaderboard = JSON.parse(localStorage.getItem('hacker_leaderboard') || '[]');
    leaderboard.push(timeMs);
    leaderboard.sort((a, b) => a - b);
    leaderboard = leaderboard.slice(0, 5); // Keep top 5
    localStorage.setItem('hacker_leaderboard', JSON.stringify(leaderboard));
    return leaderboard;
}

async function triggerGameWin() {
    clearInterval(GameState.traceTimerId);
    GameState.isProcessing = true;
    GameState.endTime = Date.now();
    await delay(1000);
    UI.termOutput.innerHTML = '';

    window.AudioEngine.playSuccess();
    await typeText(">> CORE PASSKEY SECURED <<", 20, 'highlight');
    await typeText("CONNECTION SEVERED SAFELY", 20, 'highlight');
    await typeText("MISSION ACCOMPLISHED.", 20, 'highlight');
    romLog("We got it! Splitting the connection before they trace us. Excellent work.");

    const timeTaken = GameState.endTime - GameState.startTime;
    const timeFormatted = formatTime(timeTaken);

    await typeText(" ", 0);
    await typeText(`TIME ELAPSED: ${timeFormatted}`, 20, 'highlight');

    const leaderboard = updateLeaderboard(timeTaken);

    await typeText(" ", 0);
    await typeText("--- TOP OPERATORS ---", 10);

    for (let i = 0; i < leaderboard.length; i++) {
        const isCurrent = leaderboard[i] === timeTaken ? 'highlight' : '';
        await typeText(`${i + 1}. ${formatTime(leaderboard[i])}`, 10, isCurrent);
    }

    UI.termInput.disabled = true;
}
