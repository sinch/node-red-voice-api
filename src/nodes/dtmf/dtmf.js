const VoiceNode = require('../../utils/voice-node');

module.exports = function(RED) {
  class Dtmf extends VoiceNode {
    constructor(config) {
      super(config);
      this.config = config;
      RED.nodes.createNode(this, config);

      this.on('input', async (msg, _, done) => {
        const { voiceCall } = msg || {};
        if (voiceCall != null) {
          // set this node as next node for current conversation, many dtmf nodes can be marked
          // as current by placing the callId in the context, the route method in application.js
          // will pick the right one based on config.action
          // await this.setCallId(voiceCall.callId);
          await this.markCallId(voiceCall.callId);
          await this.setSVAML(voiceCall.callId, this.config.svaml);
        }
        done();
      });
    }

    async proxyEvent(msg) {
      this.send({
        voiceCall: {
          raw: msg,
          callId: msg.callid,
          from: msg.cli,
          to: msg.to,
        },
        payload: msg,
      });
    }
  }

  RED.nodes.registerType('sinch-voice-dtmf', Dtmf);
};
