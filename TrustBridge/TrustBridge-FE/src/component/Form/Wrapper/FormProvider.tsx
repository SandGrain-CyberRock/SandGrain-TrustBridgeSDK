import {
  FormProvider as ReactHookFormProvider,
  type FieldValues,
} from 'react-hook-form';
import type { FormProviderProps } from './Wrapper.types';

export const FormProvider = <TFieldValues extends FieldValues>({
  children,
  methods,
}: FormProviderProps<TFieldValues>) => {
  return <ReactHookFormProvider {...methods}>{children}</ReactHookFormProvider>;
};
