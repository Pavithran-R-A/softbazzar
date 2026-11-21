export function sanitizeHTML(value) {
  return typeof value === 'string'
    ? value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character])
    : value;
}
