import { renderShare } from '../../lib/share.js';

export const onRequestGet = ({ params, request, env }) =>
  renderShare('user', String(params.id || ''), request, env);
