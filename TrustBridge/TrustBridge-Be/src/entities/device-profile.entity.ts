import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from "typeorm";
import { Category } from "./category.entity";
import { SubCategory } from "./sub-category.entity";
import { Tag } from "./tag.entity";
import { ProfileDefaultParam } from "./profile-default-param.entity";

@Entity("tb_device_profile")
export class DeviceProfile {
  @PrimaryGeneratedColumn()
  profile_id: number;

  @Column()
  ou_id: number;

  @Column()
  profile_name: string;

  @Column({ nullable: true })
  category_id: number;

  @ManyToOne(() => Category, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category: Category;

  @Column({ nullable: true })
  sub_category_id: number;

  @ManyToOne(() => SubCategory, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "sub_category_id" })
  subCategory: SubCategory;

  @ManyToMany(() => Tag)
  @JoinTable({
    name: "tb_profile_tag",
    joinColumn: { name: "profile_id", referencedColumnName: "profile_id" },
    inverseJoinColumn: { name: "tag_id", referencedColumnName: "tag_id" },
  })
  tags: Tag[];

  @Column({ default: "ACTIVE" })
  status: string;

  @Column({ default: false })
  is_default: boolean;

  // Profile Params - now merged directly into device_profile table
  @Column({ nullable: true })
  mqtt_server: string;

  @Column({ nullable: true })
  mqtt_username: string;

  @Column({ nullable: true })
  mqtt_password: string;

  @Column({ default: "1", length: 10 })
  qos_level: string;

  @Column({ default: "TLS 1.2", length: 20 })
  tls_type: string;

  @Column({ default: "auto", length: 20 })
  claim_type: string;

  // for now just one attempt ignoring this for now  
  @Column({ default: 60 })
  auth_frequency: number;

  // this we will just keep one attempt for now
  @Column({ default: 5 })
  max_failed_auth_attempts: number;

  // Keep profile_param_id for backward compatibility
  @Column({ nullable: true })
  profile_param_id: number;

  @ManyToOne(() => ProfileDefaultParam, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "profile_param_id" })
  profileParam: ProfileDefaultParam;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
