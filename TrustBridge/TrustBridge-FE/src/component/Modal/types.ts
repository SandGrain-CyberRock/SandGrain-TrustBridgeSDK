import type { ResponsiveValue } from '@chakra-ui/react';

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  childBodyPaddingX?: number;
  childBodyPaddingY?: number;
  limitChildOverflow?: boolean;
  isLoading?: boolean;
  cancelButtonLabel?: string;
  submitButtonLabel?: string;
  showSubmitButton?: boolean;
  onSubmit?: () => void;
  size?: ResponsiveValue<
    | 'xs'
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | '2xl'
    | '3xl'
    | '4xl'
    | '5xl'
    | '6xl'
    | 'full'
    | (string & {})
  >;
  isDisabled?: boolean;
  footerContent?: React.ReactNode;
};
