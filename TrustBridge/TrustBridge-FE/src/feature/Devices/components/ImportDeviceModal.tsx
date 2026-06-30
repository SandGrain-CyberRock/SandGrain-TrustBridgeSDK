import { useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Text,
  VStack,
} from '@chakra-ui/react';
import { DocumentText, CloseCircle } from '../../../assets/svgs';
import { AddModal } from '../../../component/Modal/AddModal';
import { useImportDevices } from '../service/Devices';
import { useInitInfo } from '../../Auth/services/InitInfo.service';
import { useNotification } from '../../../hooks/useNotification';

interface ImportDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportDeviceModal = ({
  isOpen,
  onClose,
}: ImportDeviceModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: initAPI } = useInitInfo();
  const tenantId = initAPI?.tenant_ids?.[0] ?? '';
  const importDevices = useImportDevices();
  const { errorNotification } = useNotification();

  const validateFile = (f: File): boolean => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'json') {
      const msg = `"${f.name}" is not a JSON file. Only .json files are supported. Download the sample template for the correct format.`;
      setFileError(msg);
      errorNotification(msg);
      return false;
    }
    setFileError('');
    return true;
  };

  const handleFileSelect = (selectedFile: File) => {
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
    e.target.value = '';
  };

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setFileError('');
  };

  const downloadTemplate = () => {
    const template = {
      batch_no: 'BATCH-SAMPLE-001',
      batch_description: 'Sample device import file',
      devices: [
        {
          device: {
            device_serial: 'DEV-001-2025',
            TID: '80000000000000000000000000000018bc146fe371724e557419470751edb6b8',
          },
          status: {
            device_status: 'A',
            overwrite_existing: false,
          },
          display: {
            dev_display_name: 'Online Gateway - Building A',
            overwrite_existing: false,
          },
          'cr-linkage': {
            tenant_id: tenantId || 'your-tenant-id-here',
            group_id: 'your-group-id-here',
            cr_credentials: [
              {
                HCW: '',
                HRW: '',
                'cr-already_used': false,
              },
            ],
            overwrite_existing: false,
          },
          profile: {
            profile_id: '',
            overwrite_existing: false,
          },
        },
        {
          device: {
            device_serial: 'DEV-002-2025',
            TID: '90000000000000000000000000000028cd257ff482835f668520581862fec7c9',
          },
          status: {
            device_status: 'A',
            overwrite_existing: false,
          },
          display: {
            dev_display_name: 'Offline Sensor - Floor 2',
            overwrite_existing: false,
          },
          'cr-linkage': {
            tenant_id: tenantId || 'your-tenant-id-here',
            group_id: 'your-group-id-here',
            cr_credentials: [
              {
                HCW: 'd371a7e8e8991630629ce81d80da53eade37bbac3114f8a22323c838c4f52589',
                HRW: '2de378d993a24bfacfd7656ad34e6d39',
                'cr-already_used': false,
              },
            ],
            overwrite_existing: false,
          },
          profile: {
            profile_id: '',
            overwrite_existing: false,
          },
        },
      ],
    };
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'device-import-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setFile(null);
    setFileError('');
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    if (!file) return;

    await importDevices.mutateAsync({ file });
    handleClose();
  };

  const isFileMissing = submitted && !file;

  return (
    <AddModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Devices"
      onSubmit={handleSubmit}
      submitButtonLabel="Import Devices"
      isLoading={importDevices.isPending}
      isDisabled={!file}
      childBodyPaddingX={6}
      childBodyPaddingY={5}
    >
      <VStack spacing={5} align="stretch">
        {/* ── File Upload ─────────────────────────────────────── */}
        <FormControl isRequired isInvalid={!!fileError || isFileMissing}>
          <FormLabel fontSize="sm" fontWeight="medium" mb={2}>
            Upload JSON File
          </FormLabel>

          <Box
            border="2px dashed"
            borderColor={
              isDragging
                ? 'orange.400'
                : fileError || isFileMissing
                  ? 'red.400'
                  : 'gray.300'
            }
            borderRadius="lg"
            p={6}
            textAlign="center"
            cursor="pointer"
            bg={isDragging ? 'orange.50' : 'gray.50'}
            transition="all 0.2s"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
            _hover={{ borderColor: 'orange.400', bg: 'orange.50' }}
          >
            {file ? (
              <HStack justify="center" spacing={3}>
                <DocumentText color="gray" width={20} height={20} />
                <Text fontSize="sm" fontWeight="medium" color="gray.700">
                  {file.name}
                </Text>
                <Badge colorScheme="green" fontSize="xs">
                  Ready
                </Badge>
                <Box
                  as="button"
                  onClick={removeFile}
                  color="gray.400"
                  _hover={{ color: 'red.500' }}
                  transition="color 0.15s"
                >
                  <CloseCircle width={16} height={16} />
                </Box>
              </HStack>
            ) : (
              <VStack spacing={2}>
                <DocumentText color="#9CA3AF" width={36} height={36} />
                <Text fontSize="sm" fontWeight="medium" color="gray.600">
                  Click to upload or drag and drop
                </Text>
                <Text fontSize="xs" color="gray.400">
                  Only .json files supported (TrustBridge Device Import format)
                </Text>
              </VStack>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleInputChange}
            />
          </Box>

          {(fileError || isFileMissing) && (
            <FormErrorMessage>
              {fileError || 'Please select a file.'}
            </FormErrorMessage>
          )}

          <Flex justify="flex-end" mt={2}>
            <Button
              variant="link"
              size="xs"
              color="orange.500"
              fontWeight="medium"
              onClick={downloadTemplate}
            >
              Download sample template
            </Button>
          </Flex>
        </FormControl>
      </VStack>
    </AddModal>
  );
};
