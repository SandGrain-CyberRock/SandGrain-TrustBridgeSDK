import { useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import { DOCS } from './constants';
import { NavList } from './components/NavList';
import { SectionBody } from './components/MqttSectionBody';

export default function MqttDocs() {
  const [activeDocId, setActiveDocId] = useState(DOCS[0].id);
  const [activeSectionId, setActiveSectionId] = useState(
    DOCS[0].sections[0].id,
  );
  const { isOpen, onOpen, onClose } = useDisclosure();

  const activeDoc = DOCS.find((d) => d.id === activeDocId) ?? DOCS[0];
  const activeSection =
    activeDoc.sections.find((s) => s.id === activeSectionId) ??
    activeDoc.sections[0];

  function go(docId: string, sectionId: string) {
    setActiveDocId(docId);
    setActiveSectionId(sectionId);
    onClose();
  }

  return (
    <Box minH="100vh" bg="white">
      <Flex
        display={{ base: 'flex', lg: 'none' }}
        align="center"
        justify="space-between"
        borderBottom="1px solid"
        borderColor="gray.100"
        px="4"
        h="14"
        position="sticky"
        top="0"
        bg="white"
        zIndex="10"
      >
        <Text fontSize="14px" fontWeight="600">
          MQTT reference
        </Text>
        <Button size="sm" variant="outline" onClick={onOpen}>
          Menu
        </Button>
      </Flex>

      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent maxW="280px">
          <DrawerCloseButton />
          <DrawerBody p="0" bg="white">
            <NavList
              activeDocId={activeDocId}
              activeSectionId={activeSectionId}
              onSelect={go}
            />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Flex maxW="1400px" mx="auto">
        <Box
          as="nav"
          display={{ base: 'none', lg: 'block' }}
          w="288px"
          flexShrink={0}
          bg="white"
          borderRight="1px solid"
          borderColor="gray.100"
          h="100vh"
          position="sticky"
          top="0"
          overflowY="auto"
        >
          <NavList
            activeDocId={activeDocId}
            activeSectionId={activeSectionId}
            onSelect={go}
          />
        </Box>

        <Box
          flex="1"
          minW="0"
          px={{ base: '5', md: '10', lg: '16' }}
          pt="12"
          pb="32"
        >
          <Flex
            align="baseline"
            justify="space-between"
            pb="5"
            mb="10"
            borderBottom="1px solid"
            borderColor="gray.100"
          >
            <Text fontSize="14px" color="gray.400">
              <Text as="span" color="gray.600" fontWeight="500">
                {activeDoc.name}
              </Text>{' '}
              / {activeSection.title}
            </Text>
            <Text fontFamily="mono" fontSize="13px" color="gray.400">
              v{activeDoc.version}
            </Text>
          </Flex>
          <SectionBody section={activeSection} />
        </Box>
      </Flex>
    </Box>
  );
}
