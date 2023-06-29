const VoiceNode = require('../../utils/voice-node');

module.exports = function(RED) {
  class IncomingCall extends VoiceNode {
    constructor(config) {
      super(config);
      this.config = config;
      RED.nodes.createNode(this, config);
    }

    async proxyEvent(msg) {
      if (msg.event === 'ice') {
        this.send({
          voiceCall: {
            raw: msg,
            callId: msg.callid,
            from: msg.cli,
            to: msg.to,
          },
          payload: msg,
        });
        // call received
        this.status({ fill: 'green', shape: 'dot', text: 'ongoing' });
        await this.markCallId(msg.callid);
      } else if (msg.event === 'dice') {
        this.status({ fill: 'green', shape: 'dot', text: 'closed' });
        await this.clearCallId(msg.callid);
      }
    }

    async getSVAML() {
      return Promise.resolve(this.config.svaml);
    }
  }

  RED.nodes.registerType('sinch-voice-incoming-call', IncomingCall);
};
