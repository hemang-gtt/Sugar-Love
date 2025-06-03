const {
  baseGameTable,
  freeSpinTable,
  featureBuyTable,
  purchaseBonusScatter,
  purchaseBonusFreeSpinTable,
  table1,
  purchaseUpgradeSpin,
  upgradeSpinsTableName,
  upgradeSpinsTable,
} = require('../weights/tables');
const { reels, tumbleReels } = require('../weights/reels.js');
const gameutils = require('./gameUtils');
const feature = require('./feature.js');
const { paytable } = require('../utils/payTable.js');
const { getRandom } = require('../utils/common.js');

const DENOM = 0.0025;
const BET_MULTIPLIER = 20;

function chooseBaseGameTable() {
  const random = getRandom(0, baseGameTable.totalWeight);
  let sum = 0;
  for (let i = 0; i < baseGameTable.tables.length; i++) {
    sum += baseGameTable.weights[i];
    if (random < sum) {
      return baseGameTable.tables[i];
    }
  }
}

function generateBoard(reel, isUpgradeSpin, tableName) {
  let generatedReel = [];
  for (let i = 0; i < 7; i++) {
    let singleReel = [];
    for (let j = 0; j < 7; j++) {
      let random = getRandom(0, reel[i].sum);
      if (isUpgradeSpin) {
        if (tableName == 'BG1') {
          random = getRandom(1, reel[i].sum);
        } else if (tableName == 'BG2') {
          random = getRandom(2, reel[i].sum);
        }
      }

      let sum = 0;
      for (let k = 0; k < reel[i].weights.length; k++) {
        sum += reel[i].weights[k];
        if (random < sum) {
          singleReel.push(gameutils.getIndex[reel.symbols[k]]);
          break;
        }
      }
    }
    generatedReel.push(singleReel);
  }
  return generatedReel;
}

function generateFeatureBuyBoard(reel) {
  let board = generateBoard(reel);
  let scatterList = [];

  // get scatter list
  const random = getRandom(0, purchaseBonusScatter.totalWeight);
  let sum = 0;
  for (let i = 0; i < purchaseBonusScatter.weights.length; i++) {
    sum += purchaseBonusScatter.weights[i];
    if (random < sum) {
      scatterList = purchaseBonusScatter[i];
      break;
    }
  }

  // modify board based on scatter list
  scatterList.forEach((shouldModify, rowIndex) => {
    if (shouldModify === 1) {
      // Change a random value to scatter
      const randomColIndex = getRandom(0, board[rowIndex].length);
      board[rowIndex][randomColIndex] =
        typeof board[rowIndex][randomColIndex] != 'number' ? gameutils.scatterSymbols[0] : gameutils.scatterSymbols[1];
    }
  });

  return board;
}

function generateUpgradeSpinBuyBoard(reels) {
  let upgradeSpinList = [];

  // get upgrade spin list
  const random = getRandom(0, purchaseUpgradeSpin.totalWeight);
  let sum = 0;
  for (let i = 0; i < purchaseUpgradeSpin.weights.length; i++) {
    sum += purchaseUpgradeSpin.weights[i];
    if (random < sum) {
      upgradeSpinList = purchaseUpgradeSpin[i];
      break;
    }
  }

  let reel = { symbols: reels['BUY_US_NO_SCATTER'].symbols };
  for (let i = 0; i < upgradeSpinList.length; i++) {
    if (upgradeSpinList[i] == 0) {
      reel[i] = reels['BUY_US_NO_SCATTER'][i];
    } else if (upgradeSpinList[i] == 1) {
      reel[i] = reels['BUY_US_WITH_SCATTER'][i];
    }
  }

  let board = generateBoard(reel);
  // return { board, reel };
  return board;
}

function findMatches(board) {
  const size = board.length;
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const matches = {};

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (!visited[i][j]) {
        const candyType = board[i][j];
        if (!gameutils.scatterSymbols.includes(candyType)) {
          const connected = gameutils.findConnectedCandies(board, i, j, visited, candyType);

          if (connected.length >= 5) {
            // Group matches by candy type
            if (!matches[candyType]) {
              matches[candyType] = [connected];
            } else {
              matches[candyType] = [...matches[candyType], connected];
            }
          }
        }
      }
    }
  }

  return matches;
}

