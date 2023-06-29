const getNodesByType = (type, RED) => {
  const nodes = [];
  const types = Array.isArray(type) ? type : [type];
  RED.nodes.eachNode((node) => {
    if (types.includes(node.type)) {
      nodes.push(node);
    }
  });
  return nodes;
};

const findNode = (cb, RED) => {
    let node;
  
    RED.nodes.eachNode((n) => {
      if (node) return;
      if (cb(n)) node = n;
    });
  
    return RED.nodes.getNode(node.id);
  };

const findNodeByType = (nodeType, RED) => {
  return findNode((node) => node.type === nodeType, RED);
};

module.exports = { getNodesByType, findNode, findNodeByType };
