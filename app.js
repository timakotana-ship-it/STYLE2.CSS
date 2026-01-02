// === КОНСТАНТЫ И НАСТРОЙКИ ===
const CUBE_ODDS = {
    'even': 2, 'odd': 2, 'greater': 2, 'less': 2,
    '1': 6, '2': 6, '3': 6, '4': 6, '5': 6, '6': 6
};

// === MINES КОНСТАНТЫ (НОВАЯ ЛОГИКА) ===
const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const HOUSE_EDGE = 0.04;
const BASE_COMMISSION = 0.96;

// Банки для игр
const gameBanks = {
    cube: { bank: 10000, minBank: -10000, maxBank: 10000 },
    mines: { bank: 10000, minBank: -10000, maxBank: 10000 }
};

// Глобальные переменные
let currentUser = null;
let diceState = {
    betAmount: 0.05,
    selectedOutcome: 'even',
    diceAnimation: null,
    isRolling: false
};

let minesState = {
    isPlaying: false,
    betAmount: 0.05,
    minesCount: 3,
    currentCoefficient: 1.00,
    nextCoefficient: 1.00,
    openedCells: [],
    minePositions: [],
    safePositions: [],
    steps: 0,
    clientSeed: '',
    gameId: null,
    coefficients: []
};

let sounds = {};
let lastToastTime = 0;
let isToastShowing = false;

// === УТИЛИТЫ ===
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFrom(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function md5(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

function sha256(input) {
    return 'demo_hash_' + md5(input);
}

function showToast(message, type = 'info') {
    const now = Date.now();
    if (isToastShowing && now - lastToastTime < 2000) return;
    
    lastToastTime = now;
    isToastShowing = true;
    
    const container = document.getElementById('toastContainer');
    container.innerHTML = '';
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s reverse forwards';
        setTimeout(() => {
            toast.remove();
            isToastShowing = false;
        }, 300);
    }, 3000);
}

