const getParams = require('../../utils/get-params');
const restRequest = require('../../utils/rest-client');
const VoiceNode = require('../../utils/voice-node');
const { isMessageType, isDestinationType } = require('../../utils/validators');
const { VOICE_API_BASE_URL } = require('../../constants');

const isInteractiveMenu = (text) => text.toLowerCase().includes('runmenu');

module.exports = function(RED) {
  class VoiceCall extends VoiceNode {
    constructor(config) {
      super(config);
      const node = this;
      this.config = config;
      RED.nodes.createNode(this, config);

      const applicationNode = RED.nodes.getNode(config.application) || {};
      const { applicationKey, applicationSecret } =
        applicationNode.config || {};
      if (
        applicationKey == null ||
        applicationSecret == null ||
        applicationKey === '' ||
        applicationSecret === ''
      ) {
        this.error('applicationKey or applicationSecret are empty');
        return;
      }

      const callCallout = restRequest({
        method: 'POST',
        url: `${VOICE_API_BASE_URL}/callouts`,
        key: applicationKey,
        secret: applicationSecret,
      });

      this.on('input', async (msg, _, done) => {
        const {
          destinationType,
          destinationEndpoint,
          svaml,
          messageType,
          text,
          prompts,
          dtmf,
          locale,
          debug,
          errors,
          stringErrors,
          cli,
        } = getParams(
          {
            schema: {
              destinationType: { type: isDestinationType, required: true },
              destinationEndpoint: { type: 'phoneNumber', required: true },
              cli: { type: 'phoneNumber', required: false },
              messageType: { type: isMessageType, required: true },
              svaml: {
                type: 'json',
                required: ({ messageType }) => messageType === 'svaml',
              },
              text: {
                type: 'string',
                required: ({ messageType }) => messageType === 'text',
              },
              prompts: {
                type: 'string',
                required: ({ messageType }) => messageType === 'prompts',
              },
              dtmf: {
                type: 'string',
                required: ({ messageType }) => messageType === 'dtmf',
              },
              locale: 'string',
              debug: 'boolean',
            },
            useMessage: true,
            usePayload: true,
          },
          node,
          msg
        );

        // exit if errors
        if (errors != null) {
          this.error('configuration errors', JSON.stringify(errors));
          done(stringErrors);
          return;
        }

        this.status({ fill: 'yellow', shape: 'dot', text: 'calling' });
        let resp, payload;

        if (
          messageType === 'svaml' &&
          svaml != null &&
          isInteractiveMenu(svaml)
        ) {
          // docs https://developers.sinch.com/docs/voice-rest-api-calling-api#custom-callout
          // for interactive menu on callout, use custom callout (it's an edge case)
          payload = {
            method: 'customCallout',
            customCallout: {
              ice: JSON.stringify({
                action: {
                  name: 'connectPstn',
                  number: destinationEndpoint,
                  cli,
                  maxDuration: 14400,
                  amd: { enabled: false },
                  locale,
                },
              }),
            },
          };
        } else {
          // docs https://developers.sinch.com/docs/voice-rest-api-calling-api#text-to-speech-callout
          payload = {
            method: 'ttsCallout',
            ttsCallout: {
              cli,
              destination: {
                type: destinationType,
                endpoint: destinationEndpoint,
              },
              custom: node.id,
              enableAce: true,
              enableDice: true,
            },
          };
          if (messageType === 'text') {
            payload.ttsCallout.text = text;
            payload.ttsCallout.locale = locale;
            // disable ace callback for text or will not work
            payload.ttsCallout.enableAce = false;
          } else if (messageType === 'svaml') {
            payload.ttsCallout.text = ' '; // must be provided, trick it
            //await this.setSVAML(svaml);
          } else if (messageType === 'prompts') {
            payload.ttsCallout.prompts = prompts;
            payload.ttsCallout.locale = locale;
            // disable ace callback for prompts or will not work
            payload.ttsCallout.enableAce = false;
          } else if (messageType === 'dtmf') {
            payload.ttsCallout.dtmf = dtmf;
            // disable ace callback for prompts or will not work
            payload.ttsCallout.enableAce = false;
          }
        }

        try {
          if (debug) {
            node.warn(
              `VOICE CALL POST ${VOICE_API_BASE_URL}/callouts:`,
              JSON.stringify(payload)
            );
          }
          resp = await callCallout(payload);
          if (debug) {
            node.warn('VOICE CALL RESPONSE ', JSON.stringify(resp.data));
          }
          if (resp.data.errorCode) {
            this.status({ fill: 'red', shape: 'dot', text: resp.data.message });
            done(resp.data.message);
            return;
          }
          if (svaml != null && svaml !== '') {
            await this.setSVAML(resp.data.callId, svaml);
          }
          await this.markCallId(resp.data.callId);
          node.warn(
            `Voice call ${resp.data.callId}`,
            JSON.stringify(payload)
          );
          done();
        } catch (error) {
          done(error);
          this.status({ fill: 'red', shape: 'dot', text: 'network error' });
          node.error('network error');
        }
      });
    }

    async getSVAML(callId) {
      // get svaml and consume it
      const svaml = await this.get(`${callId}_svaml`);
      await this.remove(`${callId}_svaml`);
      return svaml;
    }

    // handle messages received by callback for the call originated by this node
    async proxyEvent(msg) {
      if (msg.event === 'ace') {
        // call started
        this.status({ fill: 'green', shape: 'dot', text: 'ongoing' });
        // continue to the exit including the voice call detail, this is useful in case of
        // interactive menus initiated by the servers
        this.send({
          voiceCall: {
            raw: null,
            callId: msg.callid,
            from: null,
            to: null,
          },
        });
      } else if (msg.event === 'dice') {
        // communication was closed, check combinations to redirect to the success output
        // or the fail one
        // Some real cases:
        // User answered the call but then hangup: ANSWERED/CALLEEHANGUP -> ANSWERED/CALLERHANGUP
        // User doesn't answer: NOANSWER
        // User rejects the call: BUSY/CANCEL
        // User answer and conversation reach the end: ANSWERED/CALLERHANGUP

        // remove the call from the storage, the connection is closed
        await this.clearCallId(msg.callid);

        const message = {
          payload: msg,
        };
        if (msg.result === 'NOANSWER') {
          this.status({ fill: 'red', shape: 'dot', text: 'no answer' });
          this.send([null, message]);
        } else if (msg.result === 'BUSY') {
          this.status({ fill: 'red', shape: 'dot', text: 'busy' });
          this.send([null, message]);
        } else if (msg.result === 'FAILED') {
          this.status({ fill: 'red', shape: 'dot', text: 'failed' });
          this.send([null, message]);
        } else if (msg.result === 'ANSWERED' && msg.reason === 'CALLEEHANGUP') {
          // the callee closed the call, means not completed, means was not successful, this is tricky since
          // API after a CALLEEHANGUP sends a CALLERHANGUP, that may be mistaked as signal of a succesfull call
          // but since the call is removed from the calls storage, this callback never receives the second event
          this.status({ fill: 'red', shape: 'dot', text: 'callee hang-up' });
          this.send([null, message]);
        } else if (msg.result === 'ANSWERED' && msg.reason === 'CALLERHANGUP') {
          // if the caller hangs-up, means the call was closed by the app, ended naturally
          // so it successful
          this.status({ fill: 'green', shape: 'dot', text: 'closed' });
          this.send([message, null]);
        } else if (
          msg.result === 'ANSWERED' &&
          msg.reason === 'MANAGERHANGUP'
        ) {
          // closed by the call manager naturally
          this.status({ fill: 'green', shape: 'dot', text: 'closed by mngr' });
          this.send([message, null]);
        }
      }
    }
  }

  RED.nodes.registerType('sinch-voice-call', VoiceCall);
};
