import { User } from "src/entities/user.entity";

export const mapUserToExportRow = (user: User): any => {
    return {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        name: user.name || "",
        company_title: user.company_title || "",
        organization: user.org?.ou_name || "",
        roles: user.userRoles?.map((ur) => ur.role?.name).join(", ") || "",
        status: user.user_status,
        created_at: user.created_at?.toISOString() || "",
        updated_at: user.updated_at?.toISOString() || "",
    };
}