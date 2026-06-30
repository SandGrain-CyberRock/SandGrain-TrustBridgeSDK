import type { IconNamesType } from '../../../component/Icon';

export type StatCardType = {
  title: string;
  value: string | number;
  growth: string | number;
  growthColor?: string;
  iconName?: IconNamesType;
  bgColor?: string;
  color?: string;
};
