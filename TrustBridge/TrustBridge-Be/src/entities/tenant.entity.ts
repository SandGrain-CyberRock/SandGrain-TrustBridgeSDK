import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import { OrganizationUnit } from "./organization-unit.entity";
import { Device } from "./device.entity";
import { DeviceGroup } from "./device-group.entity";

@Entity("cr_tenant")
export class Tenant {
  @PrimaryColumn()
  tenant_id: string;

  @Column()
  ou_id: number;

  @ManyToOne(() => OrganizationUnit, (org) => org.tenants)
  @JoinColumn({ name: "ou_id" })
  org: OrganizationUnit;

  @Column({ default: "ACTIVE" })
  tenant_status: string;

  // Track if credentials have been configured (Cloudflare, etc.)
  @Column({ default: false })
  credentials_configured: boolean;

  @OneToMany(() => Device, (device) => device.tenant)
  devices: Device[];

  @OneToMany(() => DeviceGroup, (group) => group.tenant)
  deviceGroups: DeviceGroup[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
