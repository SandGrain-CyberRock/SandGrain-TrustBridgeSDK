import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeviceTenantFk20260204 implements MigrationInterface {
  name = "AddDeviceTenantFk20260204";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tb_device\` ADD CONSTRAINT \`FK_tb_device_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`cr_tenant\`(\`tenant_id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tb_device\` DROP FOREIGN KEY \`FK_tb_device_tenant\``,
    );
  }
}
