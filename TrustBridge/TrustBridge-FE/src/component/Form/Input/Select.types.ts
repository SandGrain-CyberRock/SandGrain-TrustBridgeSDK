export type SelectProps = {
  label?: string;
  selectOption: { label: string; value: string | boolean | number }[];
  isRequired?: boolean;
  isSearchable?: boolean;
  isClearable?: boolean;
  name: string;
  placeholder?: string;
  isDisabled?: boolean;
  menuPosition?: 'absolute' | 'fixed';
  onChange?: (value: string | boolean | number | null) => void;
};

export type MultiSelectProps = {
  placeholder?: string;
  options: { label: string; value: string }[];
  label?: string;
  name: string;
  value?: string;
  error?: string;
  isRequired?: boolean;
  style?: Record<string, string>;
  required?: boolean;
  variant?: string;
  isMulti?: boolean;
  menuPosition?: 'absolute' | 'fixed';
};

export type CreatableInputProps = {
  placeholder?: string;
  label?: string;
  name: string;
  value?: string;
  error?: string;
  isRequired?: boolean;
  style?: Record<string, string>;
  required?: boolean;
};