function calculateWin(betAmount, matches, spotMultiplierSum) {
  let totalWin = 0;
  let tumbleWins = [];
  for (const key in matches) {
    for (let i = 0; i < matches[key].length; i++) {
      const id = gameutils.getId(key, matches[key][i]);
      const count = Math.min(matches[key][i].length, paytable.maxCount);
      const symbol = gameutils.getSymbol[key];
      let win = gameutils.decimalMultiplier(paytable[symbol][count] * betAmount * DENOM * BET_MULTIPLIER);
      let tumbleWin = [win];

      // check for spotMultiplier is present (2x or more) and multiply it with the win amount
      if (spotMultiplierSum.has(id)) {
        win = gameutils.decimalMultiplier(win * spotMultiplierSum.get(id));
        tumbleWin.push(spotMultiplierSum.get(id), win);
      }
      totalWin = gameutils.decimalMultiplier(totalWin + win);
      tumbleWins.push(tumbleWin);
    }
  }

  return [totalWin, tumbleWins];
}

function popCandies(board, matches) {
  for (const candyType in matches) {
    matches[candyType].forEach((group) => {
      group.forEach(([i, j]) => {
        board[i][j] = null;
      });
    });
  }
}

function applyGravity(board, reel) {
  const size = board.length;

  for (let j = 0; j < size; j++) {
    let emptyRow = size - 1; // Start at the bottom of the column

    for (let i = size - 1; i >= 0; i--) {
      if (board[i][j] !== null) {
        // Only move the candy if it’s not already at `emptyRow`
        if (i !== emptyRow) {
          board[emptyRow][j] = board[i][j]; // Move candy to `emptyRow`
          board[i][j] = null; // Set current position to null
        }
        emptyRow--; // Move `emptyRow` up
      }
    }

    // Fill the remaining null positions at the top with new random candies
    if (emptyRow >= 0) {
      // gameutils.printBoard(board, "Before Fill " + j + " index: ");
      for (let i = emptyRow; i >= 0; i--) {
        board[i][j] = gameutils.generateSymbol(j, reel);
      }
      // gameutils.printBoard(board, "After Fill " + j + " index: ");
    }
  }
}

