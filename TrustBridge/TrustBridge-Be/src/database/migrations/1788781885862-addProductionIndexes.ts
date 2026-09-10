import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductionIndexes1788781885862 implements MigrationInterface {
    name = 'AddProductionIndexes1788781885862'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX \`IDX_2212543831dde1ba8839b7ef2d\` ON \`tb_sub_category\` (\`ou_id\`, \`category_id\`, \`sub_category_name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_1fb95b89e9239dfe48891cc7f9\` ON \`tb_category\` (\`ou_id\`, \`category_name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_cfb5253fea9d2b401b9d7dd7f1\` ON \`tb_tag\` (\`ou_id\`, \`tag_name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_688a25b091284c761f6ce01040\` ON \`tb_device\` (\`device_name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_a00d52d78aa031ccc4060e3ad9\` ON \`tb_device\` (\`profile_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_031398bbe0fa09c03e72d63383\` ON \`tb_device\` (\`device_group_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_20096862f5b73341ee118ffc50\` ON \`tb_device\` (\`status\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_23f87f1cb2985e29ce372a80c2\` ON \`tb_device\` (\`tenant_id\`, \`status\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_e7d9306471de7d321a7c195d83\` ON \`tb_device\` (\`tenant_id\`, \`created_at\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_22188c3354dcc7671238b80160\` ON \`tb_device\` (\`is_active\`, \`status\`, \`next_lifecycle_auth_at\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_52069d87d525a1a511e0a7796a\` ON \`tb_device_group\` (\`tenant_id\`, \`created_at\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_e0cfd25ee3553c21cd57be2181\` ON \`tb_device_group\` (\`group_name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_28f43f0aab487fc670e12f69a3\` ON \`tb_user\` (\`password_reset_token\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_523f24a4ed3c67f05d53991fdb\` ON \`tb_user\` (\`invitation_token\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_90725d83827e2de93fb70670ec\` ON \`tb_user\` (\`ou_id\`, \`created_at\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_b8216eb1f85f88d7de70459c0a\` ON \`tb_user\` (\`ou_id\`, \`user_status\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_33155ea9d6c3abf674116db849\` ON \`tb_system_activity\` (\`created_at\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_21f4e3afee720f7fd73ef8734d\` ON \`tb_system_activity\` (\`device_group_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_cb471c639554c50068f7f43121\` ON \`tb_system_activity\` (\`device_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_10ad98d9a1a36fe1d03caa4488\` ON \`tb_system_activity\` (\`entity_type\`, \`created_at\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_2ff69f61e2a3d7ee4aa37b687a\` ON \`tb_device_log\` (\`device_id\`, \`process_type\`, \`attempt_number\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_0a1bd5f92fffcaf985abe2389c\` ON \`tb_device_log\` (\`device_id\`, \`step\`, \`status\`, \`created_at\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_0a1bd5f92fffcaf985abe2389c\` ON \`tb_device_log\``);
        await queryRunner.query(`DROP INDEX \`IDX_2ff69f61e2a3d7ee4aa37b687a\` ON \`tb_device_log\``);
        await queryRunner.query(`DROP INDEX \`IDX_10ad98d9a1a36fe1d03caa4488\` ON \`tb_system_activity\``);
        await queryRunner.query(`DROP INDEX \`IDX_cb471c639554c50068f7f43121\` ON \`tb_system_activity\``);
        await queryRunner.query(`DROP INDEX \`IDX_21f4e3afee720f7fd73ef8734d\` ON \`tb_system_activity\``);
        await queryRunner.query(`DROP INDEX \`IDX_33155ea9d6c3abf674116db849\` ON \`tb_system_activity\``);
        await queryRunner.query(`DROP INDEX \`IDX_b8216eb1f85f88d7de70459c0a\` ON \`tb_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_90725d83827e2de93fb70670ec\` ON \`tb_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_523f24a4ed3c67f05d53991fdb\` ON \`tb_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_28f43f0aab487fc670e12f69a3\` ON \`tb_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_e0cfd25ee3553c21cd57be2181\` ON \`tb_device_group\``);
        await queryRunner.query(`DROP INDEX \`IDX_52069d87d525a1a511e0a7796a\` ON \`tb_device_group\``);
        await queryRunner.query(`DROP INDEX \`IDX_22188c3354dcc7671238b80160\` ON \`tb_device\``);
        await queryRunner.query(`DROP INDEX \`IDX_e7d9306471de7d321a7c195d83\` ON \`tb_device\``);
        await queryRunner.query(`DROP INDEX \`IDX_23f87f1cb2985e29ce372a80c2\` ON \`tb_device\``);
        await queryRunner.query(`DROP INDEX \`IDX_20096862f5b73341ee118ffc50\` ON \`tb_device\``);
        await queryRunner.query(`DROP INDEX \`IDX_031398bbe0fa09c03e72d63383\` ON \`tb_device\``);
        await queryRunner.query(`DROP INDEX \`IDX_a00d52d78aa031ccc4060e3ad9\` ON \`tb_device\``);
        await queryRunner.query(`DROP INDEX \`IDX_688a25b091284c761f6ce01040\` ON \`tb_device\``);
        await queryRunner.query(`DROP INDEX \`IDX_cfb5253fea9d2b401b9d7dd7f1\` ON \`tb_tag\``);
        await queryRunner.query(`DROP INDEX \`IDX_1fb95b89e9239dfe48891cc7f9\` ON \`tb_category\``);
        await queryRunner.query(`DROP INDEX \`IDX_2212543831dde1ba8839b7ef2d\` ON \`tb_sub_category\``);
    }

}
