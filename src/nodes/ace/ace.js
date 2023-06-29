const VoiceNode = require('../../utils/voice-node');

module.exports = function(RED) {
  class AnsweredCallEvent extends VoiceNode {
    constructor(config) {
      super(config);
      this.config = config;
      RED.nodes.createNode(this, config);

      this.on('input', async (msg, _, done) => {
        const { voiceCall } = msg || {};
        if (voiceCall != null) {
          // set the SVAML for an ACE event, connect this to any inbound or outbound node
          // to mark this node (and SVAML with the right callId)
          await this.setSVAML(
            voiceCall.callId,
            msg.svaml ? msg.svaml : this.config.svaml
          );
          await this.markCallId(voiceCall.callId);
        }
        done();
      });
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
  }

  RED.nodes.registerType('sinch-voice-answered-call-event', AnsweredCallEvent);
};
