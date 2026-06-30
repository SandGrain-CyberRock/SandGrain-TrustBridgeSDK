import type { ResponsiveValue } from '@chakra-ui/react';
import type { ComponentProps } from 'react';
import type { IconNamesType } from '../../Icon';

export type InputVariant = ResponsiveValue<'primary'>;

export type TextFieldInputProps = ComponentProps<'input'> & {
  variant?: InputVariant;

  name: string;
  label?: string;
  placeholder?: string;

  handleChange?: (value: string) => void;
  isRequired?: boolean;
  isDisabled?: boolean;

  tooltip?: string;

  maxLength?: number;

  triggers?: string[];

  rightIcon?: IconNamesType;
  leftIcon?: IconNamesType;

  onRightIconClick?: () => void;

  type?: 'text' | 'time' | 'number' | 'email';
};

export type PasswordInputProps = TextFieldInputProps;
