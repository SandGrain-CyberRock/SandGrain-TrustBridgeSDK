import type { ChangeEvent } from 'react';

import {
  Input as ChakraInput,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  useDisclosure,
} from '@chakra-ui/react';

import {
  useController,
  useFormContext,
  type FieldError,
} from 'react-hook-form';

import { Icon } from '../../Icon';
import { ThemeVariantEnum } from '../../../enums';
import { FormWrapper } from '../Wrapper';

import type { PasswordInputProps } from './Input.types';

export const LoginPasswordInput = ({
  variant = ThemeVariantEnum.DEFAULT_INPUT_VARIANT,
  name,
  handleChange,
  isDisabled,
  isRequired,
  label,
  placeholder,
  triggers,
  leftIcon,
}: PasswordInputProps) => {
  const {
    control,
    formState: { errors },
    trigger,
  } = useFormContext();

  const { isOpen, onToggle } = useDisclosure();

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
      isDisabled={isDisabled}
      isRequired={isRequired}
    >
      <InputGroup>
        {leftIcon && (
          <InputLeftElement>
            <Icon name={leftIcon} />
          </InputLeftElement>
        )}
        <ChakraInput
          type={isOpen ? 'text' : 'password'}
          variant={variant}
          placeholder={placeholder}
          ref={ref}
          value={value}
          onChange={isDisabled ? undefined : handleInputChange}
          isDisabled={isDisabled}
          onBlur={onBlur}
          paddingRight="36px"
          paddingLeft={leftIcon ? '36px' : undefined}
          py={'14px'}
          px={'12px'}
          background="white"
          borderColor="bgSecondary.1200"
          borderRadius="12px"
          _placeholder={{
            color: 'primary.1400',
            fontSize: 'sm',
            fontWeight: 'medium',
          }}
          _hover={{
            borderColor: 'brand.600',
          }}
        />

        <InputRightElement>
          <Icon
            name={isOpen ? 'eye_open' : 'eye_close'}
            onClick={onToggle}
            cursor="pointer"
          />
        </InputRightElement>
      </InputGroup>
    </FormWrapper>
  );
};

export default LoginPasswordInput;