exports.playGame = (balance, betAmount, upgradeSpin, freeSpin, isFeatureBuy, isActiveCampaign, isUpgradeSpinBuy) => {
  let response = null;
  let tableName = '';
  let isFreeSpin = false;
  let board = null;
  let maxWinningExceeded = false;
  // get table name
  if (freeSpin?.count > 0) {
    if (freeSpin.isFeatureBuyFS) {
      // feature buy free spin

      // if feature buy is enable then a different table will come
      tableName = purchaseBonusFreeSpinTable(freeSpin.totalWin, betAmount);
    } else {
      // free spin
      // else normal spin table will come
      tableName = freeSpinTable(freeSpin.totalWin, betAmount);
    }
    isFreeSpin = true;
  } else if (isFeatureBuy) {
    // feature buy
    balance = gameutils.decimalMultiplier(balance - betAmount * Number(process.env.FEATURE_BUY_MULTIPLIER));
    tableName = featureBuyTable();
  } else if (isUpgradeSpinBuy) {
    balance = gameutils.decimalMultiplier(balance - betAmount * Number(process.env.FEATURE_BUY_MULTIPLIER));
  } else if (isActiveCampaign) {
    // use feature buy table in promotional campaign because it don't have any freespin
    tableName = featureBuyTable();
  } else if (upgradeSpin.activeCount > 0) {
    if (upgradeSpin.isUpgradeSpinBuy) {
      tableName = upgradeSpinsTableName();
    } else {
      tableName = chooseBaseGameTable();
    }
  } else {
    // base game
    balance = gameutils.decimalMultiplier(balance - betAmount);
    tableName = chooseBaseGameTable();
  }

  if (isFeatureBuy) {
    board = generateFeatureBuyBoard(reels[tableName]);
  } else if (isUpgradeSpinBuy) {
    board = generateUpgradeSpinBuyBoard(reels);
  } else {
    board = generateBoard(reels[tableName], upgradeSpin?.activeCount > 0 ? true : false, tableName);
  }

  // temp board
  if (process.env.DUMMY_DATA_TESTING === 'true') {
    if (!isFreeSpin && !isFeatureBuy && !isUpgradeSpinBuy && !isActiveCampaign && upgradeSpin.activeCount == 0) {
      board = [
        // [5,7,2,3,5,7,6],
        [5, 5, 5, 5, 5, 7, 6],
        [0, 2, 3, 5, 5, 3, 1],
        [4, 5, 3, 5, 7, 4, 6],
        [6, 3, 4, 4, 0, 4, 4],
        [6, 5, 6, 3, 4, 4, 0],
        [3, 6, 6, 6, 5, 7, 3],
        [3, 7, 3, 5, 5, 5, 5],
      ];
    }

    // upgrade spin buy check
    if (isUpgradeSpinBuy) {
      board = [
        [2, 1, 7, 1, 5, 1, 6],
        [1, 1, 2, 5, 7, 1, 6],
        [1, 1, 4, 5, 6, 7, 4],
        [7, 4, 7, 3, 6, 5, 7],
        [7, 7, 7, 3, 2, 7, 6],
        [6, 5, 7, 2, 1, 5, 6],
        [1, 6, 6, 1, 5, 1, 5],
      ];
    }
  }

  gameutils.printBoard(board, 'Initial Board:');
  board = gameutils.transpose(board);
  gameutils.printBoard(board, '\nTransposed Board:');

  let isStart = true;
  let totalWin = 0;
  const startingBoard = JSON.parse(JSON.stringify(board));

  const spotMultiplier = {
    board: Array.from({ length: 7 }, () => Array(7).fill(0)),
    sum: new Map(),
  };

  // Spot Multiplier continued for Free Spin Game
  if (isFreeSpin && freeSpin.spotMultipliers && freeSpin.spotMultipliers !== '') {
    let multiplierArray = freeSpin.spotMultipliers.split(',').map(Number);
    spotMultiplier.board = gameutils.transpose(
      Array.from({ length: 7 }, (_, i) => multiplierArray.slice(i * 7, i * 7 + 7))
    );
  }

  // Activate Upgrade Spin Feature
  if (!isFreeSpin && !isFeatureBuy && !isUpgradeSpinBuy && !isActiveCampaign && upgradeSpin.activeCount > 0) {
    board = feature.upgradeSpin(board, upgradeSpin.isUpgradeSpinBuy);
  }

  // Find and pop candies
  let matches = findMatches(board);

  while (Object.keys(matches).length > 0) {
    if (!isFreeSpin && !isFeatureBuy && !isUpgradeSpinBuy && upgradeSpin.activeCount == 0 && !isActiveCampaign) {
      if (betAmount == upgradeSpin.betAmount || upgradeSpin.betAmount < 0) {
        upgradeSpin.count++;
      } else {
        // upgrade spin reset if betAmount changed
        upgradeSpin.count = 1;
        upgradeSpin.betAmount = betAmount;
        upgradeSpin.required =
          process.env.DUMMY_DATA_TESTING === 'true'
            ? Number(process.env.DUMMY_UPGRADE_SPIN_COUNT)
            : gameutils.getKeyBasedOnWeights(table1, 'wins');
      }
    }

    // Spot Multiplier Feature
    [spotMultiplier.board, spotMultiplier.sum] = feature.spotMultiplier(spotMultiplier.board, matches);

    const [winAmount, tumbleWins] = calculateWin(betAmount, matches, spotMultiplier.sum);
    totalWin = gameutils.decimalMultiplier(totalWin + winAmount);
    balance = gameutils.decimalMultiplier(balance + winAmount);

    const scatters = gameutils.getScatterPositions(board);
    response = gameutils.generateResponse(
      response,
      isStart,
      isFreeSpin,
      isFeatureBuy,
      isActiveCampaign,
      startingBoard,
      board,
      balance,
      winAmount,
      upgradeSpin,
      matches,
      scatters,
      tumbleWins,
      spotMultiplier.board
    );

    popCandies(board, matches);
    gameutils.printBoard(board, '\nAfter Popping:');

    if (isUpgradeSpinBuy) {
      applyGravity(board, tumbleReels.BUY_US_NO_SCATTER);
    } else {
      applyGravity(board, tumbleReels[tableName]);
    }
    gameutils.printBoard(board, '\nAfter Gravity:');

    matches = findMatches(board); // Re-check for new matches
    isStart = false;

    const maxWinningX = Number(process.env.MAX_WINNING_X) || 25000;
    if (totalWin >= betAmount * maxWinningX) {
      maxWinningExceeded = true;
      break;
    }
  }

  // upgrade spin reset if betAmount changed or maxWinningExceeded
  if (!isFreeSpin && !isFeatureBuy && !isUpgradeSpinBuy && !isActiveCampaign) {
    if (betAmount != upgradeSpin.betAmount && upgradeSpin.betAmount >= 0) {
      upgradeSpin.count = 0;
      upgradeSpin.betAmount = betAmount;
      upgradeSpin.required =
        process.env.DUMMY_DATA_TESTING === 'true'
          ? Number(process.env.DUMMY_UPGRADE_SPIN_COUNT)
          : gameutils.getKeyBasedOnWeights(table1, 'wins');
    }
  }

  if (isUpgradeSpinBuy && !maxWinningExceeded) {
    upgradeSpin.count = 1;
    upgradeSpin.betAmount = betAmount;
    upgradeSpin.required = 1;
    upgradeSpin.isUpgradeSpinBuy = true;
  }

  const scatters = gameutils.getScatterPositions(board);
  const freeSpins = !maxWinningExceeded ? gameutils.getFreeSpins(scatters.length) : 0;

  matches = {};
  response = gameutils.generateResponse(
    response,
    isStart,
    isFreeSpin,
    isFeatureBuy,
    isActiveCampaign,
    startingBoard,
    board,
    balance,
    0,
    upgradeSpin,
    matches,
    scatters
  );

  gameutils.printBoard(board, '\nFinal Board:');

  const result = {
    totalWin,
    scatters,
    freeSpins,
    response,
    maxWinningExceeded,
  };

  if (isFreeSpin) {
    result.spotMultipliers = gameutils.transpose(spotMultiplier.board).flat().join(',');
  }

  return result;
};

