import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserNameCompanyTitle20260204 implements MigrationInterface {
  name = "AddUserNameCompanyTitle20260204";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tb_user\` ADD COLUMN \`name\` VARCHAR(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tb_user\` ADD COLUMN \`company_title\` VARCHAR(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tb_user\` DROP COLUMN \`company_title\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tb_user\` DROP COLUMN \`name\``,
    );
  }
}
