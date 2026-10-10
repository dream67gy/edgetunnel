import upstream from './upstream.js';
import {
  handleEat
} from './worker.js';

// Preserve any named exports or non-fetch handlers supplied by future upstream updates.
export * from './upstream.js';
export default {
  ...upstream,
  async fetch(request, env, ctx) {
    const response = await handleEat(request, env, ctx);
    return response ?? upstream.fetch(request, env, ctx);
  },
};
