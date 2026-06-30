import { BadRequestException } from "@nestjs/common";

export interface ParsedBulkDevice {
  device_serial?: string;
  token_id: string;
  device_name: string;
  device_status?: string;
  tenant_id?: string;
  group_id: string;
  offline_cw?: string;
  offline_rw?: string;
  cr_already_used?: boolean;
  profile_id?: number;
  overwrite_status?: boolean;
  overwrite_display?: boolean;
  overwrite_cr_linkage?: boolean;
  overwrite_profile?: boolean;
}

export interface ParsedBulkImport {
  batch_no: string;
  batch_description?: string;
  devices: ParsedBulkDevice[];
}

export function parseBulkImport(buffer: Buffer): ParsedBulkImport {
  let parsed: any;
  try {
    parsed = JSON.parse(buffer.toString("utf-8"));
  } catch {
    throw new BadRequestException("Invalid JSON file.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new BadRequestException("JSON must be an object with batch_no and devices array.");
  }

  if (!parsed.batch_no || typeof parsed.batch_no !== "string") {
    throw new BadRequestException("Missing or invalid 'batch_no' field.");
  }

  if (!Array.isArray(parsed.devices) || parsed.devices.length === 0) {
    throw new BadRequestException("'devices' must be a non-empty array.");
  }

  const errors: string[] = [];
  const devices: ParsedBulkDevice[] = [];

  for (let i = 0; i < parsed.devices.length; i++) {
    const entry = parsed.devices[i];
    const row = i + 1;

    // --- device section (required) ---
    const deviceSection = entry?.device;
    if (!deviceSection?.TID) {
      errors.push(`Device ${row}: missing device.TID`);
      continue;
    }

    // --- display section ---
    const displaySection = entry?.display;
    const deviceName = displaySection?.dev_display_name;
    if (!deviceName) {
      errors.push(`Device ${row}: missing display.dev_display_name`);
      continue;
    }

    // --- cr-linkage section ---
    const crLinkage = entry?.["cr-linkage"];
    if (!crLinkage?.group_id) {
      errors.push(`Device ${row}: missing cr-linkage.group_id`);
      continue;
    }
    if (!crLinkage?.tenant_id) {
      errors.push(`Device ${row}: missing cr-linkage.tenant_id`);
      continue;
    }

    // Extract first credential set if present
    const cred = Array.isArray(crLinkage?.cr_credentials) ? crLinkage.cr_credentials[0] : undefined;

    // --- status section (optional) ---
    const statusSection = entry?.status;

    // --- profile section (optional) ---
    const profileSection = entry?.profile;

    devices.push({
      device_serial: deviceSection.device_serial || undefined,
      token_id: String(deviceSection.TID).trim().toLowerCase(),
      device_name: String(deviceName).trim(),
      device_status: statusSection?.device_status || undefined,
      tenant_id: crLinkage.tenant_id,
      group_id: String(crLinkage.group_id).trim(),
      offline_cw: cred?.HCW || undefined,
      offline_rw: cred?.HRW || undefined,
      cr_already_used: cred?.["cr-already_used"] === true,
      profile_id: profileSection?.profile_id ? Number(profileSection.profile_id) : undefined,
      overwrite_status: statusSection?.overwrite_existing === true,
      overwrite_display: displaySection?.overwrite_existing === true,
      overwrite_cr_linkage: crLinkage?.overwrite_existing === true,
      overwrite_profile: profileSection?.overwrite_existing === true,
    });
  }

  if (errors.length > 0 && devices.length === 0) {
    throw new BadRequestException({
      message: "All devices failed validation",
      errors,
    });
  }

  return {
    batch_no: parsed.batch_no,
    batch_description: parsed.batch_description || undefined,
    devices,
  };
}
