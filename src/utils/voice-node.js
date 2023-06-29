class VoiceNode {
  /**
   * get
   * Get a key from the node context
   * @async
   * @param {string} key
   * @returns {Promise<*>}
   */
  async get(key) {
    return new Promise((resolve, reject) => {
      this.context().get(key, (err, value) => {
        if (err) {
          reject(err);
        } else {
          resolve(value);
        }
      });
    });
  }

  /**
   * set
   * Set a value in the node context
   * @async
   * @param {string} key
   * @param {*} value
   */
  async set(key, value) {
    return new Promise((resolve, reject) => {
      this.context().set(key, value, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * remove
   * @async
   * @param {string} key
   */
  async remove(key) {
    await this.set(key, undefined);
  }

  /**
   * hasCallId
   * Returns true if the Node-RED node is marked to belong to a voice call (callId)
   * @async
   * @param {string} callId
   * @returns {boolean}
   */
  async hasCallId(callId) {
    return (await this.get(callId)) != null;
  }

  /**
   * markCallId
   * Mark the current node to belong to a voice call (callId)
   * @async
   * @param {string} callId
   */
  async markCallId(callId) {
    await this.set(callId, true);
  }

  /**
   * clearCallId
   * Release the node from a voice call (callId)
   * @param {string} callId
   */
  async clearCallId(callId) {
    await this.remove(callId);
    await this.remove(`${callId}_svaml`);
  }

  /**
   * setSVAML
   * Set the Sinch Voice Markup language for the current node, it can be generate dinamically, must be stored
   * in the node context with the callId that generated it (and not taken from config)
   * @async
   * @param {string} callId
   * @param {string} svaml - The markup language
   */
  async setSVAML(callId, svaml) {
    await this.set(`${callId}_svaml`, svaml);
  }

  /**
   * getSVAML
   * Get the current SVAML for this node related to a voice call (callId)
   * @async
   * @param {string} callId
   * @returns {Promise<string>}
   */
  async getSVAML(callId) {
    return await this.get(`${callId}_svaml`);
  }
}

module.exports = VoiceNode;
