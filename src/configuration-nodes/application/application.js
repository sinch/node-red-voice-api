const { getNodesByType, findNodeByType } = require('../../utils/helpers');
const isEmpty = require('../../utils/is-empty');
const waitFor = require('../../utils/wait-for');

module.exports = function(RED) {
  class ApplicationNode {
    constructor(config) {
      RED.nodes.createNode(this, config);
      this.config = config;
    }

    /**
     * getCallNode
     * Get the Voice Call node (sinch-voice-call) that originated the call based on the callId in the msg payload
     * @param {Object} msg - The payload received by callback event
     * @returns {Object} - A node instance
     */
    async getCallNode(msg) {
      let foundNode = null;
      // collect all voice call nodes
      const callNodes = getNodesByType('sinch-voice-call', RED);

      for (let idx = 0; idx < callNodes.length; idx++) {
        if (foundNode == null) {
          const callNode = RED.nodes.getNode(callNodes[idx].id);
          if (callNode != null && (await callNode.hasCallId(msg.callid))) {
            foundNode = callNode;
          }
        }
      }

      return foundNode;
    }

    async getCallorIncomingNode(msg) {
      let foundNode = null;
      // collect all voice call nodes
      const nodes = getNodesByType(
        ['sinch-voice-call', 'sinch-voice-incoming-call'],
        RED
      );

      for (let idx = 0; idx < nodes.length; idx++) {
        if (foundNode == null) {
          const callNode = RED.nodes.getNode(nodes[idx].id);
          if (callNode != null && (await callNode.hasCallId(msg.callid))) {
            foundNode = callNode;
          }
        }
      }

      return foundNode;
    }

    /**
     * cleanupACENodes
     * Clean svaml and call flag for all ACE nodes given a callId
     * @param {String} callId - The call id to clear
     */
    async cleanupACENodes(callId) {
      // collect all ace nodes
      const nodes = getNodesByType('sinch-voice-answered-call-event', RED);
      for (let idx = 0; idx < nodes.length; idx++) {
        const node = RED.nodes.getNode(nodes[idx].id);
        if (node != null && (await node.hasCallId(callId))) {
          await node.clearCallId(callId);
        }
      }
    }

    /**
     * cleanupDTMFNodes
     * Remove metadata from all DTMF nodes for a specific callId
     * @param {String} callId - The call id to clear
     */
    async cleanupDTMFNodes(callId) {
      // collect all dtmf nodes
      const dtmfNodes = getNodesByType('sinch-voice-dtmf', RED);
      for (let idx = 0; idx < dtmfNodes.length; idx++) {
        const dtmfNode = RED.nodes.getNode(dtmfNodes[idx].id);
        if (dtmfNode != null && (await dtmfNode.hasCallId(callId))) {
          await dtmfNode.clearCallId(callId);
        }
      }
    }

    /**
     * getDTMFNode
     * Get the node instance of a DTMF node assigned to the same callId of the incoming message and the right action
     * from the user
     * @param {Object} msg - The payload received by callback event
     * @return {Object}
     */
    async getDTMFNode(msg) {
      let foundNode = null;
      // collect all dtmf nodes
      const dtmfNodes = getNodesByType('sinch-voice-dtmf', RED);

      // find the one with the right callId and the right action (based on incoming message)
      for (let idx = 0; idx < dtmfNodes.length; idx++) {
        if (foundNode == null) {
          const dtmfNode = RED.nodes.getNode(dtmfNodes[idx].id);
          const action = msg.menuResult != null ? msg.menuResult.value : null;
          //if ((await dtmfNode.getCallId()) === msg.callid) {
          if (await dtmfNode.hasCallId(msg.callid)) {
            // if action is the same
            if (dtmfNode.config.action === action) {
              foundNode = dtmfNode;
            }
          }
        }
      }

      return foundNode;
    }

    /**
     * getIncomingNode
     * Search all incoming call node and find the one with the right number (based on incoming message)
     * @param {Object} msg - The payload received by callback event
     */
    getIncomingNode(msg) {
      let foundNode = null;
      // find all sinch-voice-incoming-call and proxy the event (the nodes will decide to pickup or not)
      RED.nodes.eachNode((node) => {
        let incomingCallNode;
        if (node.type === 'sinch-voice-incoming-call') {
          incomingCallNode = RED.nodes.getNode(node.id);
          // check if destination endpoint is the right one (we may have different incoming call node
          // with different numbers)
          if (
            incomingCallNode != null &&
            incomingCallNode.config != null &&
            incomingCallNode.config.endpoint === msg.to.endpoint
          ) {
            foundNode = incomingCallNode;
          }
        }
      });
      return foundNode;
    }

    /**
     * waitForACENode
     * Wait for an ACE node to have a callId flag and a SVAML for it. If nothing after 3sec then fail
     * @param {Object} msg
     * @param {Object} msg.callid - The callId to wait for
     * @returns {Object}
     */
    async waitForACENode(msg) {
      let idx = 0;
      const delays = [100, 300, 500, 1000, 2000, 3000];

      return new Promise(async (resolve, reject) => {
        for (idx = 0; idx < delays.length - 1; idx++) {
          const node = this.getACENode(msg);
          if (node) {
            const payload = await node.getSVAML(msg.callid);
            if (!isEmpty(payload)) {
              resolve(payload);
              break;
            }
          }
          await waitFor(delays[idx]);
        }
        reject();
      });
    }

    /**
     * getACENode
     * Get the first ACE node marked with the callId
     * @param {*} msg
     * @param {Object} msg
     * @param {Object} msg.callid - The callId to wait for
     * @returns {NodeREDNode}
     */
    getACENode(msg) {
      let foundNode = null;
      // find all sinch-voice-answered-call-event
      RED.nodes.eachNode((node) => {
        let ACENode;
        if (node.type === 'sinch-voice-answered-call-event') {
          ACENode = RED.nodes.getNode(node.id);
          // check if destination endpoint is the right one (we may have different incoming call node
          // with different numbers)
          if (ACENode != null && ACENode.hasCallId(msg.callid)) {
            foundNode = ACENode;
          }
        }
      });
      return foundNode;
    }
  }

  RED.nodes.registerType('sinch-application', ApplicationNode, {
    credentials: {
      applicationSecret: {
        type: 'text',
      },
    },
  });

  // This endpoint handles all callback events for Voice API (Ace, Dice, Pie, Notify)
  RED.httpNode.use('/sinch-voice-api/callback', async (req, res) => {
    // get the first sinch-application type node, it will act as proxy node, redirecting
    // the message to the correct node based on the callId (in order to that is necessary a NODE-RED nodes
    // since they can access the context)
    // Callids are now stored in global context, so any sinch-application node is ok, in case is stored in the
    // flow context, the proper sinch-appllication node must be selected
    const proxyNode = findNodeByType('sinch-application', RED);
    if (proxyNode == null) {
      console.log('No Voice Application configured, message was discarded');
      res.sendStatus(500);
      return;
    }
    let payload;

    if (req.body.event === 'pie') {
      // get all current nodes based on callId and proxy the event only on the one with the
      // right action
      const dtmfNode = await proxyNode.getDTMFNode(req.body);
      if (dtmfNode) {
        payload = await dtmfNode.getSVAML(req.body.callid);
        await proxyNode.cleanupDTMFNodes(req.body.callid);
        await dtmfNode.proxyEvent(req.body);
      } else {
        console.log(
          `No DTMF node for this user answer (action: ${req.body.menuResult.value}), message was discarded`
        );
        res.sendStatus(500);
        return;
      }
    } else if (req.body.event === 'ice') {
      // incoming call, ask the proxy node to find the right incoming call node and
      // get the answer
      const incomingNode = proxyNode.getIncomingNode(req.body);
      if (incomingNode != null) {
        // get the SVAML payload for this call and use as response callback
        // there's no callId stored in incoming nodes
        payload = await incomingNode.getSVAML();

        // proxy the event (the node knows what to send through the outputs)
        await incomingNode.proxyEvent(req.body);
        // if payload is empty, means the Node-RED devs don't want to answer with a SVAML now
        // but it will be provided by a node downstream (i.e. an ACE node). Any SVAML provided by
        // these nodes will mark the callId flag and store the SVAML payload in the node context.
        // Unfortunately the answer must be returned within this callback, so the proxyEvent continues
        // the execution of the flow and waitForAceNode waits for the right callId
        if (isEmpty(payload)) {
          try {
            payload = await proxyNode.waitForACENode(req.body);
          } catch (e) {
            console.log(
              `No SVAML provided downstream by any ACE node for callId ${req.body.callid}`
            );
          }
        }
      } else {
        console.log(
          `No incoming call node for number ${req.body.to.endpoint}, message was discarded`
        );
        res.sendStatus(500);
        return;
      }
    } else if (req.body.event === 'ace') {
      // get ace and call nodes for this call id (ACE = Answered Call Event)
      const ACENode = proxyNode.getACENode(req.body);
      const callNode = await proxyNode.getCallNode(req.body);
      // Note: when connecting to a SIP address an additional ACE is received from
      // the system we're trying to connect to, in that case we must answer with the
      // same SVAML of the ICE (Incoming Call Event)
      if (callNode != null) {
        // get the SVAML payload for this call and use as response callback
        payload = await callNode.getSVAML(req.body.callid);
        // proxy the event (the node knows what to send through the outputs)
        await callNode.proxyEvent(req.body);
      } else if (ACENode != null) {
        payload = await ACENode.getSVAML(req.body.callid);
        // proxy the event (the node knows what to send through the outputs)
        await ACENode.proxyEvent(req.body);
        await ACENode.clearCallId(req.body.callid);
      } else {
        console.log(
          `No call node for callId ${req.body.callid}, message was discarded`
        );
        res.sendStatus(500);
        return;
      }
    } else if (req.body.event === 'dice') {
      // clean ACE nodes
      await proxyNode.cleanupACENodes(req.body.callid);
      // get the right call node based on callId
      const callNode = await proxyNode.getCallorIncomingNode(req.body);
      if (callNode != null) {
        // proxy the event (the node knows what to send through the outputs)
        await callNode.proxyEvent(req.body);
      } else {
        console.log(
          `No call node for callId ${req.body.callid}, message was discarded`
        );
        res.sendStatus(500);
        return;
      }
    }

    if (payload != null) {
      res.send(payload);
    } else {
      res.sendStatus(200);
    }
  });
};
