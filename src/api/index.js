const { registerNumbers } = require('./voice-api');

module.exports = function(RED) {
  registerNumbers(RED);
};
