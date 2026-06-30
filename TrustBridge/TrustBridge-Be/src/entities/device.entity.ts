import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { DeviceGroup } from "./device-group.entity";
import { DeviceProfile } from "./device-profile.entity";

@Entity("tb_device")
export class Device {
  @PrimaryGeneratedColumn()
  device_id: number;

  @Column()
  device_name: string;

  @Column({ nullable: true })
  device_serial: string;

  @Column()
  token_id: string;

  @Column({ default: "device" })
  device_type: string;

  @Column({ nullable: true })
  batch_no: string;

  @Column({ nullable: true })
  device_group_id: number;

  @ManyToOne(() => DeviceGroup, (group) => group.devices, { nullable: true })
  @JoinColumn({ name: "device_group_id" })
  deviceGroup: DeviceGroup;

  @Column({ nullable: true })
  tenant_id: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.devices, { nullable: true })
  @JoinColumn({ name: "tenant_id", referencedColumnName: "tenant_id" })
  tenant: Tenant;

  // foreign key to device profile table - optional
  @Column({ nullable: true })
  profile_id: number;

  @ManyToOne(() => DeviceProfile, { nullable: true })
  @JoinColumn({ name: "profile_id" })
  deviceProfile: DeviceProfile;

  @Column({ nullable: true })
  claim_token_id: string;

  // Pre-computed CW and RW from factory (offline onboarding via Excel)
  @Column({ type: "text", nullable: true })
  offline_cw: string;

  @Column({ type: "text", nullable: true })
  offline_rw: string;

  @Column({ default: "idle" })
  status: string;

  @Column({ default: false })
  is_approved: boolean;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: "text", nullable: true })
  status_message: string;

  @Column({ default: false })
  is_online: boolean;

  @Column({ type: "int", default: 0 })
  failed_auth_attempts: number;

  @Column({ type: "datetime", nullable: true })
  last_seen_at: Date;

  @Column({ type: "datetime", nullable: true })
  next_lifecycle_auth_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
