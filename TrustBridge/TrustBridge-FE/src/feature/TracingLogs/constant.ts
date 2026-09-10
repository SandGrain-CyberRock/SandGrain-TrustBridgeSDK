export const PAGE_SIZE = 30;

export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  success: { bg: '#E8F6ED', color: '#0C5928' },
  failed: { bg: '#FDECEC', color: '#832525' },
  in_progress: { bg: '#FBF0CE', color: '#54432C' },
};

export const PROCESS_TYPES = ['leaf', 'cloud', 'edge_node'];
export const STATUSES = ['success', 'failed', 'in_progress'];

export const COLUMNS = [
  { label: 'Time', w: '150px' },
  { label: 'Scope ID', w: '160px' },
  { label: 'Event Scope', w: '100px' },
  { label: 'Process', w: '130px' },
  { label: 'Step', w: 'auto' },
  { label: 'Status', w: '100px' },
  { label: 'Duration', w: '90px' },
  { label: 'Attempt', w: '80px' },
];

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

export const DATE_PRESETS: {
  label: string;
  getRange: () => [string, string];
}[] = [
  {
    label: 'Today',
    getRange: () => [toISODate(new Date()), toISODate(new Date())],
  },
  {
    label: 'Last 7 days',
    getRange: () => [toISODate(daysAgo(6)), toISODate(new Date())],
  },
  {
    label: 'Last 30 days',
    getRange: () => [toISODate(daysAgo(29)), toISODate(new Date())],
  },
  {
    label: 'This month',
    getRange: () => [toISODate(startOfMonth()), toISODate(new Date())],
  },
];
