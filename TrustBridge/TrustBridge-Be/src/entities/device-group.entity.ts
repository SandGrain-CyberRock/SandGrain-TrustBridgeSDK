import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Device } from "./device.entity";
import { Tenant } from "./tenant.entity";

@Entity("tb_device_group")
export class DeviceGroup {
  @PrimaryGeneratedColumn()
  device_group_id: number;

  @Column()
  group_id: string;

  @Column()
  group_name: string;

  @Column()
  password: string;

  @Column({ default: "ACTIVE" })
  status: string;

  @Column({ nullable: true })
  tenant_id: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.deviceGroups, { nullable: true })
  @JoinColumn({ name: "tenant_id", referencedColumnName: "tenant_id" })
  tenant: Tenant;

  @OneToMany(() => Device, (device) => device.deviceGroup)
  devices: Device[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
