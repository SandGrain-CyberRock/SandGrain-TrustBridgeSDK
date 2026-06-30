import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from "typeorm";
import { OrganizationUnit } from "./organization-unit.entity";
import { UserRole } from "./user-role.entity";

@Entity("tb_user")
export class User {
  @PrimaryGeneratedColumn()
  user_id: number;

  @Column({ nullable: true })
  ou_id: number | null;

  @ManyToOne(() => OrganizationUnit, (org) => org.users, { nullable: true })
  @JoinColumn({ name: "ou_id" })
  org: OrganizationUnit | null;

  @Column({ type: "varchar", nullable: true })
  name: string | null;

  @Column({ type: "varchar", nullable: true })
  company_title: string | null;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column({ default: "ACTIVE" })
  user_status: string;

  @Column({ default: 0 })
  failed_logins: number;

  @Column({ type: "timestamp", nullable: true })
  acc_locked_until: Date;

  @Column({ type: "timestamp", nullable: true })
  last_login_at: Date;

  @Column({ type: "varchar", nullable: true })
  password_reset_token: string;

  @Column({ type: "timestamp", nullable: true })
  password_reset_expires: Date;

  @Column({ default: false })
  must_change_password: boolean;

  @Column({ default: 1 })
  token_version: number;

  @Column({ type: "varchar", nullable: true })
  invitation_token: string;

  @Column({ type: "timestamp", nullable: true })
  invitation_expires: Date;

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles: UserRole[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
