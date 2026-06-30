import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from "typeorm";
import { RolePermission } from "./role-permission.entity";
import { UserRole } from "./user-role.entity";

@Entity("roles")
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  label: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ nullable: true })
  icon_color: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ default: "ACTIVE" })
  status: string;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions: RolePermission[];

  @OneToMany(() => UserRole, (ur) => ur.role)
  userRoles: UserRole[];

  @CreateDateColumn()
  created_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
