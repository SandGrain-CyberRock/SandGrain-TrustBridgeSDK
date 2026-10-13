import { Box, Text, VStack } from '@chakra-ui/react';
import { ACCENT_COLORS, DOCS } from '../constants';

export function NavList({
  activeDocId,
  activeSectionId,
  onSelect,
}: {
  activeDocId: string;
  activeSectionId: string;
  onSelect: (docId: string, sectionId: string) => void;
}) {
  return (
    <VStack align="stretch" spacing="0" pt="9" pb="24">
      <Box px="7" pb="8">
        <Text
          fontSize="17px"
          fontWeight="700"
          color="gray.900"
          letterSpacing="-0.01em"
        >
          MQTT reference
        </Text>
        <Text fontFamily="mono" fontSize="13px" color="gray.400" mt="2.5">
          sandgrain/v1/{'{tid}'}/…
        </Text>
      </Box>

      {DOCS.map((doc, i) => (
        <Box key={doc.id}>
          {i > 0 && (
            <Box borderTop="1px solid" borderColor="gray.150" mx="7" my="8" />
          )}
          <Box px="7">
            <Text fontSize="15px" fontWeight="700" color="gray.900" mb="4">
              {doc.name}
            </Text>
            <VStack as="nav" align="stretch" spacing="0">
              {doc.sections.map((section) => {
                const isActive =
                  doc.id === activeDocId && section.id === activeSectionId;
                return (
                  <Box
                    key={section.id}
                    as="button"
                    onClick={() => onSelect(doc.id, section.id)}
                    textAlign="left"
                    py="2.5"
                    fontSize="16px"
                    lineHeight="1.3"
                    fontWeight={isActive ? '600' : '400'}
                    color={isActive ? ACCENT_COLORS[doc.accent] : 'gray.500'}
                    _hover={{
                      color: isActive ? ACCENT_COLORS[doc.accent] : 'gray.900',
                    }}
                    transition="color 0.1s ease"
                  >
                    {section.title}
                  </Box>
                );
              })}
            </VStack>
          </Box>
        </Box>
      ))}
    </VStack>
  );
}
