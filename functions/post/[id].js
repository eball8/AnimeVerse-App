import { renderShare } from '../../lib/share.js';

export const onRequestGet = ({ params, request, env }) =>
  renderShare('post', String(params.id || ''), request, env);
