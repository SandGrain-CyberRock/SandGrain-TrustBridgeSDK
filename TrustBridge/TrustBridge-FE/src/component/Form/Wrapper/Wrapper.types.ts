import type { MutableRefObject } from 'react';
import type { FieldError, FieldValues, UseFormReturn } from 'react-hook-form';

export type FormWrapperProps = {
  children: React.ReactNode;

  label?: string;
  error?: FieldError;

  isRequired?: boolean;
  isDisabled?: boolean;

  tooltip?: string;

  focusRef?: MutableRefObject<HTMLInputElement | null>;
};

export type FormProviderProps<
  TFieldValues extends FieldValues,
  TContext = unknown,
> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  methods: UseFormReturn<TFieldValues, TContext, any>;
  children: React.ReactNode;
};