function showGameResult(game, result, amount) {
    const existingResult = document.querySelector('.game-result-toast');
    if (existingResult) existingResult.remove();
    
    const toast = document.createElement('div');
    toast.className = `game-result-toast ${result}`;
    
    const icon = result === 'win' ? 'check-circle' : 'times-circle';
    const resultText = result === 'win' ? 'Выигрыш' : 'Проигрыш';
    const sign = result === 'win' ? '+' : '-';
    
    toast.innerHTML = `
        <div class="result-icon">
            <i class="fas fa-${icon}"></i>
        </div>
        <div class="result-content">
            <div class="result-game">${game}</div>
            <div class="result-text">${resultText}</div>
        </div>
        <div class="result-amount">${sign}${formatBalance(Math.abs(amount))}$</div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatBalance(amount) {
    return parseFloat(amount).toFixed(2);
}

function playSound(type) {
    if (sounds[type]) {
        sounds[type].currentTime = 0;
        sounds[type].play().catch(() => {});
    }
}

// === ИНИЦИАЛИЗАЦИЯ ПОЛЬЗОВАТЕЛЯ ===
async function initUser() {
    try {
        sounds.win = document.getElementById('winSound');
        sounds.lose = document.getElementById('loseSound');
        sounds.click = document.getElementById('clickSound');
        
        let tgUser = null;
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            tgUser = tg.initDataUnsafe?.user;
            tg.ready();
            tg.expand();
        }
        
        const userId = tgUser?.id || Date.now();
        const userKey = `user_${userId}`;
        
        const savedData = localStorage.getItem(userKey);
        if (savedData) {
            currentUser = JSON.parse(savedData);
        } else {
            currentUser = {
                id: userId,
                firstName: tgUser?.first_name || 'Игрок',
                username: tgUser?.username || `user${userId}`,
                nickname: '',
                photoUrl: tgUser?.photo_url,
                balance: 0.00,
                stats: { totalBets: 0, wonBets: 0, totalWin: 0 }
            };
            saveUserData();
        }
        
        updateUserDisplay();
        
        setTimeout(() => {
            document.getElementById('preloader').style.display = 'none';
        }, 800);
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        document.getElementById('preloader').style.display = 'none';
    }
}

function saveUserData() {
    if (!currentUser) return;
    localStorage.setItem(`user_${currentUser.id}`, JSON.stringify(currentUser));
}

function updateUserDisplay() {
    if (!currentUser) return;
    
    document.getElementById('userBalance').textContent = `${formatBalance(currentUser.balance)}$`;
    
    const winRate = currentUser.stats.totalBets > 0 
        ? Math.round((currentUser.stats.wonBets / currentUser.stats.totalBets) * 100)
        : 0;
    
    document.getElementById('totalBets').textContent = currentUser.stats.totalBets;
    document.getElementById('wonBets').textContent = currentUser.stats.wonBets;
    document.getElementById('totalWin').textContent = `${formatBalance(currentUser.stats.totalWin)}$`;
    document.getElementById('winRate').textContent = `${winRate}%`;
}

// === MINES НОВАЯ ЛОГИКА ===
function generateCoefficients(minesCount) {
    const coefficients = [];
    const safeCells = TOTAL_CELLS - minesCount;
    if (safeCells <= 0) return coefficients;

    let nextCoeff = (TOTAL_CELLS / safeCells) * BASE_COMMISSION;
    let steps = 0;

    while (steps < safeCells) {
        coefficients.push({
            step: steps + 1,
            coefficient: Number(nextCoeff.toFixed(2)),
            exactValue: nextCoeff
        });

        const remainingSafe = safeCells - steps;
        const remainingTotal = TOTAL_CELLS - steps;
        const calculated = (remainingTotal / remainingSafe) * nextCoeff;
        nextCoeff = Number(calculated.toFixed(2));
        steps++;
    }

    return coefficients;
}

function initMinesGame() {
    minesState = {
        isPlaying: false,
        betAmount: 0.05,
        minesCount: 3,
        currentCoefficient: 1.00,
        nextCoefficient: 1.00,
        openedCells: [],
        minePositions: [],
        safePositions: [],
        steps: 0,
        clientSeed: getRandomString(16),
        gameId: null,
        coefficients: []
    };
    
    document.getElementById('minesBetAmount').value = '0.05';
    document.getElementById('minesSlider').value = '3';
    document.getElementById('minesValue').textContent = '3 мины';
    
    document.querySelectorAll('.mines-count-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector('.mines-count-btn[data-mines="3"]').classList.add('active');
    
    renderMinesField();
    document.getElementById('cashoutMinesBtn').style.display = 'none';
    document.getElementById('startMinesBtn').style.display = 'block';
    
    updateCoefficients();
}

function renderMinesField() {
    const field = document.getElementById('minesField');
    field.innerHTML = '';
    
    for (let i = 0; i < TOTAL_CELLS; i++) {
        const tile = document.createElement('div');
        tile.className = 'mines-tile';
        tile.dataset.tile = i;
        
        if (minesState.isPlaying && minesState.openedCells.includes(i)) {
            if (minesState.minePositions.includes(i)) {
                tile.innerHTML = '<img src="images/bomb-mine.png" alt="Мины">';
                tile.classList.add('mine');
            } else {
                tile.innerHTML = '<img src="images/gem-mine.png" alt="Бриллиант">';
                tile.classList.add('gem');
            }
        } else {
            tile.innerHTML = '<img src="images/tile-mine.png" alt="Клетка">';
        }
        
        if (minesState.isPlaying && !minesState.openedCells.includes(i)) {
            tile.style.cursor = 'pointer';
            tile.onclick = () => openMinesTile(i);
        } else {
            tile.style.cursor = 'default';
        }
        
        field.appendChild(tile);
    }
}

function updateMinesBet() {
    const input = document.getElementById('minesBetAmount');
    minesState.betAmount = parseFloat(input.value) || 0.05;
    
    if (minesState.betAmount < 0.05) {
        minesState.betAmount = 0.05;
        input.value = '0.05';
    }
    
    if (minesState.betAmount > currentUser.balance) {
        minesState.betAmount = currentUser.balance;
        input.value = formatBalance(currentUser.balance);
    }
}

function setMinesQuickBet(amount) {
    playSound('click');
    minesState.betAmount = amount;
    document.getElementById('minesBetAmount').value = formatBalance(amount);
    updateMinesBet();
}

function setMinesMinBet() {
    playSound('click');
    minesState.betAmount = 0.05;
    document.getElementById('minesBetAmount').value = '0.05';
    updateMinesBet();
}

function setMinesMaxBet() {
    playSound('click');
    minesState.betAmount = currentUser.balance;
    document.getElementById('minesBetAmount').value = formatBalance(currentUser.balance);
    updateMinesBet();
}

function updateMinesSlider(value) {
    minesState.minesCount = parseInt(value);
    document.getElementById('minesValue').textContent = `${value} ${getMinesWord(value)}`;
    
    document.querySelectorAll('.mines-count-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.mines) === parseInt(value)) {
            btn.classList.add('active');
        }
    });
    
    updateCoefficients();
}

function selectMinesCount(count) {
    playSound('click');
    minesState.minesCount = count;
    document.getElementById('minesSlider').value = count;
    document.getElementById('minesValue').textContent = `${count} ${getMinesWord(count)}`;
    
    document.querySelectorAll('.mines-count-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.mines) === count) {
            btn.classList.add('active');
        }
    });
    
    updateCoefficients();
}

function getMinesWord(count) {
    if (count === 1) return 'мина';
    if (count >= 2 && count <= 4) return 'мины';
    return 'мин';
}

function updateCoefficients() {
    minesState.coefficients = generateCoefficients(minesState.minesCount);
    
    if (minesState.steps === 0) {
        minesState.currentCoefficient = 1.00;
        minesState.nextCoefficient = minesState.coefficients[0]?.coefficient || 1.00;
    } else {
        minesState.currentCoefficient = minesState.coefficients[minesState.steps - 1]?.coefficient || 1.00;
        minesState.nextCoefficient = minesState.coefficients[minesState.steps]?.coefficient || 1.00;
    }
    
    const cashoutBtn = document.getElementById('cashoutMinesBtn');
    if (cashoutBtn) {
        cashoutBtn.innerHTML = `Забрать ${formatBalance(minesState.betAmount * minesState.currentCoefficient)}$`;
    }
    
    updateMultiplierDisplay();
}

function updateMultiplierDisplay() {
    const currentMultiplierEl = document.getElementById('currentMultiplier');
    const nextMultiplierEl = document.getElementById('nextMultiplier');
    
    if (currentMultiplierEl) {
        currentMultiplierEl.textContent = `${formatBalance(minesState.currentCoefficient)}x`;
    }
    
    if (nextMultiplierEl) {
        nextMultiplierEl.textContent = `${formatBalance(minesState.nextCoefficient)}x`;
    }
}

async function startMinesGame() {
    playSound('click');
    
    if (minesState.isPlaying) {
        showToast('Игра уже начата!', 'info');
        return;
    }
    
    if (minesState.betAmount < 0.05) {
        showToast('Минимальная ставка: 0.05$', 'info');
        return;
    }
    
    if (currentUser.balance < minesState.betAmount) {
        showToast('Недостаточно средств', 'info');
        return;
    }
    
    currentUser.balance -= minesState.betAmount;
    updateUserDisplay();
    saveUserData();
    
    // Генерация поля (упрощенная для демо)
    const allCells = Array.from({length: TOTAL_CELLS}, (_, i) => i);
    const shuffledCells = [...allCells].sort(() => Math.random() - 0.5);
    minesState.minePositions = shuffledCells.slice(0, minesState.minesCount);
    minesState.safePositions = shuffledCells.slice(minesState.minesCount);
    
    minesState.isPlaying = true;
    minesState.openedCells = [];
    minesState.steps = 0;
    minesState.gameId = `mines_${Date.now()}`;
    
    updateCoefficients();
    
    document.getElementById('startMinesBtn').style.display = 'none';
    document.getElementById('cashoutMinesBtn').style.display = 'block';
    
    renderMinesField();
    
    showToast(`Игра начата! ${minesState.minesCount} мин на поле`, 'info');
}

async function openMinesTile(tileNumber) {
    if (!minesState.isPlaying || minesState.openedCells.includes(tileNumber)) {
        return;
    }
    
    playSound('click');
    
    // Проверка условий банка
    const potentialWin = minesState.betAmount * minesState.nextCoefficient - minesState.betAmount;
    const randplus = rand(0, 100);
    const randminus = rand(0, 100);
    
    let forcedLoss = false;
    
    if (potentialWin * (-1) < gameBanks.mines.minBank - gameBanks.mines.bank) {
        forcedLoss = true;
    }
    if (gameBanks.mines.bank < 0 && randminus < 12) forcedLoss = true;
    if (gameBanks.mines.bank > 0 && randplus < 8) forcedLoss = true;
    
    // Принудительный проигрыш
    if (forcedLoss) {
        if (!minesState.minePositions.includes(tileNumber)) {
            const randomMineIndex = Math.floor(Math.random() * minesState.minePositions.length);
            minesState.minePositions[randomMineIndex] = tileNumber;
        }
        minesState.openedCells.push(tileNumber);
        minesState.isPlaying = false;
        
        gameBanks.mines.bank += minesState.betAmount;
        revealAllMines();
        
        setTimeout(() => showGameResult('Мины', 'lose', minesState.betAmount), 500);
        playSound('lose');
        
        setTimeout(resetMinesGame, 3000);
        return;
    }
    
    // Обычная логика игры
    const isMine = minesState.minePositions.includes(tileNumber);
    
    if (isMine) {
        minesState.openedCells.push(tileNumber);
        minesState.isPlaying = false;
        gameBanks.mines.bank += minesState.betAmount;
        revealAllMines();
        
        setTimeout(() => showGameResult('Мины', 'lose', minesState.betAmount), 500);
        playSound('lose');
        
        setTimeout(resetMinesGame, 3000);
    } else {
        minesState.openedCells.push(tileNumber);
        minesState.steps++;
        
        const safeCellsCount = TOTAL_CELLS - minesState.minesCount;
        if (minesState.steps === safeCellsCount) {
            minesState.isPlaying = false;
            const winAmount = minesState.betAmount * minesState.currentCoefficient;
            const profit = winAmount - minesState.betAmount;
            
            currentUser.balance += winAmount;
            currentUser.stats.totalBets++;
            currentUser.stats.wonBets++;
            currentUser.stats.totalWin += profit;
            gameBanks.mines.bank -= profit;
            
            updateUserDisplay();
            saveUserData();
            revealAllMines();
            
            setTimeout(() => showGameResult('Мины', 'win', profit), 500);
            playSound('win');
            
            setTimeout(resetMinesGame, 3000);
            return;
        }
        
        updateCoefficients();
        renderMinesField();
    }
}

function revealAllMines() {
    for (let i = 0; i < TOTAL_CELLS; i++) {
        const tile = document.querySelector(`.mines-tile[data-tile="${i}"]`);
        if (tile) {
            if (minesState.minePositions.includes(i)) {
                tile.innerHTML = '<img src="images/bomb-mine.png" alt="Мины">';
                tile.classList.add('mine');
            } else if (!minesState.openedCells.includes(i)) {
                tile.innerHTML = '<img src="images/gem-mine.png" alt="Бриллиант">';
                tile.classList.add('gem');
            }
        }
    }
}

function resetMinesGame() {
    minesState.isPlaying = false;
    renderMinesField();
    document.getElementById('cashoutMinesBtn').style.display = 'none';
    document.getElementById('startMinesBtn').style.display = 'block';
    minesState.currentCoefficient = 1.00;
    minesState.nextCoefficient = 1.00;
    updateMultiplierDisplay();
}

async function cashoutMines() {
    if (!minesState.isPlaying || minesState.steps === 0) {
        showToast('Сделайте хотя бы 1 ход!', 'info');
        return;
    }
    
    playSound('click');
    
    const winAmount = minesState.betAmount * minesState.currentCoefficient;
    const profit = winAmount - minesState.betAmount;
    
    currentUser.balance += winAmount;
    currentUser.stats.totalBets++;
    currentUser.stats.wonBets++;
    currentUser.stats.totalWin += profit;
    gameBanks.mines.bank -= profit;
    
    minesState.isPlaying = false;
    revealAllMines();
    
    updateUserDisplay();
    saveUserData();
    
    setTimeout(() => showGameResult('Мины', 'win', profit), 500);
    playSound('win');
    
    setTimeout(resetMinesGame, 3000);
}

// === ИГРА В КОСТИ ===
function initDiceGame() {
    diceState.betAmount = 0.05;
    diceState.selectedOutcome = 'even';
    diceState.isRolling = false;
    
    const diceImage = document.getElementById('diceImage');
    const diceAnimation = document.getElementById('diceAnimation');
    
    diceImage.style.display = 'block';
    diceAnimation.style.display = 'none';
    diceImage.src = 'images/dice.svg';
    
    document.getElementById('betAmount').value = '0.05';
    selectOutcome('even');
}

function selectOutcome(outcome) {
    playSound('click');
    diceState.selectedOutcome = outcome;
    
    document.querySelectorAll('.outcome-btn, .number-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`[onclick*="${outcome}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

function updateDiceBet() {
    const input = document.getElementById('betAmount');
    diceState.betAmount = parseFloat(input.value) || 0.05;
    
    if (diceState.betAmount < 0.05) {
        diceState.betAmount = 0.05;
        input.value = '0.05';
    }
    
    if (diceState.betAmount > currentUser.balance) {
        diceState.betAmount = currentUser.balance;
        input.value = formatBalance(currentUser.balance);
    }
}

function setQuickBet(amount) {
    playSound('click');
    diceState.betAmount = amount;
    document.getElementById('betAmount').value = formatBalance(amount);
    updateDiceBet();
}

function setMinBet() {
    playSound('click');
    diceState.betAmount = 0.05;
    document.getElementById('betAmount').value = '0.05';
    updateDiceBet();
}

function setMaxBet() {
    playSound('click');
    diceState.betAmount = currentUser.balance;
    document.getElementById('betAmount').value = formatBalance(currentUser.balance);
    updateDiceBet();
}

async function placeDiceBet() {
    if (diceState.isRolling) return;
    
    playSound('click');
    
    if (!diceState.selectedOutcome) {
        showToast('Выберите исход броска', 'info');
        return;
    }
    
    if (diceState.betAmount < 0.05) {
        showToast('Минимальная ставка: 0.05$', 'info');
        return;
    }
    
    if (currentUser.balance < diceState.betAmount) {
        showToast('Недостаточно средств', 'info');
        return;
    }
    
    diceState.isRolling = true;
    const betBtn = document.getElementById('placeBetBtn');
    betBtn.disabled = true;
    betBtn.textContent = 'Бросок...';
    
    try {
        currentUser.balance -= diceState.betAmount;
        updateUserDisplay();
        saveUserData();
        
        let cube = rand(1, 6);
        
        const pWin = diceState.betAmount * (CUBE_ODDS[diceState.selectedOutcome] - 1);
        const randplus = rand(0, 100);
        const randminus = rand(0, 100);
        const plus = 8;
        const minus = 12;
        
        if (pWin * (-1) < gameBanks.cube.minBank - gameBanks.cube.bank || 
            (gameBanks.cube.bank < 0 && randminus < minus) || 
            (gameBanks.cube.bank > 0 && randplus < plus)) {
            
            switch(diceState.selectedOutcome) {
                case 'even': cube = randFrom([1, 3, 5]); break;
                case 'odd': cube = randFrom([2, 4, 6]); break;
                case 'greater': cube = randFrom([1, 2, 3]); break;
                case 'less': cube = randFrom([4, 5, 6]); break;
                default:
                    const possibleNumbers = [1, 2, 3, 4, 5, 6].filter(n => n !== parseInt(diceState.selectedOutcome));
                    cube = randFrom(possibleNumbers);
            }
        }
        
        let win = false;
        switch (diceState.selectedOutcome) {
            case 'even': win = cube % 2 === 0; break;
            case 'odd': win = cube % 2 !== 0; break;
            case 'greater': win = cube > 3; break;
            case 'less': win = cube < 4; break;
            default: win = cube === parseInt(diceState.selectedOutcome);
        }
        
        let winAmount = 0;
        if (win) {
            winAmount = diceState.betAmount * (CUBE_ODDS[diceState.selectedOutcome] - 1);
            gameBanks.cube.bank -= winAmount;
        } else {
            gameBanks.cube.bank += diceState.betAmount;
        }
        
        currentUser.stats.totalBets++;
        
        const salt = getRandomString(12);
        const hashCube = md5(cube + "|" + salt);
        
        saveGameToHistory(cube, win, winAmount, hashCube, salt);
        
        await playDiceAnimation(cube);
        
        if (win) {
            currentUser.balance += winAmount + diceState.betAmount;
            currentUser.stats.wonBets++;
            currentUser.stats.totalWin += winAmount;
            
            setTimeout(() => showGameResult('Кости', 'win', winAmount), 500);
            playSound('win');
        } else {
            setTimeout(() => showGameResult('Кости', 'lose', diceState.betAmount), 500);
            playSound('lose');
        }
        
        updateUserDisplay();
        saveUserData();
        
    } catch (error) {
        console.error('Ошибка ставки:', error);
        showToast('Ошибка при обработке ставки', 'error');
    } finally {
        setTimeout(() => {
            diceState.isRolling = false;
            betBtn.disabled = false;
            betBtn.textContent = 'Сделать ставку';
        }, 3000);
    }
}

function saveGameToHistory(result, win, winAmount, hash, salt) {
    const game = {
        id: Date.now(),
        type: 'dice',
        result: result,
        win: win,
        amount: diceState.betAmount,
        winAmount: winAmount,
        outcome: diceState.selectedOutcome,
        hash: hash,
        salt: salt,
        timestamp: new Date().toISOString()
    };
    
    const games = JSON.parse(localStorage.getItem(`games_${currentUser.id}`) || '[]');
    games.push(game);
    localStorage.setItem(`games_${currentUser.id}`, JSON.stringify(games));
}

async function playDiceAnimation(result) {
    const diceImage = document.getElementById('diceImage');
    const diceAnimation = document.getElementById('diceAnimation');
    
    diceImage.style.display = 'none';
    diceAnimation.style.display = 'block';
    diceAnimation.innerHTML = '';
    
    const animation = lottie.loadAnimation({
        container: diceAnimation,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: `images/dice${result}.json`
    });
    
    return new Promise(resolve => {
        setTimeout(resolve, 3500);
    });
}

// === ФУНКЦИИ ДЛЯ ПОИСКА ИГР ===
let gameSearchQuery = '';
let allGames = [
    { id: 'dice', name: 'Кости', icon: 'game-dice.png' },
    { id: 'mines', name: 'Минёр', icon: 'game-mines.png' },
    { id: 'tower', name: 'Башня', icon: 'game-tower.png' },
    { id: 'crash', name: 'Crash', icon: 'game-crash.png' },
    { id: 'x50', name: 'X50', icon: 'game-double.png' },
    { id: 'soon', name: 'Скоро', icon: 'game-soon.png' }
];

function toggleSearch() {
    const searchPanel = document.getElementById('searchPanel');
    const gamesSection = document.getElementById('gamesSection');
    
    if (searchPanel.style.display === 'none' || searchPanel.style.display === '') {
        searchPanel.style.display = 'block';
        gamesSection.style.display = 'none';
        document.getElementById('searchInput').focus();
    } else {
        searchPanel.style.display = 'none';
        gamesSection.style.display = 'block';
        gameSearchQuery = '';
        document.getElementById('searchInput').value = '';
        renderSearchResults();
    }
}

function searchGames() {
    const searchInput = document.getElementById('searchInput');
    gameSearchQuery = searchInput.value.toLowerCase();
    renderSearchResults();
}

function renderSearchResults() {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';
    
    if (!gameSearchQuery.trim()) {
        searchResults.innerHTML = '<div class="no-results">Введите название игры</div>';
        return;
    }
    
    const filteredGames = allGames.filter(game => 
        game.name.toLowerCase().includes(gameSearchQuery) ||
        game.id.toLowerCase().includes(gameSearchQuery)
    );
    
    if (filteredGames.length === 0) {
        searchResults.innerHTML = '<div class="no-results">Игры не найдены</div>';
        return;
    }
    
    filteredGames.forEach(game => {
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card-search';
        gameCard.onclick = () => openGame(game.id);
        
        gameCard.innerHTML = `
            <img src="images/${game.icon}" alt="${game.name}">
            <div class="search-game-name">${game.name}</div>
        `;
        
        searchResults.appendChild(gameCard);
    });
}

function showAllGames() {
    document.getElementById('searchPanel').style.display = 'none';
    document.getElementById('gamesSection').style.display = 'block';
    gameSearchQuery = '';
    document.getElementById('searchInput').value = '';
}

// === КАРУСЕЛЬ ИГР ===
let currentGameSlide = 0;
const gamesPerSlide = 3;

function updateGameCarousel() {
    const carouselInner = document.querySelector('.games-carousel-inner');
    if (!carouselInner) return;
    
    const slideWidth = 100 / Math.ceil(allGames.length / gamesPerSlide);
    carouselInner.style.transform = `translateX(-${currentGameSlide * slideWidth}%)`;
    
    document.querySelectorAll('.carousel-indicator').forEach((indicator, index) => {
        indicator.classList.toggle('active', index === currentGameSlide);
    });
}

function nextGameSlide() {
    const totalSlides = Math.ceil(allGames.length / gamesPerSlide);
    currentGameSlide = (currentGameSlide + 1) % totalSlides;
    updateGameCarousel();
}

function prevGameSlide() {
    const totalSlides = Math.ceil(allGames.length / gamesPerSlide);
    currentGameSlide = (currentGameSlide - 1 + totalSlides) % totalSlides;
    updateGameCarousel();
}

function goToGameSlide(index) {
    const totalSlides = Math.ceil(allGames.length / gamesPerSlide);
    if (index >= 0 && index < totalSlides) {
        currentGameSlide = index;
        updateGameCarousel();
    }
}

// === НАВИГАЦИЯ ПО СТРАНИЦАМ ===
function showPage(pageId) {
    playSound('click');
    
    document.querySelectorAll('.main-content').forEach(page => {
        page.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    const activeSideNav = document.querySelector(`.nav-item[onclick*="${pageId}"], .bottom-nav-item[onclick*="${pageId}"]`);
    if (activeSideNav) {
        activeSideNav.classList.add('active');
    }
    
    if (pageId === 'dicePage') {
        initDiceGame();
    } else if (pageId === 'minesPage') {
        initMinesGame();
    }
}

function openGame(game) {
    playSound('click');
    
    if (game === 'dice') {
        showPage('dicePage');
    } else if (game === 'mines') {
        showPage('minesPage');
    } else {
        showToast('Игра в разработке', 'info');
    }
}

function backToMain() {
    playSound('click');
    showPage('mainPage');
}

// === КОШЕЛЕК ===
function showWalletTab(tab) {
    playSound('click');
    
    document.querySelectorAll('.wallet-section').forEach(content => {
        content.style.display = 'none';
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const tabContent = document.getElementById(`${tab}Tab`);
    if (tabContent) {
        tabContent.style.display = 'block';
    }
    
    const tabBtn = document.querySelector(`.tab-btn[onclick*="${tab}"]`);
    if (tabBtn) {
        tabBtn.classList.add('active');
    }
    
    if (tab === 'history') {
        loadTransactionHistory();
    }
}

function setDeposit(amount) {
    playSound('click');
    document.getElementById('depositAmount').value = formatBalance(amount);
}

function processDeposit() {
    playSound('click');
    
    const amount = parseFloat(document.getElementById('depositAmount').value);
    
    if (isNaN(amount) || amount < 0.50) {
        showToast('Минимальная сумма: 0.50$', 'info');
        return;
    }
    
    showToast('Создание платежа...', 'info');
    
    setTimeout(() => {
        currentUser.balance += amount;
        updateUserDisplay();
        saveUserData();
        
        saveTransaction(amount, 'deposit', `Пополнение ${formatBalance(amount)}$`);
        
        showToast(`✅ Баланс пополнен на ${formatBalance(amount)}$`, 'success');
        playSound('win');
    }, 2000);
}

function processWithdrawal() {
    playSound('click');
    
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    
    if (isNaN(amount) || amount < 2.00) {
        showToast('Минимальная сумма: 2.00$', 'info');
        return;
    }
    
    if (currentUser.balance < amount) {
        showToast('Недостаточно средств', 'info');
        return;
    }
    
    showToast('Создание заявки...', 'info');
    
    setTimeout(() => {
        currentUser.balance -= amount;
        updateUserDisplay();
        saveUserData();
        
        saveTransaction(-amount, 'withdraw', `Вывод ${formatBalance(amount)}$`);
        
        showToast('✅ Заявка создана! Средства поступят в течение 5 минут.', 'success');
        playSound('win');
    }, 2000);
}

function loadTransactionHistory() {
    const transactions = JSON.parse(localStorage.getItem(`transactions_${currentUser.id}`) || '[]');
    const container = document.getElementById('transactionList');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    const recentTransactions = transactions.slice(-20).reverse();
    
    if (recentTransactions.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">История транзакций пуста</div>';
        return;
    }
    
    recentTransactions.forEach(tx => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        
        const icon = tx.amount > 0 ? 'arrow-down' : 'arrow-up';
        const amountClass = tx.amount > 0 ? 'positive' : 'negative';
        const amountSign = tx.amount > 0 ? '+' : '';
        
        item.innerHTML = `
            <div class="transaction-info">
                <div class="transaction-icon">
                    <i class="fas fa-${icon}"></i>
                </div>
                <div class="transaction-details">
                    <div class="transaction-type">${tx.description}</div>
                    <div class="transaction-date">${new Date(tx.timestamp).toLocaleString('ru-RU')}</div>
                </div>
            </div>
            <div class="transaction-amount ${amountClass}">
                ${amountSign}${formatBalance(tx.amount)}$
            </div>
        `;
        
        container.appendChild(item);
    });
}

function saveTransaction(amount, type, description) {
    const tx = {
        id: Date.now(),
        amount: amount,
        type: type,
        description: description,
        timestamp: new Date().toISOString()
    };
    
    const transactions = JSON.parse(localStorage.getItem(`transactions_${currentUser.id}`) || '[]');
    transactions.push(tx);
    localStorage.setItem(`transactions_${currentUser.id}`, JSON.stringify(transactions));
}

// === БОНУСЫ ===
let isBonusProcessing = false;

function claimDailyBonus() {
    if (isBonusProcessing) return;
    
    playSound('click');
    isBonusProcessing = true;
    
    if (currentUser.balance > 0.05) {
        showToast('Бонус доступен только при балансе менее 0.05$', 'info');
        isBonusProcessing = false;
        return;
    }
    
    if (!currentUser.nickname || !currentUser.nickname.toLowerCase().includes('sevendicegamebot')) {
        showToast('Для получения бонуса установите @SevenDiceGameBot в ник Telegram', 'info');
        isBonusProcessing = false;
        return;
    }
    
    const bonusBtn = document.getElementById('dailyBonusBtn');
    bonusBtn.disabled = true;
    bonusBtn.textContent = 'Обработка...';
    
    try {
        const lastBonusDate = localStorage.getItem(`last_bonus_${currentUser.id}`);
        const today = new Date().toDateString();
        
        if (lastBonusDate === today) {
            showToast('Вы уже получали бонус сегодня. Приходите завтра!', 'info');
            bonusBtn.disabled = false;
            bonusBtn.textContent = 'Получить бонус';
            isBonusProcessing = false;
            return;
        }
        
        const bonusAmount = 0.06 + Math.random() * 0.14;
        currentUser.balance += bonusAmount;
        
        localStorage.setItem(`last_bonus_${currentUser.id}`, today);
        
        updateUserDisplay();
        saveUserData();
        
        saveTransaction(bonusAmount, 'bonus', 'Ежедневный бонус');
        
        showToast(`🎁 Ежедневный бонус: ${formatBalance(bonusAmount)}$`, 'success');
        playSound('win');
        
        bonusBtn.textContent = 'Получено';
        bonusBtn.style.background = 'var(--success)';
        
    } catch (error) {
        console.error('Ошибка бонуса:', error);
        bonusBtn.disabled = false;
        bonusBtn.textContent = 'Получить бонус';
    } finally {
        setTimeout(() => {
            isBonusProcessing = false;
        }, 2000);
    }
}

let isPromoProcessing = false;

function activatePromo() {
    if (isPromoProcessing) return;
    
    playSound('click');
    isPromoProcessing = true;
    
    const promoCode = document.getElementById('promoCode').value.trim().toUpperCase();
    
    if (!promoCode) {
        showToast('Введите промокод', 'info');
        isPromoProcessing = false;
        return;
    }
    
    const usedPromos = JSON.parse(localStorage.getItem(`used_promos_${currentUser.id}`) || '[]');
    
    if (usedPromos.includes(promoCode)) {
        showToast('Этот промокод уже использован', 'info');
        isPromoProcessing = false;
        return;
    }
    
    const validPromos = {
        'WELCOME10': 0.10,
        'BONUS2024': 0.20,
        'FREEMONEY': 0.15,
        'START05': 0.05
    };
    
    if (validPromos[promoCode]) {
        const bonusAmount = validPromos[promoCode];
        currentUser.balance += bonusAmount;
        
        usedPromos.push(promoCode);
        localStorage.setItem(`used_promos_${currentUser.id}`, JSON.stringify(usedPromos));
        
        updateUserDisplay();
        saveUserData();
        
        saveTransaction(bonusAmount, 'bonus', `Промокод: ${promoCode}`);
        
        showToast(`🎫 Промокод активирован! +${formatBalance(bonusAmount)}$`, 'success');
        playSound('win');
        
        document.getElementById('promoCode').value = '';
    } else {
        showToast('Неверный промокод', 'info');
    }
    
    setTimeout(() => {
        isPromoProcessing = false;
    }, 2000);
}

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    initUser();
    updateGameCarousel();
});

// Экспорт функций для HTML
window.openGame = openGame;
window.showPage = showPage;
window.backToMain = backToMain;
window.selectOutcome = selectOutcome;
window.setQuickBet = setQuickBet;
window.setMinBet = setMinBet;
window.setMaxBet = setMaxBet;
window.placeDiceBet = placeDiceBet;
window.showWalletTab = showWalletTab;
window.setDeposit = setDeposit;
window.processDeposit = processDeposit;
window.processWithdrawal = processWithdrawal;
window.claimDailyBonus = claimDailyBonus;
window.activatePromo = activatePromo;

// Mines функции
window.updateMinesBet = updateMinesBet;
window.setMinesQuickBet = setMinesQuickBet;
window.setMinesMinBet = setMinesMinBet;
window.setMinesMaxBet = setMinesMaxBet;
window.updateMinesSlider = updateMinesSlider;
window.selectMinesCount = selectMinesCount;
window.startMinesGame = startMinesGame;
window.cashoutMines = cashoutMines;

// Поиск игр
window.toggleSearch = toggleSearch;
window.searchGames = searchGames;
window.showAllGames = showAllGames;

// Карусель игр
window.nextGameSlide = nextGameSlide;
window.prevGameSlide = prevGameSlide;
window.goToGameSlide = goToGameSlide;