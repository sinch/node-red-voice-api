const isEmpty = (obj) =>
  obj === null ||
  obj === undefined ||
  obj === '' ||
  (Array.isArray(obj) && obj.length === 0);

module.exports = isEmpty;
