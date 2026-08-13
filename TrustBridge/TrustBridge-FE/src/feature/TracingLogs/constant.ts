export const PAGE_SIZE = 30;

export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  success: { bg: '#E8F6ED', color: '#0C5928' },
  failed: { bg: '#FDECEC', color: '#832525' },
  in_progress: { bg: '#FBF0CE', color: '#54432C' },
};

export const PROCESS_TYPES = [
  'authentication',
  'fw_verification',
  'installation',
];
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
