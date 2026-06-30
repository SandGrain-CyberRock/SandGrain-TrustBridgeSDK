import { modalAnatomy } from '@chakra-ui/anatomy';
import { createMultiStyleConfigHelpers, defineStyle } from '@chakra-ui/react';

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(modalAnatomy.keys);

// Sizes
const sm = defineStyle({
  minWidth: '600px',
});
const md = defineStyle({
  minWidth: '900px',
});
const lg = defineStyle({
  minWidth: '1200px',
});

const sizes = {
  sm: definePartsStyle({ dialog: sm }),
  md: definePartsStyle({ dialog: md }),
  lg: definePartsStyle({ dialog: lg }),
};

export const ModalTheme = defineMultiStyleConfig({
  baseStyle: {},

  defaultProps: {},

  sizes,

  variants: {},
});
