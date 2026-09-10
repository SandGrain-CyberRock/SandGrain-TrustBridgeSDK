import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from "typeorm";

import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

@Entity("tb_organization_unit")
export class OrganizationUnit {
  @PrimaryGeneratedColumn()
  ou_id: number;

  @Column()
  ou_name: string;

  @Column({ nullable: true })
  ou_description: string;

  @Column({ nullable: true })
  ou_email: string;

  @Column({ default: "ACTIVE" })
  ou_status: string;

  @OneToMany(() => User, (user) => user.org)
  users: User[];

  @OneToMany(() => Tenant, (tenant) => tenant.org)
  tenants: Tenant[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
