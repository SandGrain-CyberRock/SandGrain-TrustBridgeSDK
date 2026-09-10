import { DataSource } from 'typeorm';

import { encrypt } from '../common/crypto';

function isEncrypted(value: string): boolean {
    return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}

async function run() {
    const dataSource = new DataSource({
        type: 'mysql',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 3306),
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });

    await dataSource.initialize();

    const rows: {
        device_group_id: number;
        password: string;
    }[] = await dataSource.query(
        `SELECT device_group_id, password FROM tb_device_group`,
    );

    console.log(`Found ${rows.length} rows.`);

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const needsPassword = row.password != null && !isEncrypted(row.password);

        if (!needsPassword) {
            skipped++;
            continue;
        }

        const newPassword = encrypt(row.password);

        await dataSource.query(
            `UPDATE tb_device_group SET password = ? WHERE device_group_id = ?`,
            [newPassword, row.device_group_id],
        );
        updated++;
    }

    console.log(`Updated: ${updated}, already encrypted/skipped: ${skipped}`);
    await dataSource.destroy();
}

run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});