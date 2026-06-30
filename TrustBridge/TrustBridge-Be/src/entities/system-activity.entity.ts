import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Device } from './device.entity';
import { DeviceGroup } from './device-group.entity';

@Entity('tb_system_activity')
export class SystemActivity {
  @PrimaryGeneratedColumn()
  activity_id: number;

  @Column()
  activity_type: string; // 'device_created', 'device_authenticated', 'device_failed', 'device_group_created', 'device_group_password_changed', etc.

  @Column()
  entity_type: string; // 'device', 'device_group', 'user', etc.

  @Column({ nullable: true })
  entity_id: number;

  @Column({ nullable: true })
  device_id: number;

  @ManyToOne(() => Device, { nullable: true })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ nullable: true })
  device_group_id: number;

  @ManyToOne(() => DeviceGroup, { nullable: true })
  @JoinColumn({ name: 'device_group_id' })
  deviceGroup: DeviceGroup;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'info' })
  severity: string; // 'info', 'success', 'warning', 'error'

  @Column({ nullable: true })
  icon: string; // Icon name to show in UI

  @Column({ type: 'json', nullable: true })
  metadata: any; // Additional data

  @CreateDateColumn()
  created_at: Date;
}
