const sinchRequest = require('sinch-request');
const https = require('https');
const url = require('url');

const Request = function(options, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(options.url);
    const port = options.url.includes('https') ? 443 : 80;
    const requestOptions = {
      method: 'POST',
      host: parsedUrl.host,
      port,
      path: parsedUrl.path,
      data: JSON.stringify(data),
      withCredentials: false,
    };
    // Add authentication header (application)
    sinchRequest.applicationSigned(requestOptions, {
      key: options.key,
      secret: options.secret,
    });
    // Perform the request
    const req = https.request(requestOptions, (response) => {
      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        if (options.debug) {
          console.log('Response body: ' + data);
        }
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          reject(`Error parsing response: ${data}`);
        }
        resolve({ data: parsed, response });
      });
    });
    req.end(requestOptions.data);
  });
};

module.exports = function() {
  const args = Array.from(arguments);
  if (arguments.length === 2) {
    return Request(...args);
  } else {
    return (data) => Request(args[0], data);
  }
};
