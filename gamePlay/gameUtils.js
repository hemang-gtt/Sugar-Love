const { getRandom } = require('../utils/common');
const { freeSpins } = require('../weights/tables');

exports.getIndex = {
  FG: 0,
  H1: 1,
  H2: 2,
  H3: 3,
  L1: 4,
  L2: 5,
  L3: 6,
  L4: 7,
};

exports.getSymbol = {
  0: 'FG',
  1: 'H1',
  2: 'H2',
  3: 'H3',
  4: 'L1',
  5: 'L2',
  6: 'L3',
  7: 'L4',
};

exports.scatterSymbols = ['FG', 0];

exports.lowerSymbols = {
  1: ['L4', 7],
  2: ['L3', 'L4', 6, 7],
  3: ['L2', 'L3', 'L4', 5, 6, 7],
  4: ['L1', 'L2', 'L3', 'L4', 4, 5, 6, 7],
};

exports.UpgradeSpinsActiveTill = 3;

const DECIMAL_MULTIPLIER = 10000;
exports.decimalMultiplier = (value, decimalSize = 2) => {
  let finalValue = parseFloat(value.toFixed(decimalSize)) * DECIMAL_MULTIPLIER;
  finalValue /= DECIMAL_MULTIPLIER;
  return finalValue;
};

exports.generateSymbol = (index, reel) => {
  const random = getRandom(0, reel[index].sum);
  let sum = 0;
  for (let k = 0; k < reel[index].weights.length; k++) {
    sum += reel[index].weights[k];
    if (random < sum) {
      return this.getIndex[reel.symbols[k]];
    }
  }
};

exports.findConnectedCandies = (board, i, j, visited, candyType) => {
  const size = board.length;
  const stack = [[i, j]];
  const connected = [];

  while (stack.length > 0) {
    const [x, y] = stack.pop();

    if (x >= 0 && x < size && y >= 0 && y < size && !visited[x][y] && board[x][y] === candyType) {
      visited[x][y] = true;
      connected.push([x, y]);

      // Add neighbors to the stack
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
  }

  return connected;
};

exports.getScatterPositions = (board) => {
  let positions = [];
  const tempBoard = JSON.parse(JSON.stringify(board));
  const flatBoard = this.transpose(tempBoard).flat();
  for (let i = 0; i < flatBoard.length; i++) {
    if (this.scatterSymbols.includes(flatBoard[i])) {
      positions.push(i);
    }
  }
  return positions;
};

exports.getFreeSpins = (scatterCount) => {
  if (scatterCount < freeSpins.minScatters) return 0;
  const maxScatters = Math.min(scatterCount, freeSpins.maxScatters);
  return freeSpins[maxScatters];
};

exports.getKeyBasedOnWeights = (table, key) => {
  const random = getRandom(0, table.totalWeight);
  let sum = 0;
  for (let i = 0; i < table[key].length; i++) {
    sum += table.weights[i];
    if (random < sum) {
      return table[key][i];
    }
  }
};

exports.transpose = (reelWindow) => {
  return reelWindow[0].map((_, colIndex) => reelWindow.map((row) => row[colIndex]));
};

exports.printBoard = (board, refText = '') => {
  if (process.env.PRINT_BOARD_FOR_TESTING === 'true') {
    console.log(refText);

    board.forEach((row) => console.log(row.join(' ')));
  }
};

const findIndexInReel = (number, size = 7) => {
  const row = Math.floor(number / size);
  const col = number % size;
  return [row, col];
};

const findNumberFromReel = (row, col, size = 7) => {
  return row * size + col;
};

exports.getId = (key, array) => {
  const encodedNumbers = array.map(([row, col]) => findNumberFromReel(row, col)).join('');
  return `${key}_${encodedNumbers}`;
};

exports.to2DArray = (str, rows = 7, cols = 7) => {
  const numbers = str.split(',').map(Number);
  const result = [];

  for (let i = 0; i < rows; i++) {
    result.push(numbers.slice(i * cols, (i + 1) * cols));
  }

  return result;
};

exports.generateResponse = (
  response,
  isStart,
  isFreeSpin,
  isFeatureBuy,
  isActiveCampaign,
  startingReel,
  reel,
  balance,
  winAmount,
  upgradeSpin,
  tumble,
  scatters,
  tumbleWin,
  tumbleBoard
) => {
  let result = {
    ty: isStart ? 's' : 't',
    b: balance,
    w: winAmount,
    r: this.transpose(reel).flat().toString(),
    t: {
      l: formatObject(tumble),
      w: formatList(tumbleWin),
      m: tumbleBoard ? this.transpose(tumbleBoard).flat().toString() : '',
    },
    sc: scatters.join(','),
  };

  if (!isFreeSpin && !isActiveCampaign) {
    if (!isFeatureBuy) {
      result.us = Math.min(this.decimalMultiplier((upgradeSpin.count / upgradeSpin.required) * 100), 100);
    }

    if (isStart && upgradeSpin.activeCount > 0) {
      result.r = this.transpose(startingReel).flat().toString();
      result.usr = this.transpose(reel).flat().toString();
    }
  }

  result = this.cleanObject(result);

  if (response) {
    response.g.push(result);
  } else {
    response = { g: [result] };
  }

  return response;
};

const formatTumbleBoard = (array) => {
  if (!array || !Array.isArray(array)) {
    return '';
  }

  const indexes = [];
  const values = [];

  array.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value > 0) {
        indexes.push(findNumberFromReel(rowIndex, colIndex));
        values.push(value);
      }
    });
  });

  return `${indexes.join(',')}~${values.join(',')}`;
};

const formatObject = (data, size = 7) => {
  if (!data || typeof data !== 'object' || Object.keys(data).length == 0 || Array.isArray(data)) {
    return '';
  }

  const formattedValues = Object.entries(data).map(([_, coords]) => {
    return coords.map((group) => group.map(([col, row]) => findNumberFromReel(row, col, size)).join(','));
  });

  return formattedValues.flat().join('~');
};

const formatList = (data, size = 7) => {
  if (!data || !Array.isArray(data) || data.length == 0) {
    return '';
  }
  const formattedArrays = data.map((arr) => arr.join(','));
  return formattedArrays.join('~');
};

exports.cleanObject = (obj) => {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    // Filter out empty arrays and clean nested values
    return obj
      .map(this.cleanObject)
      .filter((value) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0));
  }

  if (typeof obj === 'object' && obj !== null) {
    // Remove null, undefined, empty objects, and empty arrays from the object
    return Object.entries(obj).reduce((acc, [key, value]) => {
      const cleanedValue = this.cleanObject(value);
      if (
        cleanedValue !== null &&
        cleanedValue !== undefined &&
        !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
        !(typeof cleanedValue === 'object' && Object.keys(cleanedValue).length === 0)
      ) {
        acc[key] = cleanedValue;
      }
      return acc;
    }, {});
  }

  return obj; // Return non-object values as is
};
