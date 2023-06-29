const restRequest = require("../utils/rest-client");

const { VOICE_API_BASE_URL } = require("../constants");

const registerNumbers = (RED) => {
  RED.httpNode.post("/external/voice/numbers", async (req, res) => {
    const { applicationKey, applicationSecret } = req.body;

    try {
      const resp = await restRequest({
        method: "GET",
        url: `${VOICE_API_BASE_URL}/configuration/numbers`,
        key: applicationKey,
        secret: applicationSecret,
        debug: true,
      })();
      if (resp && resp.numbers) {
        res.send(resp.numbers);
      } else {
        res.send([]);
      }
    } catch (error) {
      if (error.status) {
        return res.sendStatus(error.status);
      }
      return res.sendStatus(500);
    }
  });
};

module.exports = {
  registerNumbers,
};
