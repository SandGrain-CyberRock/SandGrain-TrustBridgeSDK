export const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export const formatJson = (value: unknown): string =>
  JSON.stringify(value, null, 2);
