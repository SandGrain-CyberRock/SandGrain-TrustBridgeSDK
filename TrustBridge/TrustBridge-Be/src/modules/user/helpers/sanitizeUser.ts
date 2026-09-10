import { User } from "src/entities/user.entity"

export const sanitizeUser = (
    user: User,
): Omit<
    User,
    | "password_hash"
    | "password_reset_token"
    | "password_reset_expires"
    | "invitation_token"
    | "invitation_expires"
> => {
    const {
        password_hash,
        password_reset_token,
        password_reset_expires,
        invitation_token,
        invitation_expires,
        ...sanitized
    } = user;
    return sanitized as any;
}