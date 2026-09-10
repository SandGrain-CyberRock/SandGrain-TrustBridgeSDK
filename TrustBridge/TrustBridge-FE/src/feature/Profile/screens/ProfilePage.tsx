import {
  Avatar as ChakraAvatar,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  Grid,
  HStack,
  SimpleGrid,
  Skeleton,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as Yup from 'yup';

import { FormProvider, TextFieldInput } from '../../../component/Form';
import PasswordInput from '../../../component/Form/Input/Password';
import { useInitInfo } from '../../Auth/services/InitInfo.service';
import {
  useProfileQuery,
  useCredentialsQuery,
  useUpdateProfileMutation,
  useUpdateCredentialsMutation,
} from '../service/Profile.service';

// ── Schemas ───────────────────────────────────────────────────────────────────

const profileSchema = Yup.object({
  name: Yup.string().nullable(),
  company_title: Yup.string().nullable(),
});

type ProfileFormValues = Yup.InferType<typeof profileSchema>;

const credentialsSchema = Yup.object({
  tenant_user_id: Yup.string().required('Tenant User ID is required'),
  email: Yup.string()
    .email('Enter a valid email')
    .required('Email is required'),
  password: Yup.string(),
  cf_access_client_id: Yup.string().required('CF Access Client ID is required'),
  cf_access_client_secret: Yup.string(),
});

type CredentialsFormValues = Yup.InferType<typeof credentialsSchema>;

// ── Read-only info row ────────────────────────────────────────────────────────

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) => (
  <Box>
    <Text fontSize="xs" fontWeight="500" color="gray.500" mb={1}>
      {label}
    </Text>
    <Box
      px={3}
      py="9px"
      bg="gray.50"
      borderRadius="12px"
      border="1px solid"
      borderColor="gray.200"
      fontSize="sm"
      color="gray.600"
      minH="38px"
    >
      {value || '—'}
    </Box>
  </Box>
);

// ── Card wrapper ──────────────────────────────────────────────────────────────

const Card = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <Box
    bg="white"
    border="1px solid"
    borderColor="primary.1200"
    borderRadius="xl"
    p={6}
    _hover={{ boxShadow: 'sm' }}
    transition="all 0.2s"
  >
    <Box mb={5}>
      <Text
        variant="xl_medium"
        color="primary.1700"
        fontSize="md"
        fontWeight="600"
      >
        {title}
      </Text>
      {subtitle && (
        <Text variant="sm_normal" color="gray.1600" fontSize="sm" mt="2px">
          {subtitle}
        </Text>
      )}
    </Box>
    <Divider mb={5} />
    {children}
  </Box>
);

// ── Left identity card ────────────────────────────────────────────────────────

const IdentityCard = () => {
  const { data: initInfo } = useInitInfo();
  const { data: profile, isLoading } = useProfileQuery();

  const initials = (initInfo?.username || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="primary.1200"
      borderRadius="xl"
      overflow="hidden"
      _hover={{ boxShadow: 'sm' }}
      transition="all 0.2s"
    >
      {/* Header band */}
      <Box h="80px" bgGradient="linear(to-br, blue.400, brand.600)" />

      <VStack px={6} pb={6} spacing={4} mt="-40px" align="stretch">
        {/* Avatar */}
        <ChakraAvatar
          name={initInfo?.username}
          size="xl"
          border="4px solid white"
          bg="brand.600"
          color="white"
          fontWeight="700"
          fontSize="xl"
        >
          {initials}
        </ChakraAvatar>

        <VStack align="flex-start" spacing={1}>
          <Skeleton isLoaded={!isLoading} minW="120px">
            <Text
              fontWeight="700"
              fontSize="lg"
              color="gray.800"
              lineHeight="1.2"
            >
              {profile?.name || initInfo?.username || '—'}
            </Text>
          </Skeleton>
          <Skeleton isLoaded={!isLoading} minW="80px">
            <Text fontSize="xs" color="gray.500">
              {profile?.company_title || 'No title set'}
            </Text>
          </Skeleton>
        </VStack>

        <Divider />

        <VStack align="stretch" spacing={3}>
          <Box>
            <Text
              fontSize="xs"
              fontWeight="500"
              color="gray.400"
              textTransform="uppercase"
              letterSpacing="wider"
              mb={1}
            >
              Username
            </Text>
            <Text fontSize="sm" color="gray.700" fontWeight="500">
              {initInfo?.username || '—'}
            </Text>
          </Box>
          <Box>
            <Text
              fontSize="xs"
              fontWeight="500"
              color="gray.400"
              textTransform="uppercase"
              letterSpacing="wider"
              mb={1}
            >
              Email
            </Text>
            <Text
              fontSize="sm"
              color="gray.700"
              fontWeight="500"
              wordBreak="break-all"
            >
              {initInfo?.email || '—'}
            </Text>
          </Box>
          {initInfo?.org && (
            <Box>
              <Text
                fontSize="xs"
                fontWeight="500"
                color="gray.400"
                textTransform="uppercase"
                letterSpacing="wider"
                mb={1}
              >
                Organization
              </Text>
              <Text fontSize="sm" color="gray.700" fontWeight="500">
                {initInfo.org.ou_name}
              </Text>
            </Box>
          )}
          {initInfo?.roles && initInfo.roles.length > 0 && (
            <Box>
              <Text
                fontSize="xs"
                fontWeight="500"
                color="gray.400"
                textTransform="uppercase"
                letterSpacing="wider"
                mb={2}
              >
                Roles
              </Text>
              <HStack flexWrap="wrap" gap={2} spacing={0}>
                {initInfo.roles.map((role) => (
                  <Badge
                    key={role}
                    bg="#007CAA"
                    color="#FEFFFF"
                    borderRadius="full"
                    px={3}
                    py={1}
                    fontSize="xs"
                    textTransform="none"
                    fontWeight="500"
                  >
                    {role}
                  </Badge>
                ))}
              </HStack>
            </Box>
          )}
        </VStack>
      </VStack>
    </Box>
  );
};

