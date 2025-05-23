const jwt = require('jsonwebtoken');
const axios = require('axios');
const { redisClient: redis, redisDb } = require('../DB/redis');
const getTodayDateTime = () => {
  const currentDate = new Date();

  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');

  const hours = String(currentDate.getHours()).padStart(2, '0');
  const minutes = String(currentDate.getMinutes()).padStart(2, '0');
  const seconds = String(currentDate.getSeconds()).padStart(2, '0');

  const formattedDateTime = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  return formattedDateTime;
};

const hasDateChanged = (epoch1, epoch2) => {
  const date1 = new Date(epoch1 * 1000);
  const date2 = new Date(epoch2 * 1000);

  const year1 = date1.getUTCFullYear;
  const month1 = date1.getUTCMonth;
  const day1 = date1.getUTCDay;

  const year2 = date2.getUTCFullYear;
  const month2 = date2.getUTCMonth;
  const day2 = date2.getUTCDay;

  return (year1 !== year2) & (month1 !== month2) && day1 !== date2;
};

const isValidUserId = (userId, urlToken) => {
  const tokenData = jwt.verify(urlToken, process.env.JWT_SECRET_KEY);
  return tokenData.userId === userId;
};

const hasPreviousSession = async (userId, urlToken) => {
  console.log('userId', userId);
  let existingToken = await redis.get(`${redisDb}-user:${userId}`);
  console.log(`existing token are ------${existingToken}`);

  if (existingToken && existingToken === urlToken) {
    console.log('now we are here---------');
    let userExists = await redis.get(`${redisDb}-token:${urlToken}`);
    if (!userExists) {
      return false;
    }
  }

  return true;
};

const getTokenDetails = (urlToken) => {
  console.log('url token is ---------', urlToken);
  const tokenData = jwt.verify(urlToken, process.env.JWT_SECRET_KEY);

  return tokenData;
};

const isValidCurrencyProxy = async (currency) => {
  try {
    // "en"
    let finalURL = process.env.CURRENCY_URL + `/is-valid-currency/${currency}`;
    const headers = { info: process.env.DbName };
    let response = await axios.get(finalURL, { headers, timeout: 10000 });
    return { status: 'SUCCESS', ...response.data };
  } catch (error) {
    console.log('error is ----', error);
    return {
      status: 'ERROR',
      currency: currency,
      isValid: false,
    };
  }
};

const currencyAPIProxy = async (currency, min, max, step = null, isStepArray = false) => {
  try {
    let finalURL = process.env.CURRENCY_URL + `/get-currency/${currency}/${min}/${max}`;
    if (step != null) finalURL += `/${step}`;
    if (isStepArray) finalURL += `/${isStepArray}`;

    const headers = { info: process.env.DbName };
    let resp = await axios.get(finalURL, { headers, timeout: 10000 });
    return { status: 1, ...resp.data };
  } catch (error) {
    let resp = {
      status: 0,
      message: 'Request timed out',
      min,
      max,
      base: Math.max(min, 1),
    };

    if (step != null) resp.step = step;
    const arr = [];
    if (step && isStepArray) {
      let minInt = min * 100,
        maxInt = max * 100,
        stepInt = step * 100;
      for (let i = minInt; i <= maxInt; i += stepInt) {
        arr.push(Number((i / 100).toFixed(2)));
      }
      resp.arr = arr;
    }

    return resp;
  }
};

module.exports = {
  getTodayDateTime,
  hasDateChanged,
  isValidUserId,
  hasPreviousSession,
  getTokenDetails,
  isValidCurrencyProxy,
  currencyAPIProxy,
};
