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
        id: number;
        password: string;
        cf_access_client_secret: string;
    }[] = await dataSource.query(
        `SELECT id, password, cf_access_client_secret FROM cr_tenant_user_credential`,
    );

    console.log(`Found ${rows.length} rows.`);

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const needsPassword = row.password != null && !isEncrypted(row.password);
        const needsSecret =
            row.cf_access_client_secret != null && !isEncrypted(row.cf_access_client_secret);

        if (!needsPassword && !needsSecret) {
            skipped++;
            continue;
        }

        const newPassword = needsPassword ? encrypt(row.password) : row.password;
        const newSecret = needsSecret
            ? encrypt(row.cf_access_client_secret)
            : row.cf_access_client_secret;

        await dataSource.query(
            `UPDATE cr_tenant_user_credential SET password = ?, cf_access_client_secret = ? WHERE id = ?`,
            [newPassword, newSecret, row.id],
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