exports.checkFreeSpin = (game, freeSpin, res, betAmount, isFeatureBuy, isActiveCampaign, maxWinningExceeded) => {
  console.log('game is while check free spin called -----------', game);
  console.log('is  campaign active ');
  if (game.scatters.length > 0 && !maxWinningExceeded) {
    res.sc = game.scatters.join(',');
  }

  if (betAmount > 0) {
    if (game.freeSpins > 0 && !maxWinningExceeded) {
      // count, amount, multiplier
      res.fs = { c: game.freeSpins, a: betAmount, m: '', tw: 0 };

      freeSpin = {
        isActive: true,
        count: game.freeSpins,
        betAmount: betAmount,
        isFeatureBuyFS: isFeatureBuy,
        spotMultipliers: '',
        totalWin: 0,
      };
    }
  } else if (!isActiveCampaign && freeSpin.count > 0) {
    freeSpin.count -= 1;
    if (game.freeSpins > 0) {
      freeSpin.count += game.freeSpins;
    }

    const maxWinningX = Number(process.env.MAX_WINNING_X) || 25000;
    if (gameutils.decimalMultiplier(freeSpin.totalWin + res.tw) >= freeSpin.betAmount * maxWinningX) {
      maxWinningExceeded = true;
    }

    if (freeSpin.count > 0 && !maxWinningExceeded) {
      freeSpin.spotMultipliers = game.spotMultipliers;
    } else {
      freeSpin.isActive = false;
      freeSpin.count = 0;
      freeSpin.betAmount = 0;
      freeSpin.spotMultipliers = '';
      freeSpin.isFeatureBuyFS = false;
      totalWin = 0;
    }

    freeSpin.totalWin = gameutils.decimalMultiplier(freeSpin.totalWin + res.tw);
    res.fs = { c: freeSpin.count, a: freeSpin.betAmount, m: game.spotMultipliers, tw: freeSpin.totalWin };
  }
  return [freeSpin, maxWinningExceeded];
};

