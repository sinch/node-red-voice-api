const v8n = require('v8n');

const isDestinationType = (value) =>
  v8n()
    .string()
    .oneOfThese(['number', 'username'])
    .test(value);

v8n.extend({
  json: function() {
    return (value) => {
      try {
        JSON.parse(value);
        return true;
      } catch (e) {
        return false;
      }
    };
  },
  oneOfThese: function(list = []) {
    return (value) => list.includes(value);
  },
});

const isMessageType = (value) =>
  v8n()
    .string()
    .oneOfThese(['text', 'prompts', 'dtmf', 'svaml'])
    .test(value);

module.exports = {
  isDestinationType,
  isMessageType,
};
