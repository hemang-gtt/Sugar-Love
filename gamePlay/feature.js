const { table2, table3, table2_US_Buy, table3_US_Buy } = require('../weights/tables');
const gameutils = require('./gameUtils');

exports.spotMultiplier = (grid, matches) => {
  const sum = new Map();

  for (const key in matches) {
    for (let i = 0; i < matches[key].length; i++) {
      const coordinates = matches[key][i];
      const id = gameutils.getId(key, coordinates);

      for (const [row, col] of coordinates) {
        // Calculate Spot Multiplier Sum
        if (grid[row][col] > 1) {
          if (sum.has(id)) {
            sum.set(id, sum.get(id) + grid[row][col]);
          } else {
            sum.set(id, grid[row][col]);
          }
        }

        // Check if the grid value is 0; set to 1, otherwise double it
        if (grid[row][col] === 0) {
          grid[row][col] = 1;
        } else {
          grid[row][col] = Math.min(grid[row][col] * 2, 1024); // Double value, cap at 1024
        }
      }
    }
  }
  return [grid, sum];
};

exports.upgradeSpin = (board, isUpgradeSpinBuy) => {
  let numberOfLowerSymbols = 0,
    convertedToHigh = '';
  if (isUpgradeSpinBuy) {
    numberOfLowerSymbols = gameutils.getKeyBasedOnWeights(table2_US_Buy, 'symbols'); // numberOfLowerSymbols to be replaced
    convertedToHigh = gameutils.getKeyBasedOnWeights(table3_US_Buy, 'symbols');
  } else {
    numberOfLowerSymbols = gameutils.getKeyBasedOnWeights(table2, 'symbols'); // numberOfLowerSymbols to be replaced
    convertedToHigh = gameutils.getKeyBasedOnWeights(table3, 'symbols');
  }
  if (typeof board[0][0] == 'number') {
    convertedToHigh = gameutils.getIndex[convertedToHigh];
  }

  for (let i = 0; i < board.length; i++) {
    for (let j = 0; j < board[i].length; j++) {
      const symbol = board[i][j];
      if (gameutils.lowerSymbols[numberOfLowerSymbols].includes(symbol)) {
        board[i][j] = convertedToHigh;
      }
    }
  }

  return board;
};
