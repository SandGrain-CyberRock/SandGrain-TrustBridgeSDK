import { encryptedTransformer } from 'src/common/helpers';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Tenant } from './tenant.entity';

@Entity('cr_tenant_user_credential')
export class TenantUserCredential {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_user_id: string;

  @Column()
  email: string;

  @Column({ transformer: encryptedTransformer })
  password: string;

  @Column()
  cf_access_client_id: string;

  @Column({ transformer: encryptedTransformer })
  cf_access_client_secret: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
