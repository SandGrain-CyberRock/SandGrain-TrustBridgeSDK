import type { CreateRoleType } from '../types/CreateRoleType';

export const createRoleDefaultValue: CreateRoleType = {
  roleName: '',
  label: '',
  description: '',
  permission_ids: [],
  icon: 'user-cog',
  icon_color: '#FF5500',
};
