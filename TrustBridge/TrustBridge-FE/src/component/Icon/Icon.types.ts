import type { ResponsiveValue } from '@chakra-ui/react';
import type { IconsList } from '../../constant/Icons';

export type IconProps = {
  name?: IconNamesType;
  width?: ResponsiveValue<string | number>;
  height?: ResponsiveValue<string | number>;
  color?: string;
  cursor?: 'pointer' | 'not-allowed' | 'default';
  bgColor?: string;
  onClick?: () => void;
};

export type IconNamesType = keyof typeof IconsList;
