export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_LENGTH = 4000;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function isValidHistory(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_MESSAGES &&
    value.every(
      m =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 0 &&
        m.content.length <= MAX_MESSAGE_LENGTH,
    )
  );
}
