const validators = {
  function: (value) => typeof value === "function",
  boolean: (value) => value === true || value === false,
  string: (value) => typeof value === "string" && value !== "",
  object: (value) => typeof value === "object" && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  phoneNumber: (value) => {
    if (!validators.string(value)) {
      return false;
    }
    if (value === "") {
      throw "phone number cannot be an empty string";
    }
    if (!value.startsWith("+")) {
      throw "phone number must start with a +";
    }
    return true;
  },
  json: (value) => {
    try {
      JSON.parse(value);
      return true;
    } catch (e) {
      return false;
    }
  },
};

// get the first valid value, scanning the provided contexts (usually config, msg, msg.payload)
function extractParam(name, validator, contexts) {
  const currentContext = contexts.find((context) => {
    // only if a value is specified, otherwise skip
    if (context != null && context[name] != null) {
      try {
        if (validator(context[name])) {
          return true;
        }
      } catch (e) {
        // do nothinh
      }
    }
    return false;
  });

  return currentContext != null ? currentContext[name] : null;
}

function getValidationError(name, validator, contexts) {
  // get the first context with a non null value for the param name (it will be the wrong one)
  const notEmptyContext = contexts.find(
    (context) => context != null && context[name] != null
  );
  // if there's not context with a non null value for this parameter, perhaps was mispelled
  if (notEmptyContext == null) {
    return `param doesn't exist (mispelled?)`;
  }
  // get the exception, if any, and convert to string, if no expection return null a default
  // value will be provided
  try {
    validator(notEmptyContext[name]);
  } catch (e) {
    return e.toString();
  }
  return null;
}

/**
 * getParams
 * Example of use
 *   const { myString, myBoolean, myGenericValue, errors } = getParams({
 *     schema: {
 *       myBoolean: 'boolean',
 *       myString: { type: 'string', required: true },
 *       myGenericValue: { type: isMyType, required: true }
 *     },
 *     useMessage: true
 *   }, node, msg);
 *   if (errors != null) {
 *     return;
 *   }
 * The schema object contains all the keys that should be extracted from node.config (or Node-RED message and/or)
 * payload if enabled.
 * For each key of the schema object, the value could be
 * - a string for basic value type: string, function, boolean, object, array, phoneNumber, json
 * - nd object with type and required keys (by default a param is not required)
 * The type could be a string for basic value types or a function that takes a value and returns true  if the value
 * is valid and - optionally - throws and exception to provide some feedback on invalid values
 * For example:
 *   // this checks if a string looks like a number
 *   const isNumeric = value => {
 *     if (value == null || value === '') {
 *       // value is empty, just return false
 *       return false;
 *     }
 *     if (isNaN(parseInt(value, 10))) {
 *       throw 'Should contains only numbers';
 *     }
 *     return true;
 *   }
 * Extract params from the node config or the incoming messages based on the schema provided in the options
 *
 * @param {Object} options
 * @param {Object} options.schema - The schema defition
 * @param {Boolean} options.useMessage - Also use incoming message to get a valid value for the params,
 * in case the configuration of the nodes is set in the upstream node
 * @param {Boolean} options.usePayload -  Also use incoming message payload to get a valid value for the params,
 * in case the configuration of the nodes is set in the upstream node
 * @param {Object} node - The Node-RED node
 * @param {Object} msg - The message received by the node
 * @return {Object}
 * @return {Object} result.errors - An hash with validation error messages
 */
module.exports = (options, node, msg) => {
  const { useMessage = false, usePayload = false, schema } = options || {};

  const params = {};
  const errors = {};

  const contexts = [node.config];
  if (useMessage) {
    contexts.push(msg);
  }
  if (usePayload) {
    contexts.push(msg.payload);
  }

  Object.entries(schema).forEach(([name, definition]) => {
    if (validators.string(definition)) {
      if (validators[definition] == null) {
        console.warn(`[Param: ${name}] Uknown validator: ${definition}`);
        return;
      }
      // by default is not required, discard the error
      const value = extractParam(name, validators[definition], contexts);
      params[name] = value;
    } else if (validators.object(definition)) {
      let { required } = definition;
      const { type, message } = definition;
      if (validators.function(required)) {
        required = required(params);
      } else if (!validators.boolean(required)) {
        required = false;
      }
      if (type == null || type === "") {
        console.log("[Param: ${name}] Missing validator type");
        return;
      }
      if (validators.string(type) && validators[type] == null) {
        console.error(`[Param: ${name}] Uknown validator: ${type}`);
        return;
      } else if (!validators.function(type) && !validators.string(type)) {
        console.error(
          `[Param: ${name}] Validator type must be either a string or a function`
        );
        return;
      }

      const value = extractParam(
        name,
        validators.function(type) ? type : validators[type],
        contexts
      );

      if (value == null && required) {
        if (message != null) {
          errors[name] = message;
        } else {
          const exceptionError = getValidationError(
            name,
            validators.function(type) ? type : validators[type],
            contexts
          );
          if (exceptionError != null) {
            errors[name] = `Param "${name}" is invalid: ${exceptionError}`;
          } else {
            errors[name] = `Param "${name}" is required`;
          }
        }
      }
      // store the value
      params[name] = value;
    }
  });

  const hasErrors = Object.keys(errors).length !== 0;

  return {
    ...params,
    errors: hasErrors ? errors : null,
    stringErrors: hasErrors
      ? Object.keys(errors)
          .map((key) => `${key}: ${errors[key]}`)
          .join(", ")
      : null,
  };
};
