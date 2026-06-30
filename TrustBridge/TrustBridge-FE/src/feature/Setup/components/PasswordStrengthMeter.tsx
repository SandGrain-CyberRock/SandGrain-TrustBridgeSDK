import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { useMemo } from 'react';

interface PasswordStrengthMeterProps {
  password: string;
}

const rules = [
  {
    key: 'len',
    label: 'Min. 12 characters',
    test: (v: string) => v.length >= 12,
  },
  {
    key: 'upper',
    label: 'Uppercase letter',
    test: (v: string) => /[A-Z]/.test(v),
  },
  {
    key: 'lower',
    label: 'Lowercase letter',
    test: (v: string) => /[a-z]/.test(v),
  },
  { key: 'num', label: 'Number', test: (v: string) => /[0-9]/.test(v) },
  {
    key: 'sym',
    label: 'Special character',
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
  },
];

const strengthConfig: Record<
  number,
  { color: string; label: string; bg: string }
> = {
  0: { color: '#e5e7eb', label: '', bg: '#e5e7eb' },
  1: { color: '#ef4444', label: 'Very weak', bg: '#ef4444' },
  2: { color: '#f97316', label: 'Weak', bg: '#f97316' },
  3: { color: '#eab308', label: 'Fair', bg: '#eab308' },
  4: { color: '#84cc16', label: 'Good', bg: '#84cc16' },
  5: { color: '#16a34a', label: 'Strong', bg: '#16a34a' },
};

export const PasswordStrengthMeter = ({
  password,
}: PasswordStrengthMeterProps) => {
  const results = useMemo(
    () =>
      rules.map((r) => ({ ...r, pass: password ? r.test(password) : false })),
    [password],
  );

  const score = results.filter((r) => r.pass).length;
  const config = strengthConfig[score];

  return (
    <Box mt="2px">
      {/* Strength bar */}
      <Box h="4px" bg="#e5e7eb" borderRadius="99px" overflow="hidden" mb="5px">
        <Box
          h="100%"
          borderRadius="99px"
          w={`${(score / 5) * 100}%`}
          bg={config.bg}
          transition="width 0.3s, background 0.3s"
        />
      </Box>

      {password && (
        <Text fontSize="12px" color={config.color} mb="5px" fontWeight="500">
          {config.label}
        </Text>
      )}

      {/* Rules grid */}
      <Grid templateColumns="1fr 1fr" gap="4px 16px" mt={2}>
        {results.map((r) => (
          <Flex key={r.key} align="center" gap="5px">
            <Box
              w="8px"
              h="8px"
              borderRadius="full"
              bg={r.pass ? '#16a34a' : '#d1d5db'}
              flexShrink={0}
              transition="background 0.2s"
            />
            <Text
              fontSize="12px"
              color={r.pass ? '#16a34a' : '#6b6f77'}
              transition="color 0.2s"
            >
              {r.label}
            </Text>
          </Flex>
        ))}
      </Grid>
    </Box>
  );
};
