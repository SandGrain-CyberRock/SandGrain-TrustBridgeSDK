import * as crypto from "crypto";

const ENCRYPTION_KEY = crypto.scryptSync(
    process.env.ENCRYPTION_KEY_API_KEY!,
    process.env.ENCRYPTION_SALT_API_KEY!,
    32,
);

export const isEncrypted = (value: string): boolean => {
    return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}


export const encrypt = (plainKey: string) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(plainKey, "utf8", "hex");
    encrypted += cipher.final("hex");

    return iv.toString("hex") + ":" + encrypted;
};

export const decrypt = (encryptedKey: string) => {
    const [ivHex, encryptedData] = encryptedKey.split(":");
    const iv = Buffer.from(ivHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
};