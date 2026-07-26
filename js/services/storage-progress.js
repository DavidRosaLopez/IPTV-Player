import { createJsonStorage } from './storage-json.js';

const { get: _get, set: _set, del: _del } = createJsonStorage();

export const StorageProgress = {
  getEpisodeProgress: (epId) => _get('ep_prog_' + epId, null),
  setEpisodeProgress: (epId, ms) => _set('ep_prog_' + epId, ms),
  clearEpisodeProgress: (epId) => _del('ep_prog_' + epId),
};
