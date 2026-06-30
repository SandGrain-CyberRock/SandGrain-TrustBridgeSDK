import type { IconNamesType } from '../../Icon';

export interface CheckboxFieldInputProps {
  name: string;
  handleChange?: (value: boolean) => void;
  isDisabled?: boolean;
  isRequired?: boolean;
  label?: string;
  triggers?: string[];
}

export interface RadioFieldInputProps {
  name: string;
  handleChange?: (value: string) => void;
  isDisabled?: boolean;
  isRequired?: boolean;
  label?: string;
  value?: string;
  triggers?: string[];
  logo?: IconNamesType;
  colorScheme?: string;
  title?: string;
}
