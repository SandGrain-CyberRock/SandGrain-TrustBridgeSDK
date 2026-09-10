import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

import { Device } from './device.entity';

@Entity('tb_device_log')
@Index(["device_id", "step", "status", "created_at"])
@Index(["device_id", "process_type", "attempt_number"])
export class DeviceLog {
  @PrimaryGeneratedColumn()
  log_id: number;

  @Column()
  device_id: number;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ default: 'authentication' })
  process_type: string;

  @Column()
  step: string;

  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'text', nullable: true })
  request_data: string;

  @Column({ type: 'text', nullable: true })
  response_data: string;

  @Column({ type: 'int', nullable: true })
  duration_ms: number;

  @Column({ type: 'int', default: 1 })
  attempt_number: number;

  @CreateDateColumn()
  created_at: Date;
}
