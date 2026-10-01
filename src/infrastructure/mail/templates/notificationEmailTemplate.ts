import escapeHtml from 'escape-html';

export function renderNotificationEmail(
  display: { title: string; body: string },
  url: string,
) {
  return `<h1>${escapeHtml(display.title)}</h1><p>${escapeHtml(display.body)}</p><p><a href="${escapeHtml(url)}">View notifications</a></p>`;
}
