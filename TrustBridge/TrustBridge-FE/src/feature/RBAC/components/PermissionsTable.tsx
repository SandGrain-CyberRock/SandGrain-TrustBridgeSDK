import { useCallback, useState, useMemo, useEffect } from 'react';
import {
  Box,
  IconButton,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import type {
  ModuleType,
  PermissionAction,
  PermissionsType,
} from '../types/PermissionsType';
import { areAllPermissionsChecked } from '../utils/TransformPermission';
import { ArrowDown, ArrowRight } from '../../../assets/svgs';
import { CheckBox } from '../../../component/Checkbbox/Checkbox';

interface PermissionsTableProps {
  data: ModuleType[];
}

const PERMISSION_COLUMNS: PermissionAction[] = [
  'create',
  'read',
  'update',
  'delete',
];

const createFullPermissions = (value: boolean): PermissionsType => ({
  create: value,
  read: value,
  update: value,
  delete: value,
});

// Calculates parent module permission based on all submodule permissions
const calculateParentPermission = (
  subModules: Array<{ permissions: PermissionsType }>,
  permission: PermissionAction,
): boolean => subModules.every((sub) => sub.permissions[permission]);

export const PermissionsTable = ({ data }: PermissionsTableProps) => {
  const initialModules = useMemo(() => data, [data]);

  const [modules, setModules] = useState<ModuleType[]>(initialModules);

  useEffect(() => {
    setModules(initialModules);
  }, [initialModules]);
  // Toggle the expanded/collapsed state of a module row

  const toggleExpand = useCallback((moduleIndex: number): void => {
    setModules((prev) =>
      prev.map((mod, idx) =>
        idx === moduleIndex ? { ...mod, expanded: !mod.expanded } : mod,
      ),
    );
  }, []);

  // Toggle a specific permission for a module and updates the same permission for all subModules

  const handleModulePermissionChange = useCallback(
    (moduleIndex: number, permission: PermissionAction): void => {
      setModules((prev) =>
        prev.map((mod, idx) => {
          if (idx !== moduleIndex) return mod;

          const newValue = !mod.permissions[permission];
          return {
            ...mod,
            permissions: { ...mod.permissions, [permission]: newValue },
            subModules: mod.subModules.map((sub) => ({
              ...sub,
              permissions: { ...sub.permissions, [permission]: newValue },
            })),
          };
        }),
      );
    },
    [],
  );

  const handleSubModulePermissionChange = useCallback(
    (
      moduleIndex: number,
      subModuleIndex: number,
      permission: PermissionAction,
    ): void => {
      setModules((prev) =>
        prev.map((mod, idx) => {
          if (idx !== moduleIndex) return mod;

          const updatedSubModules = mod.subModules.map((sub, subIdx) =>
            subIdx === subModuleIndex
              ? {
                  ...sub,
                  permissions: {
                    ...sub.permissions,
                    [permission]: !sub.permissions[permission],
                  },
                }
              : sub,
          );

          return {
            ...mod,
            subModules: updatedSubModules,
            permissions: {
              ...mod.permissions,
              [permission]: calculateParentPermission(
                updatedSubModules,
                permission,
              ),
            },
          };
        }),
      );
    },
    [],
  );
  // Toggle all permissions for a subModule at once and updates the parent module permissions based on all subModules
  const handleSubModuleAllPermissionsChange = useCallback(
    (moduleIndex: number, subModuleIndex: number): void => {
      setModules((prev) =>
        prev.map((mod, idx) => {
          if (idx !== moduleIndex) return mod;

          const currentSubModule = mod.subModules[subModuleIndex];
          const newValue = !areAllPermissionsChecked(
            currentSubModule.permissions,
          );

          const updatedSubModules = mod.subModules.map((sub, subIdx) =>
            subIdx === subModuleIndex
              ? { ...sub, permissions: createFullPermissions(newValue) }
              : sub,
          );
          // Recalculate parent permissions based on updated subModules

          return {
            ...mod,
            subModules: updatedSubModules,
            permissions: {
              create: calculateParentPermission(updatedSubModules, 'create'),
              read: calculateParentPermission(updatedSubModules, 'read'),
              update: calculateParentPermission(updatedSubModules, 'update'),
              delete: calculateParentPermission(updatedSubModules, 'delete'),
            },
          };
        }),
      );
    },
    [],
  );

  if (!modules?.length) {
    return (
      <Box w="full" mt={3} textAlign="center" py={8}>
        <Text color="gray.500">No roles or permissions found</Text>
      </Box>
    );
  }

  return (
    <Box w="full" mt={3}>
      <Table>
        <Thead
          bg="#F9FAFB"
          border="1px solid"
          borderColor="#E1E7EF"
          borderRadius="8px"
          py="16px"
        >
          <Tr>
            <Th textTransform="capitalize" color="primary.1700">
              <Text variant="xs_medium"> Module</Text>
            </Th>
            {PERMISSION_COLUMNS.map((column) => (
              <Th
                key={column}
                textTransform="capitalize"
                fontSize="xs"
                fontWeight="400px"
                color="primary.1700"
              >
                <Text variant="xs_medium">{column}</Text>
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {modules.map((module, moduleIndex) => (
            <>
              {/* Module row */}

              <Tr key={module.name} bg="gray.25" py={0}>
                <Td p={0}>
                  <Box display="flex" alignItems="center">
                    {/* Expand/collapse button */}

                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={module.expanded ? <ArrowRight /> : <ArrowDown />}
                      onClick={() => toggleExpand(moduleIndex)}
                      aria-label={
                        module.expanded ? 'Collapse module' : 'Expand module'
                      }
                    />
                    <Box fontSize="xs" fontWeight="bold" color="primary.1700">
                      <Text variant="xs_medium">{module.name}</Text>
                    </Box>
                  </Box>
                </Td>
                {/* Module permissions */}

                {PERMISSION_COLUMNS.map((permission) => (
                  <Td key={permission} textAlign="start">
                    <CheckBox
                      color="blue.1700"
                      size={'lg'}
                      isChecked={module.permissions[permission]}
                      onChange={() =>
                        handleModulePermissionChange(moduleIndex, permission)
                      }
                    />
                  </Td>
                ))}
              </Tr>
              {/* Submodule rows */}
              {module.expanded &&
                module.subModules.map((subModule, subModuleIndex) => {
                  const allChecked = areAllPermissionsChecked(
                    subModule.permissions,
                  );
                  return (
                    <Tr
                      key={`${module.name}-${subModule.name}`}
                      _hover={{ bg: 'gray.50' }}
                    >
                      <Td
                        px={2}
                        py={0}
                        borderLeft="1px solid"
                        borderColor="#E1E7EF"
                      >
                        <Box display="flex" alignItems="center" gap={2}>
                          {/* Checkbox to toggle all permissions for this submodule */}

                          <CheckBox
                            color="blue.1700"
                            size={'lg'}
                            isChecked={allChecked}
                            onChange={() =>
                              handleSubModuleAllPermissionsChange(
                                moduleIndex,
                                subModuleIndex,
                              )
                            }
                          />

                          <Text variant="sm_normal" textTransform="capitalize">
                            {subModule.name}
                          </Text>
                        </Box>
                      </Td>
                      {/* Submodule permissions */}
                      {PERMISSION_COLUMNS.map((permission) => (
                        <Td key={permission} textAlign="start" pr={6}>
                          <CheckBox
                            color="blue.1700"
                            size={'lg'}
                            isChecked={subModule.permissions[permission]}
                            onChange={() =>
                              handleSubModulePermissionChange(
                                moduleIndex,
                                subModuleIndex,
                                permission,
                              )
                            }
                          />
                        </Td>
                      ))}
                    </Tr>
                  );
                })}
            </>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};
