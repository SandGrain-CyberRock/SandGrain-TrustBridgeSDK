import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";

import { Category } from "./category.entity";

@Entity("tb_sub_category")
@Index(["ou_id", "category_id", "sub_category_name"])
export class SubCategory {
  @PrimaryGeneratedColumn()
  sub_category_id: number;

  @Column({ nullable: true })
  ou_id: number | null;

  @Column()
  sub_category_name: string;

  @Column()
  category_id: number;

  @ManyToOne(() => Category, (c) => c.subCategories, { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category: Category;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
