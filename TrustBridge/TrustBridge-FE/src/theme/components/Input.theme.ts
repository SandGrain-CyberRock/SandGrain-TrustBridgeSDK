import { inputAnatomy } from '@chakra-ui/anatomy';
import { createMultiStyleConfigHelpers } from '@chakra-ui/react';

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(inputAnatomy.keys);

// Default Input Styles --> this same object can be used in select
export const defaultInputStyles = {
  border: `1px solid`,
  borderColor: 'border.input.default',
  borderRadius: '8px',
  outline: 'none',
  padding: '20px 8px',
  lineHeight: '18.75px',
  fontSize: '16px',
  background: 'bg.25',

  _placeholder: {
    color: 'gray.400',
  },

  _focus: {
    borderColor: 'border.input.default',
  },
  _invalid: {
    borderColor: 'border.input.invalid',
  },
};

// Variants
const defaultVariant = definePartsStyle({
  field: {
    ...defaultInputStyles,
  },

  addon: {},
  element: {},
  group: {},
});

export const InputTheme = defineMultiStyleConfig({
  baseStyle: {},

  defaultProps: {},

  sizes: {},

  variants: {
    primary: defaultVariant,
  },
});
