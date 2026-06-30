import { MigrationInterface, QueryRunner } from "typeorm";

export class ModifyDeviceProfileColumn20260225 implements MigrationInterface {
  name = "ModifyDeviceProfileColumn20260225";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // add new profile_id column
    await queryRunner.query(
      `ALTER TABLE \`tb_device\` ADD COLUMN \`profile_id\` int NULL`,
    );

    // add foreign key constraint
    await queryRunner.query(
      `ALTER TABLE \`tb_device\` ADD CONSTRAINT \`FK_tb_device_profile\` FOREIGN KEY (\`profile_id\`) REFERENCES \`tb_device_profile\`(\`profile_id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // drop old string column if exists
    await queryRunner.query(
      `ALTER TABLE \`tb_device\` DROP COLUMN IF EXISTS \`profile\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // re-add old profile column as varchar
    await queryRunner.query(
      `ALTER TABLE \`tb_device\` ADD COLUMN \`profile\` varchar(255) NULL`,
    );

    // remove foreign key and profile_id
    await queryRunner.query(
      `ALTER TABLE \`tb_device\` DROP FOREIGN KEY \`FK_tb_device_profile\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tb_device\` DROP COLUMN \`profile_id\``,
    );
  }
}
