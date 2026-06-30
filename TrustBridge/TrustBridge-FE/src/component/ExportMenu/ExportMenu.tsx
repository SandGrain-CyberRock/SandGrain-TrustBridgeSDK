import { useState } from 'react';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  Text,
} from '@chakra-ui/react';
import { Export } from '../../assets/svgs';
import { useNotification } from '../../hooks/useNotification';

export type ExportFormat = 'xlsx' | 'csv' | 'json';

interface ExportOption {
  format: ExportFormat;
  label: string;
  extension: string;
}

interface ExportResponse {
  data: BlobPart;
}

interface ExportMenuProps<T = Record<string, unknown>> {
  onExport: (format: ExportFormat, options?: T) => Promise<ExportResponse>;
  exportOptions?: T;
  filename?: string;
  options?: ExportOption[];
  buttonText?: string;
  canExport?: boolean;
}

const DEFAULT_OPTIONS: ExportOption[] = [
  { format: 'csv', label: 'CSV (.csv)', extension: 'csv' },
  { format: 'xlsx', label: 'Excel (.xlsx)', extension: 'xlsx' },
  { format: 'json', label: 'JSON (.json)', extension: 'json' },
];

export const ExportMenu = <T = Record<string, unknown>,>({
  onExport,
  exportOptions,
  filename = 'export',
  options = DEFAULT_OPTIONS,
  buttonText = 'Export',
  canExport = true,
}: ExportMenuProps<T>) => {
  const [isExporting, setIsExporting] = useState(false);
  const { errorNotification } = useNotification();

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    try {
      const response = await onExport(format, exportOptions);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const option = options.find((opt) => opt.format === format);
      const extension = option?.extension || format;

      link.download = `${filename}-${timestamp}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      errorNotification(`Failed to export ${filename}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!canExport) {
    return null;
  }

  return (
    <Menu>
      <MenuButton
        as={Button}
        variant="outline"
        px={'3'}
        leftIcon={<Export />}
        isLoading={isExporting}
      >
        <Text variant="sm_normal" color="primary.1600">
          {buttonText}
        </Text>
      </MenuButton>
      <MenuList>
        {options.map((option) => (
          <MenuItem
            key={option.format}
            onClick={() => handleExport(option.format)}
          >
            {option.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};
