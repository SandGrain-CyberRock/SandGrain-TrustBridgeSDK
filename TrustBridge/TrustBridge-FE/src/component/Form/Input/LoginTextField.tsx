import type { ChangeEvent } from 'react';

import {
  Input as ChakraInput,
  InputGroup,
  InputLeftElement,
  InputRightElement,
} from '@chakra-ui/react';

import {
  useController,
  useFormContext,
  type FieldError,
} from 'react-hook-form';

import { Icon } from '../../Icon';
import { ThemeVariantEnum } from '../../../enums';
import { FormWrapper } from '../Wrapper';

import type { TextFieldInputProps } from './Input.types';

export const LoginTextFieldInput = ({
  variant = ThemeVariantEnum.DEFAULT_INPUT_VARIANT,
  name,
  handleChange,
  isDisabled,
  isRequired,
  label,
  placeholder,
  triggers,
  leftIcon,
  rightIcon,
  type = 'text',
}: TextFieldInputProps) => {
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

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    if (handleChange) {
      handleChange(value);

      trigger(name);
    } else onChange(event);

    triggers?.map((name) => trigger(name)); // trigger other fields if connected to this field
  };

  return (
    <FormWrapper
      label={label}
      error={errors?.[name] as FieldError}
      isRequired={isRequired}
    >
      <InputGroup position="relative">
        {leftIcon && (
          <InputLeftElement>
            <Icon name={leftIcon} />
          </InputLeftElement>
        )}
        <ChakraInput
          type={type}
          variant={variant}
          placeholder={placeholder}
          ref={ref}
          value={value}
          onChange={isDisabled ? undefined : handleInputChange}
          isDisabled={isDisabled}
          onBlur={onBlur}
          paddingRight={rightIcon ? '36px' : undefined}
          paddingLeft={leftIcon ? '36px' : undefined}
          py={'14px'}
          px={'12px'}
          background="white"
          borderColor="bgSecondary.1200"
          borderRadius="12px"
          _placeholder={{
            color: 'primary.400',
            fontSize: 'sm',
            fontWeight: 'medium',
          }}
          _hover={{
            borderColor: 'brand.600',
          }}
        />
        {rightIcon && (
          <InputRightElement>
            <Icon name={rightIcon} />
          </InputRightElement>
        )}
      </InputGroup>
    </FormWrapper>
  );
};
