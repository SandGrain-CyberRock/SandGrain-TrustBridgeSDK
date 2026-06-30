import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";

@Entity("tb_tag")
export class Tag {
  @PrimaryGeneratedColumn()
  tag_id: number;

  @Column({ nullable: true })
  ou_id: number | null;

  @Column()
  tag_name: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
