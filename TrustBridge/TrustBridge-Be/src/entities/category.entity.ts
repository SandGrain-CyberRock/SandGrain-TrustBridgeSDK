import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from "typeorm";
import { SubCategory } from "./sub-category.entity";

@Entity("tb_category")
export class Category {
  @PrimaryGeneratedColumn()
  category_id: number;

  @Column({ nullable: true })
  ou_id: number | null;

  @Column()
  category_name: string;

  @OneToMany(() => SubCategory, (sc) => sc.category)
  subCategories: SubCategory[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
