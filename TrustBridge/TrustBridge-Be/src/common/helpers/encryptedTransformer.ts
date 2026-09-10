import { ValueTransformer } from "typeorm";

import { encrypt, isEncrypted, decrypt } from "../crypto";

export const encryptedTransformer: ValueTransformer = {
    to: (value?: string) => {
        if (value == null) return value;
        return isEncrypted(value) ? value : encrypt(value);
    },
    from: (value?: string) => {
        if (value == null) return value;
        return isEncrypted(value) ? decrypt(value) : value;
    },
};