import type { ChangeEvent } from 'react';

import { Checkbox, Text } from '@chakra-ui/react';

import {
  useController,
  useFormContext,
  type FieldError,
} from 'react-hook-form';

import { FormWrapper } from '../Wrapper';

import type { CheckboxFieldInputProps } from './CheckboxInput.types';

export const CheckboxFieldInput = ({
  name,
  handleChange,
  isDisabled,
  isRequired,
  label,
  triggers,
}: CheckboxFieldInputProps) => {
  const {
    control,
    formState: { errors },
    trigger,
  } = useFormContext();

  const {
    field: { onChange, onBlur, ref, value },
  } = useController({
    control,
    name,
  });

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const updatedValue = event.target.checked;

    if (handleChange) {
      handleChange(updatedValue);

      trigger(name);
    } else onChange(updatedValue);

    triggers?.map((name) => trigger(name)); // Trigger connected fields if any
  };

  return (
    <FormWrapper
      error={errors?.[name] as FieldError}
      isDisabled={isDisabled}
      isRequired={isRequired}
    >
      <Checkbox
        isChecked={!!value}
        onChange={isDisabled ? undefined : handleCheckboxChange}
        isDisabled={isDisabled}
        onBlur={onBlur}
        ref={ref}
      >
        <Text variant={'sm_normal'} color={'primary.1800'}>
          {label}
        </Text>
      </Checkbox>
    </FormWrapper>
  );
};
