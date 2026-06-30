import type { IconNamesType } from '../../../component/Icon';

export type ActivityCardProps = {
  iconName: IconNamesType;
  title: string;
  timestamp: string;
  bgColor?: string;
  color?: string;
};
