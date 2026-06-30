import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import {
  QosLevel,
  TlsType,
  ClaimType,
} from "../modules/profile-default-param/enums/profile-param.enum";

@Entity("tb_profile_default_param")
export class ProfileDefaultParam {
  @PrimaryGeneratedColumn()
  profile_param_id: number;

  @Column()
  param_name: string;

  @Column({ nullable: true })
  mqtt_server: string;

  @Column({ nullable: true })
  mqtt_username: string;

  @Column({ nullable: true })
  mqtt_password: string;

  @Column({ nullable: true })
  qos_level: QosLevel;

  @Column({ nullable: true })
  tls_type: TlsType;

  @Column({ nullable: true })
  claim_type: ClaimType;

  @Column({ type: "int", nullable: true })
  auth_frequency: number;

  @Column({ type: "int", nullable: true })
  max_failed_auth_attempts: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
