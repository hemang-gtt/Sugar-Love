const axios = require('axios');

const retries = 2;
const postReq = async (
  player,
  data,
  requestType,
  playerId,
  maxRetries = retries,
  delay = 2000,
  timeout = 1000 * 10
) => {
  console.log(' i am responsibe for calling there api');

  let headers = {
    'Content-Type': 'application/json',
    'X-Hub-Consumer': player.consumerId,
  };

  let url = process.env.API_BASE_URL + requestType;
  try {
    let response = await axios.post(url, data, { headers, timeout });
    return response.data;
  } catch (error) {
    if (error?.response?.data?.code === 'invalid.session.key') {
      let finalError = {
        status: error?.response?.data?.code,
        message: error?.response?.data?.message,
      };
      throw finalError;
    }

    if (error?.response?.data?.code === 'invalid.request.data') {
      let finalError = {
        status: error?.response?.data?.code,
        message: error?.response?.data?.message,
      };

      throw finalError;
    }

    console.log(error);
    throw error;
  }
};
module.exports = { postReq };

// this is how our final error looks like
// let finalError = {
//     status: error?.response?.data?.code,
//     message: error?.response?.data?.message,
//   };
//   throw finalError;
