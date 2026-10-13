import {
  Box,
  Flex,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import type {
  Section,
  TopicBlock,
  CodeBlock,
  Field as FieldType,
} from '../types';
import { CopyButton } from './CopyButton';
import { highlightJson } from '../helpers/highlightJson';

export function CodePanel({
  block,
  tone,
  label: labelOverride,
}: {
  block?: CodeBlock | null;
  tone: 'req' | 'rsp' | 'plain';
  label?: string;
}) {
  const label =
    labelOverride ??
    block?.label ??
    (tone === 'req' ? 'Request' : tone === 'rsp' ? 'Response' : 'Payload');
  return (
    <Box
      bg="#0B0E13"
      borderRadius="6px"
      overflow="hidden"
      border="1px solid"
      borderColor="whiteAlpha.100"
    >
      <Flex
        align="center"
        justify="space-between"
        px="4"
        py="2.5"
        borderBottom="1px solid"
        borderColor="whiteAlpha.100"
      >
        <Text fontSize="13px" color="gray.400" fontFamily="mono">
          {label}
        </Text>
        {block && <CopyButton text={block.json} />}
      </Flex>
      {block ? (
        <Box
          as="pre"
          px="4"
          py="4"
          fontSize="14px"
          lineHeight="1.8"
          overflowX="auto"
          fontFamily="mono"
          color="gray.100"
          m="0"
        >
          <Box
            as="code"
            dangerouslySetInnerHTML={{ __html: highlightJson(block.json) }}
          />
        </Box>
      ) : (
        <Text px="4" py="4" fontSize="14px" color="gray.600">
          No response — fire and forget
        </Text>
      )}
    </Box>
  );
}

export function TopicMeta({ topic }: { topic: TopicBlock }) {
  const rows: { label: string; value: string }[] = [];
  if (topic.topic) rows.push({ label: 'Topic', value: topic.topic });
  if (topic.reqTopic)
    rows.push({ label: 'Request topic', value: topic.reqTopic });
  if (topic.rspTopic)
    rows.push({ label: 'Response topic', value: topic.rspTopic });
  if (topic.direction)
    rows.push({ label: 'Direction', value: topic.direction });
  if (topic.qos !== undefined && topic.qos !== null)
    rows.push({ label: 'QoS', value: String(topic.qos) });
  if (!rows.length) return null;

  return (
    <Box
      border="1px solid"
      borderColor="gray.200"
      borderRadius="6px"
      mb="7"
      overflow="hidden"
    >
      {rows.map((r, i) => (
        <Flex
          key={r.label}
          px="4"
          py="3"
          borderTop={i > 0 ? '1px solid' : undefined}
          borderColor="gray.200"
          gap="4"
          align="baseline"
        >
          <Text w="150px" flexShrink={0} fontSize="14.5px" color="gray.500">
            {r.label}
          </Text>
          <Text
            fontFamily={
              r.label === 'Direction' || r.label === 'QoS' ? undefined : 'mono'
            }
            fontSize="14px"
            color="gray.800"
            wordBreak="break-all"
          >
            {r.value}
          </Text>
        </Flex>
      ))}
    </Box>
  );
}

export function Fields({ items }: { items: FieldType[] }) {
  return (
    <VStack
      align="stretch"
      spacing="0"
      borderTop="1px solid"
      borderColor="gray.200"
      mb="7"
    >
      {items.map((f) => (
        <Stack
          key={f.name}
          direction={{ base: 'column', sm: 'row' }}
          spacing={{ base: '1', sm: '7' }}
          py="3.5"
          borderBottom="1px solid"
          borderColor="gray.200"
        >
          <Text
            w={{ sm: '160px' }}
            flexShrink={0}
            fontFamily="mono"
            fontSize="14px"
            color="gray.900"
          >
            {f.name}
          </Text>
          <Text fontSize="15px" lineHeight="1.75" color="gray.600">
            {f.desc}
          </Text>
        </Stack>
      ))}
    </VStack>
  );
}

export function Note({ text }: { text: string }) {
  return (
    <Box borderLeft="2px solid" borderColor="orange.300" pl="4" py="0.5" mb="7">
      <Text fontSize="15px" lineHeight="1.75" color="gray.600">
        {text}
      </Text>
    </Box>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <Box
      border="1px solid"
      borderColor="gray.200"
      borderRadius="6px"
      overflow="hidden"
      mb="8"
    >
      <Table size="sm" variant="simple">
        <Thead>
          <Tr bg="gray.50">
            {headers.map((h) => (
              <Th
                key={h}
                fontSize="13px"
                fontWeight="500"
                color="gray.500"
                borderColor="gray.200"
                textTransform="none"
              >
                {h}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row, i) => (
            <Tr key={i}>
              {row.map((cell, j) => (
                <Td
                  key={j}
                  fontSize="15px"
                  borderColor="gray.100"
                  verticalAlign="top"
                  fontFamily={j === 0 ? 'mono' : undefined}
                  color={j === 0 ? 'gray.900' : 'gray.600'}
                  whiteSpace={j === 0 ? 'nowrap' : undefined}
                >
                  {cell}
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
}

export function CodeColumn({ topic }: { topic: TopicBlock }) {
  if (topic.payload) {
    return (
      <VStack align="stretch" spacing="3">
        <Box>
          {topic.direction && (
            <Text fontSize="15px" fontWeight="500" color="gray.700">
              {topic.direction}
            </Text>
          )}
          {topic.topic && (
            <Text
              fontFamily="mono"
              fontSize="13.5px"
              color="gray.400"
              mt="1.5"
              wordBreak="break-all"
            >
              {topic.topic}
            </Text>
          )}
        </Box>
        <CodePanel
          block={topic.payload}
          tone="plain"
          label="Published payload"
        />
      </VStack>
    );
  }
  return (
    <VStack align="stretch" spacing="3">
      <CodePanel block={topic.request} tone="req" />
      <CodePanel
        block={topic.response}
        tone={topic.response === null ? 'plain' : 'rsp'}
      />
    </VStack>
  );
}

export function SectionBody({ section }: { section: Section }) {
  const prose = (
    <>
      <Text
        as="h1"
        fontSize="30px"
        fontWeight="600"
        letterSpacing="-0.01em"
        color="gray.900"
        mb="4"
      >
        {section.title}
      </Text>
      {section.intro && (
        <Text
          fontSize="16px"
          lineHeight="1.8"
          color="gray.600"
          mb="8"
          maxW="62ch"
        >
          {section.intro}
        </Text>
      )}
      {section.topic && <TopicMeta topic={section.topic} />}
      {section.fields && <Fields items={section.fields} />}
      {section.topic?.possibleValues && (
        <Fields items={section.topic.possibleValues} />
      )}
      {section.topic?.fields && <Fields items={section.topic.fields} />}
      {section.table && (
        <DataTable headers={section.table.headers} rows={section.table.rows} />
      )}
      {section.note && <Note text={section.note} />}
      {section.topic?.note && <Note text={section.topic.note} />}
    </>
  );

  const hasCode =
    section.topic &&
    (section.topic.payload || section.topic.request || section.topic.reqTopic);

  if (!hasCode) return <Box maxW="680px">{prose}</Box>;

  return (
    <Stack
      direction={{ base: 'column', lg: 'row' }}
      align="flex-start"
      spacing={{ base: '8', lg: '14' }}
    >
      <Box minW="0" w="full" maxW={{ lg: '520px' }}>
        {prose}
      </Box>
      <Box
        position={{ lg: 'sticky' }}
        top={{ lg: '10' }}
        w="full"
        maxW={{ lg: '420px' }}
        flexShrink={0}
      >
        <CodeColumn topic={section.topic!} />
      </Box>
    </Stack>
  );
}