// ── Profile edit card ─────────────────────────────────────────────────────────

const ProfileEditCard = () => {
  const { data: profile, isLoading } = useProfileQuery();
  const { mutateAsync, isPending } = useUpdateProfileMutation();

  const methods = useForm({
    resolver: yupResolver(profileSchema),
    defaultValues: { name: '', company_title: '' },
  });

  useEffect(() => {
    if (profile) {
      methods.reset({
        name: profile.name || '',
        company_title: profile.company_title || '',
      });
    }
  }, [profile]);

  const onSubmit = async (data: ProfileFormValues) => {
    const payload = {
      name: data.name ?? undefined,
      company_title: data.company_title ?? undefined,
    };
    await mutateAsync(payload);
  };

  return (
    <Card
      title="Profile Information"
      subtitle="Update your display name and job title"
    >
      <Skeleton isLoaded={!isLoading} borderRadius="md">
        <FormProvider methods={methods}>
          <VStack spacing={5} align="stretch">
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
              <TextFieldInput
                name="name"
                label="Display Name"
                placeholder="Enter Full Name"
              />
              <TextFieldInput
                name="company_title"
                label="Job Title"
                placeholder="Enter Company Title"
              />
            </SimpleGrid>

            <Divider />

            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
              <InfoRow label="Username" value={profile?.username} />
              <InfoRow label="Email Address" value={profile?.email} />
              {profile?.org_name && (
                <InfoRow label="Organization" value={profile?.org_name} />
              )}
            </SimpleGrid>

            <Flex justify="flex-end">
              <Button
                onClick={methods.handleSubmit(onSubmit)}
                isLoading={isPending}
                px={8}
              >
                Save Changes
              </Button>
            </Flex>
          </VStack>
        </FormProvider>
      </Skeleton>
    </Card>
  );
};

// ── Tenant credentials card ───────────────────────────────────────────────────

const TenantCredentialsCard = () => {
  const { data: creds, isLoading } = useCredentialsQuery(true);
  const { mutateAsync, isPending } = useUpdateCredentialsMutation();

  const methods = useForm({
    resolver: yupResolver(credentialsSchema),
    defaultValues: {
      tenant_user_id: '',
      email: '',
      password: '',
      cf_access_client_id: '',
      cf_access_client_secret: '',
    },
  });

  useEffect(() => {
    if (creds) {
      methods.reset({
        tenant_user_id: creds.tenant_user_id || '',
        email: creds.email || '',
        password: '',
        cf_access_client_id: creds.cf_access_client_id || '',
        cf_access_client_secret: creds.cf_access_client_secret || '',
      });
    }
  }, [creds]);

  const onSubmit = async (data: CredentialsFormValues) => {
    const payload: Record<string, string> = {
      tenant_user_id: data.tenant_user_id,
      email: data.email,
      cf_access_client_id: data.cf_access_client_id,
    };

    if (data.password) {
      payload.password = data.password;
    }

    if (data.cf_access_client_secret) {
      payload.cf_access_client_secret = data.cf_access_client_secret;
    }
    await mutateAsync(payload);
  };

  return (
    <Card
      title="Tenant Credentials"
      subtitle={
        creds?.tenant_id
          ? `Tenant: ${creds.tenant_id}`
          : 'Configure Sandgrain tenant access credentials'
      }
    >
      <Skeleton isLoaded={!isLoading} borderRadius="md">
        <FormProvider methods={methods}>
          <VStack spacing={5} align="stretch">
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
              <TextFieldInput
                name="tenant_user_id"
                label="Tenant User ID"
                isRequired
                placeholder="Enter Tenant ID"
              />
              <TextFieldInput
                name="email"
                label="Access Email"
                isRequired
                placeholder="Enter Email Address"
              />
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
              <PasswordInput
                name="password"
                label="Access Password"
                placeholder="Leave blank to keep current password"
              />
              <TextFieldInput
                name="cf_access_client_id"
                label="CF Access Client ID"
                isRequired
                placeholder="Enter Cloudflare Access Client ID"
              />
            </SimpleGrid>

            <PasswordInput
              name="cf_access_client_secret"
              label="CF Access Client Secret"
              isRequired
              placeholder="Leave blank to keep current Cloudflare Access Client Secret"
            />

            <Divider />

            <Flex justify="flex-end">
              <Button
                onClick={methods.handleSubmit(onSubmit)}
                isLoading={isPending}
                px={8}
              >
                Update Credentials
              </Button>
            </Flex>
          </VStack>
        </FormProvider>
      </Skeleton>
    </Card>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export const ProfilePage = () => {
  const { data: initInfo } = useInitInfo();
  const isTrustAdmin = !!initInfo?.roles?.includes('TRUST_ADMIN');

  return (
    <Box>
      <Box mb={6}>
        <Text fontWeight="700" fontSize="xl" color="gray.800">
          My Profile
        </Text>
        <Text fontSize="sm" color="gray.500" mt={1}>
          Manage your account information and tenant credentials
        </Text>
      </Box>

      <Grid
        templateColumns={{ base: '1fr', lg: '280px 1fr' }}
        gap={6}
        alignItems="start"
      >
        {/* Left column — identity */}
        <IdentityCard />

        {/* Right column — edit cards */}
        <VStack spacing={6} align="stretch">
          <ProfileEditCard />
          {isTrustAdmin && <TenantCredentialsCard />}
        </VStack>
      </Grid>
    </Box>
  );
};

export default ProfilePage;
