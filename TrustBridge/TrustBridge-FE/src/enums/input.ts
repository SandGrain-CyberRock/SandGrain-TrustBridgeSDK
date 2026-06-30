export const ThemeVariantEnum = {
  DEFAULT_INPUT_VARIANT: 'primary',
} as const;

export type ThemeVariantEnum =
  (typeof ThemeVariantEnum)[keyof typeof ThemeVariantEnum];
