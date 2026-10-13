import { Button, useClipboard } from '@chakra-ui/react';
export function CopyButton({ text }: { text: string }) {
  const { hasCopied, onCopy } = useClipboard(text);
  return (
    <Button
      size="xs"
      variant="ghost"
      color="gray.500"
      fontWeight="400"
      _hover={{ color: 'gray.100', bg: 'whiteAlpha.100' }}
      onClick={onCopy}
    >
      {hasCopied ? 'Copied' : 'Copy'}
    </Button>
  );
}