exports.checkUpgradeSpin = (data, res, betAmount, freeSpin, maxWinningExceeded) => {
  if (data.upgradeSpin.count >= data.upgradeSpin.required && data.upgradeSpin.activeCount == 0 && !maxWinningExceeded) {
    // upgrade spin triggered
    data.upgradeSpin.betAmount = betAmount;
    data.upgradeSpin.usWin = 0;
    if (data.upgradeSpin.isUpgradeSpinBuy == true) {
      data.upgradeSpin.activeCount = gameutils.getKeyBasedOnWeights(upgradeSpinsTable, 'wins');
    } else {
      data.upgradeSpin.activeCount = gameutils.UpgradeSpinsActiveTill;
    }
    let upgradeSpinWin = 0;
    if (res.tw > 0 && !freeSpin.isActive && freeSpin.totalWin == 0) {
      upgradeSpinWin = res.tw;
      data.upgradeSpin.totalWin = res.tw;
    } else {
      upgradeSpinWin = freeSpin.totalWin;
      data.upgradeSpin.totalWin = freeSpin.totalWin;
    }

    res.us =
      !res?.fs?.a || res?.fs?.a == 0
        ? { a: true, c: data.upgradeSpin.activeCount, w: 0, tw: upgradeSpinWin }
        : undefined;
  } else if (data.upgradeSpin.count >= data.upgradeSpin.required && data.upgradeSpin.activeCount > 0) {
    // it's an upgrade spin
    data.upgradeSpin.activeCount = data.upgradeSpin.activeCount - 1;
    data.upgradeSpin.totalWin = gameutils.decimalMultiplier(data.upgradeSpin.totalWin + res.tw);
    data.upgradeSpin.usWin = gameutils.decimalMultiplier(data.upgradeSpin.usWin + res.tw);

    if (maxWinningExceeded) {
      data.upgradeSpin.required =
        process.env.DUMMY_DATA_TESTING === 'true'
          ? Number(process.env.DUMMY_UPGRADE_SPIN_COUNT)
          : gameutils.getKeyBasedOnWeights(table1, 'wins');
      data.upgradeSpin.count = 0;
      data.upgradeSpin.activeCount = 0;
    }

    res.ty = 'us';
    res.us =
      !res?.fs?.a || res?.fs?.a == 0
        ? {
            a: data.upgradeSpin.activeCount > 0,
            c: data.upgradeSpin.activeCount,
            w: data.upgradeSpin.usWin,
            tw: data.upgradeSpin.totalWin,
          }
        : undefined;

    if (data.upgradeSpin.activeCount <= 0) {
      data.upgradeSpin.required =
        process.env.DUMMY_DATA_TESTING === 'true'
          ? Number(process.env.DUMMY_UPGRADE_SPIN_COUNT)
          : gameutils.getKeyBasedOnWeights(table1, 'wins');
      data.upgradeSpin.count = 0;
      data.upgradeSpin.usWin = 0;
      data.upgradeSpin.totalWin = 0;
      data.upgradeSpin.betAmount = -1;
      data.upgradeSpin.isUpgradeSpinBuy = false;
    }
  } else {
    // normal spin
    data.upgradeSpin.activeCount = 0;
    data.upgradeSpin.usWin = 0;
    data.upgradeSpin.betAmount = betAmount;
    data.upgradeSpin.totalWin = 0;
    data.upgradeSpin.isUpgradeSpinBuy = false;

    if (maxWinningExceeded) {
      data.upgradeSpin.required =
        process.env.DUMMY_DATA_TESTING === 'true'
          ? Number(process.env.DUMMY_UPGRADE_SPIN_COUNT)
          : gameutils.getKeyBasedOnWeights(table1, 'wins');
      data.upgradeSpin.count = 0;
      data.upgradeSpin.betAmount = -1;
    }
  }
};
