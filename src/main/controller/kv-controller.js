const { serviceRegistry } = require('../entity/service-registry');

const setKv = (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ message: 'Key is required' });
  }
  serviceRegistry.setKv(key, value);
  res.status(200).json({ message: 'Key set successfully' });
};

const getKv = (req, res) => {
  const { key } = req.query;
  if (!key) {
    return res.status(400).json({ message: 'Key is required' });
  }
  const value = serviceRegistry.getKv(key);
  if (value === undefined) {
    return res.status(404).json({ message: 'Key not found' });
  }
  res.status(200).json({ key, value });
};

const deleteKv = (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ message: 'Key is required' });
  }
  const deleted = serviceRegistry.deleteKv(key);
  if (!deleted) {
    return res.status(404).json({ message: 'Key not found' });
  }
  res.status(200).json({ message: 'Key deleted successfully' });
};

const getAllKv = (req, res) => {
  const kv = serviceRegistry.getAllKv();
  res.status(200).json(kv);
};

module.exports = {
  setKv,
  getKv,
  deleteKv,
  getAllKv,
};
